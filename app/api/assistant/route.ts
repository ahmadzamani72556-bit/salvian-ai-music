import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten gratis yang fokus pada percakapan, ide lagu, pembuatan lirik original, revisi lirik, judul, genre, suasana, prompt musik, dan bantuan penggunaan Studio. Jawab dalam bahasa pengguna, utamakan bahasa Indonesia jika pengguna memakai bahasa Indonesia. Jawaban harus langsung, praktis, dan tidak bertele-tele.

Jika pengguna meminta LIRIK LAGU, buat lirik original dan susun sangat rapi agar siap disalin ke Studio. Gunakan format teks berikut tanpa Markdown tebal: satu judul, lalu bagian-bagian lagu dengan label [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro] sesuai kebutuhan. Beri satu baris kosong di antara setiap bagian dan tulis satu baris lirik per baris. Jangan menaruh beberapa bagian dalam satu paragraf. Jika pengguna hanya meminta jawaban singkat, jawab singkat dan langsung.

Anda boleh membantu membuat lirik original dari tema yang diberikan pengguna. Jangan menyalin atau melanjutkan lirik berhak cipta yang diminta pengguna; tawarkan lirik original dengan tema atau nuansa yang serupa secara umum.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri di dalam Asisten. Jangan meminta pengguna login, jangan meminta password, API key, token, atau data rahasia. Jangan mengklaim telah melakukan tindakan yang sebenarnya tidak dilakukan.
Asisten ini hanya untuk teks. Jangan menghasilkan audio, jangan menjalankan proses pembuatan musik, dan jangan mengklaim telah membuat file musik. Jika pengguna ingin membuat audio, arahkan mereka untuk meneruskan hasil teks ke Studio Musik.`;

// CHAT-ONLY. Primary path follows the already-active Creator Gemini Free assistant.
// If Creator's free quota is temporarily exhausted (429), Music uses its own
// existing GEMINI_API_KEY only with Gemini models that have a Free Tier.
// No paid provider/model is ever selected and the music/Studio flow is untouched.
const CREATOR_ASSISTANT_URL = "https://creator.sovira.id/api/assistant";
const DIRECT_FREE_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"] as const;
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1600;
const MAX_MESSAGE_CHARS = 6000;
const REQUEST_TIMEOUT_MS = 12000;

type ChatMessage = { role: "user" | "assistant"; content: string };
type RawChatMessage = { role?: unknown; content?: unknown };

function normalizeHistory(history: unknown[], message: string): ChatMessage[] {
  const safe: ChatMessage[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const value = item as RawChatMessage;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") continue;
    safe.push({ role: value.role, content: value.content.slice(0, MAX_HISTORY_CHARS) });
  }
  safe.push({ role: "user", content: message });
  return safe.slice(-MAX_HISTORY_MESSAGES);
}

function classifyCreatorError(status: number, data: any) {
  const message = String(data?.error || data?.message || "");
  if (status === 429) return "Batas penggunaan Gemini Gratis sedang tercapai. Coba lagi sebentar.";
  if (status === 408 || status === 504) return "Asisten AI terlalu lama merespons. Coba lagi.";
  if (status === 502 || status === 503) return "Gemini Gratis pada Asisten AI sedang tidak tersedia sementara. Coba lagi sebentar.";
  return message ? message.slice(0, 240) : `Layanan Asisten AI bermasalah (HTTP ${status}).`;
}

async function callCreatorAssistant(message: string, history: ChatMessage[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(CREATOR_ASSISTANT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ message, history, systemPrompt: SYSTEM_PROMPT }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function extractAnswer(data: any): string {
  const answer = typeof data?.answer === "string" ? data.answer.trim() : "";
  if (answer) return answer;
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (text) return text;
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const candidateText = candidates
    .flatMap((candidate: any) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part: any) => typeof part?.text === "string" ? part.text : "")
    .join("\n")
    .trim();
  return candidateText;
}

async function callDirectGeminiFree(message: string, history: ChatMessage[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, status: 503, error: "Gemini Gratis belum dikonfigurasi pada Music." };

  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  let lastStatus = 503;
  let lastError = "Gemini Gratis tidak tersedia sementara.";

  for (const model of DIRECT_FREE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      const answer = extractAnswer(data);
      if (response.ok && answer) return { ok: true as const, answer, model };

      lastStatus = response.status;
      lastError = String(data?.error?.message || data?.error || "").slice(0, 240) || lastError;
      if (response.status !== 429 && response.status !== 500 && response.status !== 502 && response.status !== 503 && response.status !== 504) break;
    } catch (error: any) {
      lastStatus = error?.name === "AbortError" ? 504 : 503;
      lastError = error?.name === "AbortError" ? "Asisten AI terlalu lama merespons. Coba lagi." : lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false as const, status: lastStatus, error: lastError };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: "Pesan terlalu panjang. Ringkas pertanyaan Anda agar Asisten Gratis dapat menjawab lebih cepat." }, { status: 400 });
    }

    const safeHistory = normalizeHistory(history, message).slice(0, -1);

    try {
      const creator = await callCreatorAssistant(message, safeHistory);
      if (creator.response.ok) {
        const answer = extractAnswer(creator.data);
        if (answer) return NextResponse.json({ answer, free: true, source: "salvian-ai-creator" });
        return NextResponse.json({ error: "Gemini Gratis selesai memproses tetapi tidak menghasilkan jawaban." }, { status: 502 });
      }

      // Only a Creator free-quota/rate-limit response may activate the direct
      // Music fallback. It is still restricted to Gemini Free models.
      if (creator.response.status === 429) {
        const fallback = await callDirectGeminiFree(message, safeHistory);
        if (fallback.ok) {
          return NextResponse.json({ answer: fallback.answer, free: true, source: "gemini-free-fallback", model: fallback.model });
        }
        return NextResponse.json({ error: "Batas penggunaan Gemini Gratis sedang tercapai. Coba lagi sebentar." }, { status: 429 });
      }

      return NextResponse.json({ error: classifyCreatorError(creator.response.status, creator.data) }, {
        status: creator.response.status >= 400 && creator.response.status < 600 ? creator.response.status : 502,
      });
    } catch (error: any) {
      console.error("SALVIAN MUSIC assistant -> Creator Gemini Free transport error", {
        name: error?.name,
        message: error?.message,
      });
      if (error?.name === "AbortError") {
        return NextResponse.json({ error: "Asisten AI terlalu lama merespons. Coba lagi." }, { status: 504 });
      }
      return NextResponse.json({ error: "Gemini Gratis pada Asisten AI sedang tidak tersedia sementara. Coba lagi sebentar." }, { status: 503 });
    }
  } catch (error: any) {
    console.error("SALVIAN AI MUSIC assistant error", { name: error?.name, message: error?.message });
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI Gratis." }, { status: 500 });
  }
}
