import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten gratis yang fokus pada percakapan singkat, ide lagu, pembuatan lirik original, revisi lirik, judul, genre, suasana, prompt musik, dan bantuan penggunaan Studio. Jawab dalam bahasa pengguna, utamakan bahasa Indonesia jika pengguna memakai bahasa Indonesia. Jawaban harus langsung, praktis, dan tidak bertele-tele.

Jika pengguna meminta LIRIK LAGU, buat lirik original dan susun sangat rapi agar siap disalin ke Studio. Gunakan format teks berikut tanpa Markdown tebal: satu judul, lalu bagian-bagian lagu dengan label [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro] sesuai kebutuhan. Beri satu baris kosong di antara setiap bagian dan tulis satu baris lirik per baris. Jangan menaruh beberapa bagian dalam satu paragraf. Jika pengguna hanya meminta jawaban singkat, jawab singkat dan langsung.

Anda boleh membantu membuat lirik original dari tema yang diberikan pengguna. Jangan menyalin atau melanjutkan lirik berhak cipta yang diminta pengguna; tawarkan lirik original dengan tema atau nuansa yang serupa secara umum.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri di dalam Asisten. Jangan meminta pengguna login, jangan meminta password, API key, token, atau data rahasia. Jangan mengklaim telah melakukan tindakan yang sebenarnya tidak dilakukan.
Asisten ini hanya untuk teks. Jangan menghasilkan audio, jangan menjalankan proses pembuatan musik, dan jangan mengklaim telah membuat file musik. Jika pengguna ingin membuat audio, arahkan mereka untuk meneruskan hasil teks ke Studio Musik.`;

// Hanya memakai model Gemini yang mempunyai Free Tier.
// Tidak ada model berbayar/fallback berbayar dan tidak ada pemotongan kredit Salvian.
// Jika satu model sedang penuh, rate-limited, tidak tersedia, atau error server,
// jalur panggilan langsung pindah ke model Gemini gratis berikutnya.
const GEMINI_FREE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
] as const;

const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1600;
const MAX_MESSAGE_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 550;
const REQUEST_TIMEOUT_MS = 7000;

type ChatMessage = { role: "user" | "assistant"; content: string };
type RawChatMessage = { role?: unknown; content?: unknown };

type GeminiResult = {
  response: Response;
  data: any;
  model: string;
};

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

function shouldTryNextModel(status: number) {
  // Model penuh/tidak tersedia/rate limit/gangguan provider -> failover.
  return status === 404 || status === 408 || status === 409 || status === 429 || status >= 500;
}

function classifyGeminiError(status: number) {
  if (status === 400) return "Permintaan Asisten AI tidak valid.";
  if (status === 401 || status === 403) {
    return "Mesin Asisten AI belum memiliki akses Gemini yang valid. Tidak ada billing atau kredit Salvian yang digunakan.";
  }
  if (status === 404 || status === 408 || status === 409 || status === 429 || status >= 500) {
    return "Semua mesin Gemini gratis sedang penuh atau mengalami gangguan sementara. Coba kirim lagi sebentar.";
  }
  return "Asisten AI belum dapat merespons saat ini. Coba lagi sebentar.";
}

async function callGemini(
  apiKey: string,
  model: string,
  contents: ReturnType<typeof toGeminiContents>
): Promise<GeminiResult> {
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
    return { response, data, model };
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Mesin Gemini Gratis belum aktif di server." },
        { status: 503 }
      );
    }

    const contents = toGeminiContents(normalizeHistory(history, message));
    let lastResult: GeminiResult | null = null;

    for (const model of GEMINI_FREE_MODELS) {
      let result: GeminiResult;

      try {
        result = await callGemini(apiKey, model, contents);
      } catch (error: any) {
        console.warn("SALVIAN MUSIC assistant Gemini transport failure", {
          model,
          name: error?.name,
        });
        if (error?.name === "AbortError") continue;
        continue;
      }

      lastResult = result;

      if (result.response.ok) {
        const answer = extractAnswer(result.data);

        if (answer) {
          return NextResponse.json({
            answer,
            engine: "Gemini Free",
          });
        }

        // Respons kosong juga dianggap kegagalan mesin dan langsung failover.
        continue;
      }

      console.warn("SALVIAN MUSIC assistant Gemini model failed", {
        model,
        status: result.response.status,
        providerStatus: result.data?.error?.status || undefined,
      });

      if (!shouldTryNextModel(result.response.status)) break;
    }

    const status = lastResult?.response.status ?? 503;
    return NextResponse.json(
      {
        error: classifyGeminiError(status),
        engine: "Gemini Free",
      },
      {
        status: status >= 400 && status < 600 ? status : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error: any) {
    console.error("SALVIAN AI MUSIC assistant error", {
      name: error?.name,
      message: error?.message,
    });

    return NextResponse.json(
      { error: "Terjadi kesalahan saat menghubungkan ke mesin Gemini Gratis." },
      { status: 500 }
    );
  }
}
