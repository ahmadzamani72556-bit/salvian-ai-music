import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten gratis yang fokus pada percakapan, ide lagu, pembuatan lirik original, revisi lirik, judul, genre, suasana, prompt musik, dan bantuan penggunaan Studio. Jawab dalam bahasa pengguna, utamakan bahasa Indonesia jika pengguna memakai bahasa Indonesia. Jawaban harus langsung, praktis, dan tidak bertele-tele.

Jika pengguna meminta LIRIK LAGU, buat lirik original dan susun sangat rapi agar siap disalin ke Studio. Gunakan format teks berikut tanpa Markdown tebal: satu judul, lalu bagian-bagian lagu dengan label [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro] sesuai kebutuhan. Beri satu baris kosong di antara setiap bagian dan tulis satu baris lirik per baris. Jangan menaruh beberapa bagian dalam satu paragraf. Jika pengguna hanya meminta jawaban singkat, jawab singkat dan langsung.

Anda boleh membantu membuat lirik original dari tema yang diberikan pengguna. Jangan menyalin atau melanjutkan lirik berhak cipta yang diminta pengguna; tawarkan lirik original dengan tema atau nuansa yang serupa secara umum.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri di dalam Asisten. Jangan meminta pengguna login, jangan meminta password, API key, token, atau data rahasia. Jangan mengklaim telah melakukan tindakan yang sebenarnya tidak dilakukan.
Asisten ini hanya untuk teks. Jangan menghasilkan audio, jangan menjalankan proses pembuatan musik, dan jangan mengklaim telah membuat file musik. Jika pengguna ingin membuat audio, arahkan mereka untuk meneruskan hasil teks ke Studio Musik.`;

// CHAT ONLY. Never touch the music-generation routes.
const CREATOR_ASSISTANT_URL = "https://creator.sovira.id/api/assistant";
// Gemini models below all have a Gemini API Free Tier. No paid model/provider is used.
// Newer Free models are tried before legacy 2.5 models whose access can be restricted.
const FREE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1600;
const MAX_MESSAGE_CHARS = 6000;
const MAX_REQUEST_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 12000;

type ChatMessage = { role: "user" | "assistant"; content: string };

type RawChatMessage = { role?: unknown; content?: unknown };

function normalizeHistory(history: unknown[], message: string): ChatMessage[] {
  const safe: ChatMessage[] = [];
  for (const item of history.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const value = item as RawChatMessage;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") continue;
    safe.push({ role: value.role, content: value.content.slice(0, MAX_HISTORY_CHARS) });
  }
  safe.push({ role: "user", content: message });
  return safe.slice(-MAX_HISTORY_MESSAGES);
}

function extractAnswer(data: any): string {
  const answer = typeof data?.answer === "string" ? data.answer.trim() : "";
  if (answer) return answer;
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (text) return text;
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  return candidates
    .flatMap((candidate: any) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part: any) => typeof part?.text === "string" ? part.text : "")
    .join("\n")
    .trim();
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function shouldUseFreeFallback(status: number, data: any) {
  const raw = JSON.stringify(data ?? {}).toLowerCase();
  return status === 429 || status === 502 || status === 503 || status === 504 ||
    raw.includes("model") && (raw.includes("not available") || raw.includes("tidak tersedia") || raw.includes("unavailable"));
}

function shouldTryNextFreeModel(status: number, data: any) {
  const raw = JSON.stringify(data ?? {}).toLowerCase();
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if ([400, 403, 404].includes(status)) {
    return raw.includes("model") || raw.includes("not found") || raw.includes("not supported") ||
      raw.includes("permission") || raw.includes("access") || raw.includes("unavailable");
  }
  return false;
}

async function callDirectGeminiFree(message: string, history: ChatMessage[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, status: 503, error: "Gemini Gratis belum dikonfigurasi pada Music." };

  // The current user message MUST be part of the Gemini contents. The previous
  // implementation sent only history, so the direct Free fallback could not answer
  // a new chat message even when the Gemini key and model were available.
  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  let lastStatus = 503;
  let lastError = "Gemini Gratis tidak tersedia sementara.";

  for (const model of FREE_MODELS) {
    try {
      const { response, data } = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 1200 },
        },
        { "x-goog-api-key": apiKey },
      );

      const answer = extractAnswer(data);
      if (response.ok && answer) return { ok: true as const, answer, model };

      lastStatus = response.status;
      lastError = String(data?.error?.message || data?.error || lastError).slice(0, 240);
      if (!shouldTryNextFreeModel(response.status, data)) break;
    } catch (error: any) {
      lastStatus = error?.name === "AbortError" ? 504 : 503;
      lastError = error?.name === "AbortError" ? "Asisten AI terlalu lama merespons." : lastError;
      // A transport/timeout problem on one Free model must not stop the next Free model.
      continue;
    }
  }

  return { ok: false as const, status: lastStatus, error: lastError };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      return NextResponse.json({ error: "Format permintaan tidak didukung." }, { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: "Pesan terlalu panjang. Ringkas pertanyaan Anda agar Asisten Gratis dapat menjawab lebih cepat." }, { status: 400 });
    }

    const safeHistory = normalizeHistory(history, message).slice(0, -1);

    // First, use the exact Creator Gemini Free assistant flow that is already active.
    try {
      const creator = await postJson(CREATOR_ASSISTANT_URL, {
        message,
        history: safeHistory,
        systemPrompt: SYSTEM_PROMPT,
      });
      const creatorAnswer = extractAnswer(creator.data);
      if (creator.response.ok && creatorAnswer) {
        return NextResponse.json({ answer: creatorAnswer, free: true, source: "salvian-ai-creator" });
      }

      // If Creator says its Free model is unavailable, rate-limited, or temporarily
      // unavailable, continue through Gemini Free only. This also covers the prior
      // broken case where Creator returned HTTP 200 with an error payload.
      if (shouldUseFreeFallback(creator.response.status, creator.data)) {
        const fallback = await callDirectGeminiFree(message, safeHistory);
        if (fallback.ok) {
          return NextResponse.json({ answer: fallback.answer, free: true, source: "gemini-free-fallback", model: fallback.model });
        }
        // Do not impose an application-side quota/limit message. If every Free
        // upstream is unavailable, report availability without pretending the app
        // itself has a daily/session/message cap.
        return NextResponse.json({ error: "Asisten AI Gratis sedang tidak dapat merespons. Coba kirim lagi." }, { status: 503 });
      }

      return NextResponse.json({ error: "Gemini Gratis pada Asisten AI sedang tidak tersedia sementara. Coba kirim lagi." }, { status: 503 });
    } catch (error: any) {
      // Creator transport failure must never cause a paid fallback. Try Gemini Free only.
      const fallback = await callDirectGeminiFree(message, safeHistory).catch(() => null);
      if (fallback?.ok) {
        return NextResponse.json({ answer: fallback.answer, free: true, source: "gemini-free-fallback", model: fallback.model });
      }
      return NextResponse.json({ error: error?.name === "AbortError" ? "Asisten AI terlalu lama merespons. Coba lagi." : "Gemini Gratis pada Asisten AI sedang tidak tersedia sementara. Coba kirim lagi." }, { status: 503 });
    }
  } catch (error: any) {
    console.error("SALVIAN AI MUSIC assistant error", { name: error?.name, message: error?.message });
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI Gratis." }, { status: 500 });
  }
}
