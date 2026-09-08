import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const MUSIC_CREDIT_COST = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));

function cleanUrl(value: unknown) { if (typeof value !== "string") return null; const s = value.trim(); return /^https?:\/\//i.test(s) ? s : null; }
function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) { for (const item of value) { const found = findAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["audio", "audio_url", "audioUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl", "url"]) { const found = cleanUrl(obj[key]); if (found) return found; }
  for (const child of Object.values(obj)) { const found = findAudio(child, depth + 1); if (found) return found; }
  return null;
}
function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item); if (found) return found; } return null; }
  const obj = value as Record<string, unknown>;
  for (const key of ["task_id", "taskId", "job_id", "jobId", "request_id", "requestId", "id"]) if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return String(obj[key]).trim();
  return null;
}
function findStatus(value: unknown): string { if (!value || typeof value !== "object") return "unknown"; const obj = value as Record<string, unknown>; for (const key of ["status", "state", "task_status", "taskStatus"]) if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]).toLowerCase(); return "unknown"; }

async function neonRpc(auth: string, functionName: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${DATA_API}/rpc/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
async function getCredits(auth: string) { return neonRpc(auth, "salvian_get_my_credits"); }
async function consumeCredits(auth: string) { return neonRpc(auth, "salvian_consume_credits", { p_amount: MUSIC_CREDIT_COST, p_type: "USAGE", p_description: "Pembuatan lagu SALVIAN AI MUSIC" }); }
async function refundCredits(auth: string) { return neonRpc(auth, "salvian_refund_credits", { p_amount: MUSIC_CREDIT_COST, p_description: "Refund pembuatan lagu SALVIAN AI MUSIC" }); }
async function libraryRequest(auth: string, method: "POST" | "PATCH", body: Record<string, unknown>, query = "") {
  return fetch(`${DATA_API}/salvian_music_projects${query}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const body = await request.json().catch(() => ({}));
  const action = body?.action || "generate";

  try {
    if (!auth || !/^Bearer\s+/i.test(auth)) return NextResponse.json({ success: false, error: "Silakan login melalui Akun SALVIAN AI CREATOR terlebih dahulu." }, { status: 401 });

    if (action === "balance") {
      const credit = await getCredits(auth);
      if (!credit.response.ok) return NextResponse.json({ success: false, error: "Gagal membaca saldo kredit pusat." }, { status: 401 });
      const row = Array.isArray(credit.data) ? credit.data[0] : credit.data;
      return NextResponse.json({ success: true, plan: row?.plan || "FREE", credits: Number(row?.credits || 0) });
    }

    if (action === "status") {
      if (!API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di deployment." }, { status: 503 });
      const taskId = body?.taskId || body?.task_id || body?.id;
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const response = await fetch(`${BASE_URL}/v1/song/query/${encodeURIComponent(String(taskId))}`, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ success: false, taskId, error: `Mureka Query ${response.status}`, data }, { status: response.status });
      const audio = findAudio(data);
      const status = findStatus(data);
      try { await libraryRequest(auth, "PATCH", { status, audio_url: audio, updated_at: new Date().toISOString(), provider_data: data }, `?task_id=eq.${encodeURIComponent(String(taskId))}`); } catch (libraryError) { console.error("MUSIC LIBRARY STATUS ERROR", libraryError); }
      return NextResponse.json({ success: true, taskId: String(taskId), status, audio, url: audio, data });
    }

    const lyrics = String(body?.lyrics || "").trim();
    const style = String(body?.style || "").trim();
    if (!lyrics && !body?.instrumental) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });
    if (!API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di deployment." }, { status: 503 });

    const credit = await consumeCredits(auth);
    const creditRow = Array.isArray(credit.data) ? credit.data[0] : credit.data;
    if (!credit.response.ok || creditRow?.success !== true) return NextResponse.json({ success: false, error: creditRow?.message || "Kredit tidak cukup.", credits: Number(creditRow?.balance || 0) }, { status: credit.response.status === 402 ? 402 : 503 });

    let providerSucceeded = false;
    try {
      const payload: Record<string, unknown> = { lyrics, model: String(body?.model || "auto"), n: Math.min(Math.max(Number(body?.n) || 2, 1), 3), stream: false };
      if (style) payload.prompt = style.slice(0, 1024);
      if (body?.instrumental) payload.instrumental = true;
      if (body?.reference_id) payload.reference_id = String(body.reference_id);
      if (body?.vocal_id) payload.vocal_id = String(body.vocal_id);
      if (body?.melody_id) payload.melody_id = String(body.melody_id);

      const response = await fetch(`${BASE_URL}/v1/song/generate`, { method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ success: false, error: `Mureka API ${response.status}`, data }, { status: response.status });

      providerSucceeded = true;
      const taskId = findTaskId(data);
      const audio = findAudio(data);
      const status = findStatus(data);
      let librarySaved = false;
      try {
        const libraryResponse = await libraryRequest(auth, "POST", {
          title: String(body?.title || "Salvian AI Song").slice(0, 160), lyrics, style,
          model: String(body?.model || "auto").slice(0, 80), task_id: taskId, status,
          audio_url: audio, provider_data: data, updated_at: new Date().toISOString()
        });
        librarySaved = libraryResponse.ok;
        if (!libraryResponse.ok) console.error("MUSIC LIBRARY SAVE", await libraryResponse.text().catch(() => ""));
      } catch (libraryError) { console.error("MUSIC LIBRARY SAVE ERROR", libraryError); }

      return NextResponse.json({ success: true, title: String(body?.title || "Salvian AI Song"), taskId, status, audio, url: audio, credits: Number(creditRow?.balance || 0), librarySaved, data });
    } finally {
      if (!providerSucceeded) { try { await refundCredits(auth); } catch (refundError) { console.error("MUSIC CREDIT REFUND ERROR", refundError); } }
    }
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik." }, { status: 500 });
  }
}
