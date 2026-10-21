import { NextResponse } from "next/server";
import { refundAssistantDailyRequest, reserveAssistantDailyRequest, ASSISTANT_DAILY_LIMIT } from "../../../lib/assistant-daily-limit";

export const runtime = "nodejs";
export const maxDuration = 20;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten gratis yang fokus pada percakapan singkat, ide lagu, pembuatan lirik original, revisi lirik, judul, genre, suasana, prompt musik, dan bantuan penggunaan Studio. Jawab dalam bahasa pengguna, utamakan bahasa Indonesia jika pengguna memakai bahasa Indonesia. Jawaban harus langsung, praktis, dan tidak bertele-tele.

Jika pengguna meminta LIRIK LAGU, buat lirik original dan susun sangat rapi agar siap disalin ke Studio. Gunakan format teks berikut tanpa Markdown tebal: satu judul, lalu bagian-bagian lagu dengan label [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro] sesuai kebutuhan. Beri satu baris kosong di antara setiap bagian dan tulis satu baris lirik per baris. Jangan menaruh beberapa bagian dalam satu paragraf. Jika pengguna hanya meminta jawaban singkat, jawab singkat dan langsung.

Anda boleh membantu membuat lirik original dari tema yang diberikan pengguna. Jangan menyalin atau melanjutkan lirik berhak cipta yang diminta pengguna; tawarkan lirik original dengan tema atau nuansa yang serupa secara umum.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri di dalam Asisten. Jangan meminta pengguna login, jangan meminta password, API key, token, atau data rahasia. Jangan mengklaim telah melakukan tindakan yang sebenarnya tidak dilakukan.
Asisten ini hanya untuk teks. Jangan menghasilkan audio, jangan menjalankan proses pembuatan musik, dan jangan mengklaim telah membuat file musik. Jika pengguna ingin membuat audio, arahkan mereka untuk meneruskan hasil teks ke Studio Musik.`;

// Jalur gratis khusus Asisten: teks pendek, lirik, ide, dan bantuan Studio.
// Batas aplikasi ini terpisah dari billing/kredit SALVIAN AI dan tidak memotong kredit.
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1600;
const MAX_MESSAGE_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 550;
const REQUEST_TIMEOUT_MS = 9000;

type ChatMessage = { role: "user" | "assistant"; content: string };
type RawChatMessage = { role?: unknown; content?: unknown };

function normalizeHistory(history: unknown[], message: string): ChatMessage[] {
  const safe: ChatMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const value = item as RawChatMessage;

    if (
      (value.role !== "user" && value.role !== "assistant") ||
      typeof value.content !== "string"
    ) {
      continue;
    }

    safe.push({
      role: value.role,
      content: value.content.slice(0, MAX_HISTORY_CHARS),
    });
  }

  safe.push({ role: "user", content: message });
  return safe.slice(-MAX_HISTORY_MESSAGES);
}

function toGeminiContents(history: ChatMessage[]) {
  return history.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));
}

function classifyGeminiError(status: number, data: any) {
  const providerStatus = String(data?.error?.status || "").toUpperCase();
  const message = String(data?.error?.message || "");

  if (status === 400) return "Permintaan Asisten AI tidak valid.";
  if (status === 401 || status === 403) return "Kunci Gemini untuk Asisten AI tidak valid atau tidak memiliki akses.";
  if (status === 404) return "Model Gemini Asisten AI tidak tersedia.";
  if (status === 429) return "Asisten gratis sedang mencapai batas penggunaan. Coba lagi sebentar.";
  if (status === 408 || status === 504) return "Asisten AI terlalu lama merespons. Coba lagi.";

  return `Layanan Asisten AI bermasalah (HTTP ${status}${providerStatus ? `, ${providerStatus}` : ""}${message ? `: ${message.slice(0, 160)}` : ""}).`;
}

async function callGemini(
  apiKey: string,
  model: string,
  contents: ReturnType<typeof toGeminiContents>
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function extractAnswer(data: any): string {
  if (!Array.isArray(data?.candidates?.[0]?.content?.parts)) return "";
  return data.candidates[0].content.parts
    .map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
}

export async function POST(request: Request) {
  let quotaKey: string | null = null;
  let quotaReserved = false;

  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json(
        { error: "Tulis pertanyaan Anda terlebih dahulu." },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: "Pesan terlalu panjang. Ringkas pertanyaan Anda agar Asisten Gratis dapat menjawab lebih cepat." },
        { status: 400 }
      );
    }

    // Pengaman gratis harian: 15 permintaan per hari untuk setiap akun.
    // Tidak terhubung ke billing/kredit dan tidak melakukan pemotongan apa pun.
    const quota = await reserveAssistantDailyRequest(request);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Batas gratis harian Asisten AI sudah habis (${ASSISTANT_DAILY_LIMIT} chat/hari). Coba lagi besok.`,
          code: "DAILY_FREE_LIMIT_REACHED",
          remaining: 0,
        },
        { status: 429 }
      );
    }
    quotaKey = quota.key;
    quotaReserved = true;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      await refundAssistantDailyRequest(quotaKey);
      quotaReserved = false;
      return NextResponse.json(
        { error: "Asisten AI belum aktif: GEMINI_API_KEY belum tersedia di server." },
        { status: 503 }
      );
    }

    const contents = toGeminiContents(normalizeHistory(history, message));

    let result = await callGemini(apiKey, PRIMARY_MODEL, contents);

    if (!result.response.ok && result.response.status === 404) {
      result = await callGemini(apiKey, FALLBACK_MODEL, contents);
    }

    if (!result.response.ok) {
      console.error("SALVIAN MUSIC assistant Gemini error", {
        status: result.response.status,
        providerStatus: result.data?.error?.status || undefined,
      });

      if (quotaKey) {
        await refundAssistantDailyRequest(quotaKey);
        quotaReserved = false;
      }

      return NextResponse.json(
        {
          error: classifyGeminiError(result.response.status, result.data),
          providerCode: result.data?.error?.status || undefined,
        },
        {
          status:
            result.response.status >= 400 && result.response.status < 600
              ? result.response.status
              : 502,
        }
      );
    }

    const answer = extractAnswer(result.data);

    if (!answer) {
      if (quotaKey) {
        await refundAssistantDailyRequest(quotaKey);
        quotaReserved = false;
      }
      return NextResponse.json(
        { error: "Asisten AI selesai memproses tetapi tidak menghasilkan jawaban." },
        { status: 502 }
      );
    }

    quotaReserved = false;
    return NextResponse.json({ answer, remaining: quota?.remaining ?? 0 });
  } catch (error: any) {
    if (quotaReserved && quotaKey) {
      try {
        await refundAssistantDailyRequest(quotaKey);
      } catch (refundError) {
        console.error("SALVIAN MUSIC assistant quota refund error", refundError);
      }
    }

    console.error("SALVIAN AI MUSIC assistant error", {
      name: error?.name,
      message: error?.message,
    });

    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: "Asisten AI terlalu lama merespons. Coba lagi." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." },
      { status: 500 }
    );
  }
}
