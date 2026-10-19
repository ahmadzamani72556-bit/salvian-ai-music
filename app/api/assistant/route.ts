import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten percakapan serbaguna yang membantu pengguna dengan bahasa Indonesia yang jelas, ramah, dan praktis. Anda dapat menjawab pertanyaan umum, menjelaskan konsep, membantu menulis, merencanakan ide, serta membantu pembuatan lagu, lirik original, genre, vokal, prompt, model, hasil lagu, Library, dan pemecahan masalah Studio. Jangan membatasi jawaban hanya pada fitur musik; tanggapi pertanyaan pengguna sesuai konteks dan kemampuan Anda.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri. Jangan meminta pengguna login, jangan membahas saldo/kredit/pembayaran, dan jangan mengarahkan pengguna ke halaman akun.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah akun atau data pengguna secara langsung. Jangan meniru lirik berhak cipta atau mengklaim mengeksekusi tindakan yang tidak benar-benar dilakukan.`;

const FAST_MODEL = "gpt-4.1-mini";
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 2500;
const MAX_OUTPUT_TOKENS = 800;

type ChatMessage = { role: "user" | "assistant"; content: string };

function getProviderError(error: any) {
  return {
    code: String(error?.code || "").toLowerCase(),
    type: String(error?.type || "").toLowerCase(),
    requestId: String(error?.request_id || error?.headers?.["x-request-id"] || ""),
  };
}

function classifyOpenAIError(status: number, error: any) {
  const { code, type } = getProviderError(error);
  if (status === 401) return "API AI di server tidak valid atau tidak dapat digunakan.";
  if (status === 404) return "Model AI yang dipilih tidak tersedia untuk server ini.";
  if (status === 429) {
    if (code === "insufficient_quota" || type === "insufficient_quota") {
      return "Kuota API proyek yang dipakai Asisten AI tidak mencukupi atau batas penggunaan proyek sudah tercapai.";
    }
    if (code === "rate_limit_exceeded" || type === "rate_limit_exceeded") {
      return "Permintaan Asisten AI sedang mencapai batas laju model. Silakan coba lagi sebentar.";
    }
    return "OpenAI menolak permintaan Asisten AI dengan HTTP 429.";
  }
  return `Layanan Asisten AI sedang bermasalah (HTTP ${status}, ${code || type || "unknown"}).`;
}

function makeSse(body: ReadableStream<Uint8Array>) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function streamModel(client: OpenAI, model: string, input: ChatMessage[]) {
  return client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
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
    const configuredModel = (process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_LYRICS_MODEL || FAST_MODEL).trim();

    const encoder = new TextEncoder();
    let stream: AsyncIterable<any>;

    try {
      try {
        stream = await streamModel(client, configuredModel, safeHistory);
      } catch (firstError: any) {
        const firstStatus = Number(firstError?.status || firstError?.statusCode || 0);
        const { code: firstCode, type: firstType } = getProviderError(firstError);
        const canFallback =
          configuredModel !== FAST_MODEL &&
          ((firstStatus === 404 || firstCode === "model_not_found") ||
            (firstStatus === 429 && (firstCode === "rate_limit_exceeded" || firstType === "rate_limit_exceeded")));
        if (!canFallback) throw firstError;
        stream = await streamModel(client, FAST_MODEL, safeHistory);
      }
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 0);
      const provider = getProviderError(error);
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

    const output = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: event.delta })}\n\n`));
            } else if (event?.type === "response.completed") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: any) {
          const status = Number(error?.status || error?.statusCode || 0);
          const provider = getProviderError(error);
          console.error("SALVIAN MUSIC assistant OpenAI stream error", {
            status: status || 500,
            code: provider.code || undefined,
            type: provider.type || undefined,
            requestId: provider.requestId || undefined,
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: classifyOpenAIError(status || 500, error) })}\n\n`));
          controller.close();
        }
      },
    });

    return makeSse(output);
  } catch (error) {
    console.error("SALVIAN AI MUSIC assistant error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
