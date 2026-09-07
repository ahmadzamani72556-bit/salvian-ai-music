import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { idea } = await request.json();
    if (!idea || typeof idea !== "string") {
      return NextResponse.json({ error: "Masukkan ide atau tema lagu." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        lyrics: `[Verse 1]\n${idea}\nKembangkan cerita ini menjadi lirik yang indah dan mudah dinyanyikan.\n\n[Chorus]\nTuliskan bagian reff yang kuat dan mudah diingat.`,
        demo: true,
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_LYRICS_MODEL || "gpt-5-mini",
        input: `Anda adalah penulis lirik profesional berbahasa Indonesia. Buat lirik lagu orisinal berdasarkan ide berikut. Gunakan struktur [Verse 1], [Pre-Chorus] bila cocok, [Chorus], [Verse 2], dan [Bridge] bila diperlukan. Jangan jelaskan prosesnya, keluarkan hanya lirik. Ide: ${idea}`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: "Layanan AI belum dapat digunakan.", detail }, { status: 502 });
    }

    const data = await response.json();
    const text = data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((part: { text?: string }) => part.text || "").join("\n") || "";
    return NextResponse.json({ lyrics: text });
  } catch {
    return NextResponse.json({ error: "Terjadi kesalahan saat membuat lirik." }, { status: 500 });
  }
}
