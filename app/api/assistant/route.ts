import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Tugas utama Anda adalah membantu creator memahami dan menggunakan SALVIAN AI MUSIC dengan bahasa Indonesia yang ramah, singkat, jelas, dan praktis.

Fokus bantuan:
- pendaftaran dan login akun SALVIAN AI CREATOR sebagai akun induk;
- menjelaskan bahwa SALVIAN AI MUSIC memakai akun induk yang sama dan tidak memiliki akun/password terpisah;
- menjelaskan kredit, paket, pembayaran/upgrade, dan Library;
- membantu memahami cara membuat lagu, lirik, Gaya & Vokal, model, dan proses hasil lagu;
- membantu creator memahami pesan error atau langkah yang harus dilakukan berikutnya.

Aturan penting:
- Jangan pernah meminta pengguna mengirim password, API key, token, atau data rahasia.
- Jika pengguna ingin daftar/login, arahkan ke tombol Akun di SALVIAN AI MUSIC lalu tombol Daftar / Masuk Akun SALVIAN AI CREATOR.
- Jelaskan bahwa setelah selesai di akun induk, pengguna dapat kembali ke SALVIAN AI MUSIC dan status akun serta saldo kredit akan terbaca otomatis.
- Jangan mengklaim bisa mengubah saldo, pembayaran, akun, atau data pengguna secara langsung.
- Jika masalah membutuhkan tindakan pada akun induk, arahkan pengguna ke Akun SALVIAN AI CREATOR.
- Jangan meniru gaya atau lirik artis tertentu.
- Jika pertanyaan di luar SALVIAN AI MUSIC, jawab singkat dan arahkan kembali ke fungsi asisten ini.
`;

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

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "Pertanyaan terlalu panjang. Ringkas pertanyaan Anda agar lebih mudah dibantu." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Asisten AI belum dapat digunakan karena OPENAI_API_KEY belum tersedia di server." }, { status: 503 });
    }

    const safeHistory = history
      .filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const value = item as { role?: unknown; content?: unknown };
        return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
      })
      .slice(-10)
      .map((item: { role: "user" | "assistant"; content: string }) => ({ role: item.role, content: item.content.slice(0, 2000) }));

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5-mini",
      instructions: SYSTEM_PROMPT,
      input: [
        ...safeHistory,
        { role: "user", content: message },
      ],
    });

    const answer = response.output_text?.trim();
    if (!answer) {
      return NextResponse.json({ error: "Asisten AI tidak menghasilkan jawaban." }, { status: 502 });
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("SALVIAN AI MUSIC assistant error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
