import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Anda adalah asisten gratis yang fokus pada percakapan, ide lagu, pembuatan lirik original, revisi lirik, judul, genre, suasana, prompt musik, dan bantuan penggunaan Studio. Jawab dalam bahasa pengguna, utamakan bahasa Indonesia jika pengguna memakai bahasa Indonesia. Jawaban harus langsung, praktis, dan tidak bertele-tele.

Jika pengguna meminta LIRIK LAGU, buat lirik original dan susun sangat rapi agar siap disalin ke Studio. Gunakan format teks berikut tanpa Markdown tebal: satu judul, lalu bagian-bagian lagu dengan label [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro] sesuai kebutuhan. Beri satu baris kosong di antara setiap bagian dan tulis satu baris lirik per baris. Jangan menaruh beberapa bagian dalam satu paragraf. Jika pengguna hanya meminta jawaban singkat, jawab singkat dan langsung.

Anda boleh membantu membuat lirik original dari tema yang diberikan pengguna. Jangan menyalin atau melanjutkan lirik berhak cipta yang diminta pengguna; tawarkan lirik original dengan tema atau nuansa yang serupa secara umum.
SALVIAN AI MUSIC tidak memiliki alur login, akun, pembayaran, paket, kredit, atau billing sendiri di dalam Asisten. Jangan meminta pengguna login, jangan meminta password, API key, token, atau data rahasia. Jangan mengklaim telah melakukan tindakan yang sebenarnya tidak dilakukan.
Asisten ini hanya untuk teks. Jangan menghasilkan audio, jangan menjalankan proses pembuatan musik, dan jangan mengklaim telah membuat file musik. Jika pengguna ingin membuat audio, arahkan mereka untuk meneruskan hasil teks ke Studio Musik.`;

// Halaman chat Asisten Gratis: Gemini gratis saja.
// Tidak mengubah atau memanggil alur pembuatan lagu.
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"] as const;
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
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") continue;
    safe.push({ role: value.role, content: value.content.slice(0, MAX_HISTORY_CHARS) });
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
  if (status === 401 || status === 403) return "Kunci Gemini Gratis untuk Asisten AI tidak valid atau tidak memiliki akses.";
  if (status === 404) return "Model Gemini Gratis untuk Asisten AI tidak tersedia pada project ini.";
  if (status === 429) return "Batas gratis Gemini sedang tercapai. Coba lagi sebentar.";
  if (status === 408 || status === 504) return "Asisten AI terlalu lama merespons. Coba lagi.";
  return `Layanan Asisten AI bermasalah (HTTP ${status}${providerStatus ? `, ${providerStatus}` : ""}${message ? `: ${message.slice(0, 160)}` : ""}).`;
}

async function callGemini(apiKey: string, model: string, contents: ReturnType<typeof toGeminiContents>) {
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
        generationConfig: { temperature: 0.75, maxOutputTokens: MAX_OUTPUT_TOKENS },
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
  return data.candidates[0].content.parts.map((part: { text?: string }) => part.text || "").join("").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: "Pesan terlalu panjang. Ringkas pertanyaan Anda agar Asisten Gratis dapat menjawab lebih cepat." }, { status: 400 });

    // Hanya membaca key untuk halaman chat. Tidak menyentuh mesin/alur lagu.
    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Kunci Gemini Gratis untuk Asisten AI belum tersedia di environment chat." }, { status: 503 });
    }

    const contents = toGeminiContents(normalizeHistory(history, message));
    let lastResult: { response: Response; data: any } | null = null;

    // Utamakan Gemini 2.5 Flash-Lite, sesuai jalur gratis sebelumnya.
    // Jika project mengembalikan 404 untuk model lama, gunakan model Gemini Gratis berikutnya.
    for (const model of GEMINI_MODELS) {
      const result = await callGemini(apiKey, model, contents);
      lastResult = result;
      if (result.response.ok) {
        const answer = extractAnswer(result.data);
        if (!answer) {
          return NextResponse.json({ error: "Gemini Gratis selesai memproses tetapi tidak menghasilkan jawaban." }, { status: 502 });
        }
        return NextResponse.json({ answer, model, free: true });
      }
      if (result.response.status !== 404) break;
    }

    if (!lastResult) {
      return NextResponse.json({ error: "Model Gemini Gratis tidak tersedia." }, { status: 503 });
    }

    console.error("SALVIAN MUSIC assistant Gemini error", {
      status: lastResult.response.status,
      providerStatus: lastResult.data?.error?.status || undefined,
    });
    return NextResponse.json(
      { error: classifyGeminiError(lastResult.response.status, lastResult.data) },
      { status: lastResult.response.status >= 400 && lastResult.response.status < 600 ? lastResult.response.status : 502 },
    );
  } catch (error: any) {
    console.error("SALVIAN AI MUSIC assistant error", { name: error?.name, message: error?.message });
    if (error?.name === "AbortError") return NextResponse.json({ error: "Asisten AI terlalu lama merespons. Coba lagi." }, { status: 504 });
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI Gratis." }, { status: 500 });
  }
}
