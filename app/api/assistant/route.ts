import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 25;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten percakapan serbaguna yang membantu pengguna dengan bahasa Indonesia yang jelas, ramah, dan praktis. Anda dapat menjawab pertanyaan umum, menjelaskan konsep, membantu menulis, merencanakan ide, serta membantu pembuatan lagu, lirik original, genre, vokal, prompt, model, hasil lagu, Library, dan pemecahan masalah Studio. Jangan membatasi jawaban hanya pada fitur musik; tanggapi pertanyaan pengguna sesuai konteks dan kemampuan Anda.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri. Jangan meminta pengguna login, jangan membahas saldo/kredit/pembayaran, dan jangan mengarahkan pengguna ke halaman akun.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah akun atau data pengguna secara langsung. Jangan meniru lirik berhak cipta atau mengklaim mengeksekusi tindakan yang tidak benar-benar dilakukan.`;

const FAST_MODEL = "gpt-4.1-mini";
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 1800;
const MAX_OUTPUT_TOKENS = 650;

type ChatMessage = { role: "user" | "assistant"; content: string };

function providerInfo(error: any) {
  return {
    code: String(error?.code || "").toLowerCase(),
    type: String(error?.type || "").toLowerCase(),
    requestId: String(error?.request_id || error?.headers?.["x-request-id"] || ""),
  };
}

function classifyOpenAIError(status: number, error: any) {
  const { code, type } = providerInfo(error);
  if (status === 401) return "API AI di server tidak valid atau tidak dapat digunakan.";
  if (status === 404) return "Model AI Asisten tidak tersedia untuk API yang dipakai server.";
  if (status === 429) {
    if (code === "insufficient_quota" || type === "insufficient_quota") {
      return "Kuota API proyek yang dipakai Asisten AI tidak mencukupi atau batas penggunaan proyek sudah tercapai.";
    }
    if (code === "rate_limit_exceeded" || type === "rate_limit_exceeded") {
      return "Permintaan Asisten AI sedang mencapai batas laju model. Coba lagi sebentar.";
    }
    return "OpenAI menolak permintaan Asisten AI dengan HTTP 429.";
  }
  if (status === 408 || status === 504) return "Asisten AI terlalu lama merespons. Coba lagi.";
  return `Layanan Asisten AI bermasalah (HTTP ${status}, ${code || type || "unknown"}).`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createResponse(client: OpenAI, input: ChatMessage[], model: string) {
  return client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    signal: AbortSignal.timeout(20000),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > 12000) return NextResponse.json({ error: "Pesan terlalu panjang untuk satu permintaan. Bagi menjadi beberapa pesan." }, { status: 400 });

    const safeHistory: ChatMessage[] = history
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

    safeHistory.push({ role: "user", content: message });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Asisten AI belum aktif di server: OPENAI_API_KEY belum tersedia." }, { status: 503 });

    const client = new OpenAI({ apiKey });
    // The Studio client expects a JSON response. Keep the assistant on a fast, stable model
    // instead of coupling it to the selected music-generation engine.
    const model = FAST_MODEL;

    let response: any;
    try {
      try {
        response = await createResponse(client, safeHistory, model);
      } catch (firstError: any) {
        const firstStatus = Number(firstError?.status || firstError?.statusCode || 0);
        const first = providerInfo(firstError);
        if (firstStatus === 429 && (first.code === "rate_limit_exceeded" || first.type === "rate_limit_exceeded")) {
          await sleep(700);
          response = await createResponse(client, safeHistory, model);
        } else {
          throw firstError;
        }
      }
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 0);
      const provider = providerInfo(error);
      console.error("SALVIAN MUSIC assistant OpenAI error", {
        status: status || 500,
        code: provider.code || undefined,
        type: provider.type || undefined,
        requestId: provider.requestId || undefined,
      });
      return NextResponse.json(
        {
          error: classifyOpenAIError(status || 500, error),
          providerCode: provider.code || provider.type || undefined,
        },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }

    const answer = response?.output_text?.trim() || "";
    if (!answer) {
      return NextResponse.json({ error: "Asisten AI selesai memproses tetapi tidak menghasilkan jawaban." }, { status: 502 });
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("SALVIAN AI MUSIC assistant error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
