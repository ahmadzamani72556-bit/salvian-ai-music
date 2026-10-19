import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 25;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten percakapan serbaguna yang membantu pengguna dengan bahasa Indonesia yang jelas, ramah, dan praktis. Anda dapat menjawab pertanyaan umum, menjelaskan konsep, membantu menulis, merencanakan ide, serta membantu pembuatan lagu, lirik original, genre, vokal, prompt, model, hasil lagu, Library, dan pemecahan masalah Studio. Jangan membatasi jawaban hanya pada fitur musik; tanggapi pertanyaan pengguna sesuai konteks dan kemampuan Anda.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri. Jangan meminta pengguna login, jangan membahas saldo/kredit/pembayaran, dan jangan mengarahkan pengguna ke halaman akun.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah akun atau data pengguna secara langsung. Jangan meniru lirik berhak cipta atau mengklaim mengeksekusi tindakan yang tidak benar-benar dilakukan.`;

// Free-tier Gemini model. This route does not call OpenAI.
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1800;
const MAX_OUTPUT_TOKENS = 650;
const REQUEST_TIMEOUT_MS = 15000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function normalizeHistory(history: unknown[], message: string): ChatMessage[] {
  const safe = history
    .filter((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const value = item as { role?: unknown; content?: unknown };
      return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
    })
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item: { role: "user" | "assistant"; content: string }) => ({
      role: item.role,
      content: item.content.slice(0, MAX_HISTORY_CHARS),
    }));

  safe.push({ role: "user", content: message });
  return safe;
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
  if (status === 429) return "Batas penggunaan gratis Gemini sedang tercapai. Coba lagi beberapa saat lagi.";
  if (status === 408 || status === 504) return "Asisten AI terlalu lama merespons. Coba lagi.";

  return `Layanan Asisten AI bermasalah (HTTP ${status}${providerStatus ? `, ${providerStatus}` : ""}${message ? `: ${message.slice(0, 160)}` : ""}).`;
}

async function callGemini(apiKey: string, contents: ReturnType<typeof toGeminiContents>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.7,
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    }
    if (message.length > 12000) {
      return NextResponse.json({ error: "Pesan terlalu panjang untuk satu permintaan. Bagi menjadi beberapa pesan." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Asisten AI belum aktif: GEMINI_API_KEY belum tersedia di server." }, { status: 503 });
    }

    const contents = toGeminiContents(normalizeHistory(history, message));
    const result = await callGemini(apiKey, contents);

    if (!result.response.ok) {
      console.error("SALVIAN MUSIC assistant Gemini error", {
        status: result.response.status,
        providerStatus: result.data?.error?.status || undefined,
      });

      return NextResponse.json(
        {
          error: classifyGeminiError(result.response.status, result.data),
          providerCode: result.data?.error?.status || undefined,
        },
        { status: result.response.status >= 400 && result.response.status < 600 ? result.response.status : 502 }
      );
    }

    const answer = Array.isArray(result.data?.candidates?.[0]?.content?.parts)
      ? result.data.candidates[0].content.parts.map((part: { text?: string }) => part.text || "").join("").trim()
      : "";

    if (!answer) {
      return NextResponse.json({ error: "Asisten AI selesai memproses tetapi tidak menghasilkan jawaban." }, { status: 502 });
    }

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("SALVIAN AI MUSIC assistant error", {
      name: error?.name,
      message: error?.message,
    });

    if (error?.name === "AbortError") {
      return NextResponse.json({ error: "Asisten AI terlalu lama merespons. Coba lagi." }, { status: 504 });
    }

    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
