import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Tugas utama Anda adalah membantu creator menggunakan SALVIAN AI MUSIC dengan bahasa Indonesia yang ramah, singkat, jelas, dan praktis.
Fokus bantuan: pembuatan lagu, lirik, gaya, vokal, prompt, model, hasil lagu, Library, dan pemecahan masalah Studio.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri. Jangan meminta pengguna login, jangan membahas saldo/kredit/pembayaran, dan jangan mengarahkan pengguna ke halaman akun.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah akun atau data pengguna secara langsung. Jangan meniru gaya atau lirik artis tertentu.`;

function classifyOpenAIError(status: number, data: any) {
  const code = String(data?.error?.code || "").toLowerCase();
  const type = String(data?.error?.type || "").toLowerCase();
  if (status === 401) return "API AI di server tidak valid atau tidak dapat digunakan.";
  if (status === 404) return "Model AI yang dipilih tidak tersedia untuk server ini.";
  if (status === 429) return "Request AI sedang dibatasi. Coba lagi sebentar.";
  return `Layanan Asisten AI sedang bermasalah (HTTP ${status}, ${code || type || "unknown"}).`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "Pertanyaan terlalu panjang. Ringkas pertanyaan Anda." }, { status: 400 });

    const safeHistory = history
      .filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const value = item as { role?: unknown; content?: unknown };
        return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
      })
      .slice(-12)
      .map((item: { role: "user" | "assistant"; content: string }) => ({
        role: item.role,
        content: item.content.slice(0, 5000),
      }));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Asisten AI belum aktif di server: OPENAI_API_KEY belum tersedia." }, { status: 503 });

    const client = new OpenAI({ apiKey });
    safeHistory.push({ role: "user", content: message });
    const model = (process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_LYRICS_MODEL || "gpt-5.6-luna").trim();

    try {
      const response = await client.responses.create({
        model,
        instructions: SYSTEM_PROMPT,
        input: safeHistory,
        max_output_tokens: 600,
      });
      const answer = response.output_text?.trim() || "";
      if (!answer) return NextResponse.json({ error: "Asisten AI tidak menghasilkan jawaban." }, { status: 502 });
      return NextResponse.json({ answer });
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 0);
      console.error("SALVIAN MUSIC assistant OpenAI error", error);
      return NextResponse.json(
        { error: classifyOpenAIError(status || 500, { error: { code: error?.code, type: error?.type } }), providerCode: error?.code || error?.type || undefined },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }
  } catch (error) {
    console.error("SALVIAN AI MUSIC assistant error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
