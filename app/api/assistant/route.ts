import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

const SYSTEM_PROMPT = `Anda adalah Asisten AI resmi di SALVIAN AI MUSIC.
Tugas utama Anda adalah membantu creator memahami dan menggunakan SALVIAN AI MUSIC dengan bahasa Indonesia yang ramah, singkat, jelas, dan praktis.
Fokus bantuan: akun induk SALVIAN AI CREATOR, kredit, pembayaran/upgrade, Library, pembuatan lagu, lirik, gaya/vokal, model, hasil lagu, dan pemecahan masalah.
Jangan pernah meminta password, API key, token, atau data rahasia. Jangan mengklaim dapat mengubah saldo, pembayaran, akun, atau data pengguna secara langsung. Jika masalah membutuhkan tindakan akun induk, arahkan ke Akun SALVIAN AI CREATOR. Jangan meniru gaya atau lirik artis tertentu.`;

async function verifyAuth(auth: string | null) {
  if (!auth || !/^Bearer\s+/i.test(auth)) return false;
  try {
    const response = await fetch(`${DATA_API}/rpc/salvian_get_my_credits`, {
      method: "POST", headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" }, body: "{}", cache: "no-store",
    });
    return response.ok;
  } catch { return false; }
}

function classifyOpenAIError(status: number, data: any) {
  const code = String(data?.error?.code || "").toLowerCase();
  const type = String(data?.error?.type || "").toLowerCase();
  if (code === "insufficient_quota" || type === "insufficient_quota") return "Kuota API OpenAI tidak mencukupi untuk project ini. Periksa Billing, Limits, dan project yang dipakai oleh API key.";
  if (code === "credit_balance_exhausted") return "Kredit API OpenAI habis. Isi kembali saldo API OpenAI terlebih dahulu.";
  if (code === "organization_usage_limit_exceeded") return "Batas penggunaan API OpenAI organisasi tercapai. Naikkan approved usage limit jika diperlukan.";
  if (code === "organization_spend_limit_exceeded") return "Batas pengeluaran organisasi OpenAI tercapai.";
  if (code === "project_spend_limit_exceeded") return "Batas pengeluaran project OpenAI tercapai.";
  if (status === 429 && (code === "rate_limit_exceeded" || type === "rate_limit_error")) return "Batas request/token OpenAI sedang tercapai. Sistem akan mencoba model cadangan.";
  if (status === 401) return "Konfigurasi OpenAI di server tidak valid.";
  return `Layanan Asisten AI sedang bermasalah (HTTP ${status}, ${code || type || "unknown"}).`;
}

async function callOpenAI(apiKey: string, model: string, input: unknown[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: SYSTEM_PROMPT, input, max_output_tokens: 600 }),
    cache: "no-store",
  });
  const raw = await response.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  return { response, raw, data };
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    if (!(await verifyAuth(auth))) return NextResponse.json({ error: "Silakan masuk melalui Akun SALVIAN AI CREATOR terlebih dahulu." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    if (!message) return NextResponse.json({ error: "Tulis pertanyaan Anda terlebih dahulu." }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "Pertanyaan terlalu panjang. Ringkas pertanyaan Anda." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Asisten AI belum aktif di server: OPENAI_API_KEY belum tersedia." }, { status: 503 });

    const safeHistory = history.filter((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const value = item as { role?: unknown; content?: unknown };
      return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
    }).slice(-10).map((item: { role: "user" | "assistant"; content: string }) => ({ role: item.role, content: item.content.slice(0, 2000) }));
    const input = [...safeHistory, { role: "user", content: message }];
    const primaryModel = process.env.OPENAI_ASSISTANT_MODEL || "gpt-5-mini";
    let result = await callOpenAI(apiKey, primaryModel, input);

    const primaryCode = String(result.data?.error?.code || result.data?.error?.type || "").toLowerCase();
    const isRetryableRateLimit = result.response.status === 429 && (primaryCode === "rate_limit_exceeded" || primaryCode === "rate_limit_error");
    if (!result.response.ok && isRetryableRateLimit) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      result = await callOpenAI(apiKey, "gpt-4.1-mini", input);
    }

    if (!result.response.ok) {
      const providerCode = String(result.data?.error?.code || result.data?.error?.type || "unknown");
      console.error("SALVIAN assistant OpenAI error", result.response.status, providerCode, result.raw.slice(0, 1000));
      return NextResponse.json({ error: classifyOpenAIError(result.response.status, result.data), providerCode: providerCode === "unknown" ? undefined : providerCode }, { status: result.response.status === 429 ? 429 : 502 });
    }

    const answer = typeof result.data.output_text === "string" ? result.data.output_text.trim() : Array.isArray(result.data.output) ? result.data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content.map((part: any) => part?.text).filter(Boolean) : []).join("\n").trim() : "";
    if (!answer) return NextResponse.json({ error: "Asisten AI tidak menghasilkan jawaban." }, { status: 502 });
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("SALVIAN AI MUSIC assistant error", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat menghubungkan ke Asisten AI." }, { status: 500 });
  }
}
