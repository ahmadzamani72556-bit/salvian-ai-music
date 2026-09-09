import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const CREATOR_ASSISTANT_URL = "https://salvian-ai-creator.vercel.app/api/assistant";

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Tugas utama Anda adalah membantu creator memahami dan menggunakan SALVIAN AI MUSIC dengan bahasa Indonesia yang ramah, singkat, jelas, dan praktis.
Fokus bantuan: akun induk SALVIAN AI CREATOR, kredit, pembayaran/upgrade, Library, pembuatan lagu, lirik, gaya/vokal, model, hasil lagu, dan pemecahan masalah.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah saldo, pembayaran, akun, atau data pengguna secara langsung. Jika masalah membutuhkan tindakan akun induk, arahkan ke Akun SALVIAN AI CREATOR. Jangan meniru gaya atau lirik artis tertentu.`;

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

async function callCreatorAssistant(auth: string, message: string, history: unknown[]) {
  const response = await fetch(CREATOR_ASSISTANT_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message, messages: history }),
    cache: "no-store",
  });
  const raw = await response.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  return { response, data, raw };
}

function classifyOpenAIError(status: number, data: any) {
  const code = String(data?.error?.code || "").toLowerCase();
  const type = String(data?.error?.type || "").toLowerCase();
  if (code === "billing_not_active" || type === "billing_not_active") return "Billing API OpenAI belum aktif untuk project yang digunakan. Pastikan API key berasal dari project OpenAI yang sudah memiliki kredit API.";
  if (code === "insufficient_quota" || type === "insufficient_quota") return "Kuota API OpenAI tidak mencukupi untuk project ini. Periksa Billing dan project yang dipakai oleh API key.";
  if (code === "credit_balance_exhausted" || type === "credit_balance_exhausted") return "Kredit API OpenAI habis. Isi kembali saldo API OpenAI terlebih dahulu.";
  if (code === "organization_usage_limit_exceeded" || type === "organization_usage_limit_exceeded") return "Batas penggunaan API OpenAI organisasi tercapai.";
  if (code === "organization_spend_limit_exceeded" || type === "organization_spend_limit_exceeded") return "Batas pengeluaran organisasi OpenAI tercapai.";
  if (code === "project_spend_limit_exceeded" || type === "project_spend_limit_exceeded") return "Batas pengeluaran project OpenAI tercapai.";
  if (status === 401) return "API key OpenAI di server tidak valid atau tidak dapat digunakan.";
  if (status === 404) return "Model OpenAI yang dipilih tidak tersedia untuk project ini.";
  if (status === 429) return "Request OpenAI sedang dibatasi. Coba lagi sebentar.";
  return `Layanan Asisten AI sedang bermasalah (HTTP ${status}, ${code || type || "unknown"}).`;
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
      const code = String(error?.code || error?.type || "").toLowerCase();
      const isBillingProblem = code === "billing_not_active" || code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "organization_usage_limit_exceeded" || code === "organization_spend_limit_exceeded" || code === "project_spend_limit_exceeded";

      // The Creator PRO assistant is already proven active. If this Music deployment
      // still points at a key/project with a billing mismatch, use the same working
      // Creator server-side OpenAI flow instead of leaving the user stuck.
      if (isBillingProblem) {
        const fallback = await callCreatorAssistant(auth!, message, safeHistory.slice(0, -1));
        if (fallback.response.ok) {
          const answer = String(fallback.data?.text || fallback.data?.output_text || fallback.data?.response || "").trim();
          if (answer) return NextResponse.json({ answer, source: "creator-assistant" });
        }
      }

      console.error("SALVIAN assistant OpenAI error", error);
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
