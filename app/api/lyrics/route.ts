import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

async function verifyAuth(auth: string | null) {
  if (!auth || !/^Bearer\s+/i.test(auth)) return false;
  try {
    const response = await fetch(`${DATA_API}/rpc/salvian_get_my_credits`, {
      method: "POST",
      headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    if (!(await verifyAuth(auth))) {
      return NextResponse.json({ error: "Silakan masuk melalui Akun SALVIAN AI CREATOR terlebih dahulu." }, { status: 401 });
    }

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
      input: `Buat lirik lagu original berdasarkan ide berikut:\n\n${idea.trim().slice(0, 2000)}`,
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
