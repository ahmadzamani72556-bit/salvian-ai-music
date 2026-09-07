import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { idea } = await request.json();
    if (!idea || typeof idea !== "string" || !idea.trim()) {
      return NextResponse.json({ error: "Masukkan ide atau tema lagu." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY belum tersedia di server. Fitur Bantu AI belum bisa digunakan." },
        { status: 503 },
      );
    }

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: process.env.OPENAI_LYRICS_MODEL || "gpt-5-mini",
      instructions:
        "Anda adalah penulis lirik profesional untuk SALVIAN AI MUSIC. Buat lirik lagu original berdasarkan tema, cerita, dan arahan pengguna. Jangan meniru lirik lagu yang sudah ada atau gaya khas artis tertentu. Gunakan struktur [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Chorus] jika sesuai. Keluarkan hanya lirik tanpa penjelasan.",
      input: `Buat lirik lagu original berdasarkan ide berikut:\n\n${idea.trim()}`,
    });

    const lyrics = response.output_text?.trim();
    if (!lyrics) {
      return NextResponse.json({ error: "AI tidak menghasilkan lirik." }, { status: 502 });
    }

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("SALVIAN AI MUSIC lyrics error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat membuat lirik AI." }, { status: 500 });
  }
}
