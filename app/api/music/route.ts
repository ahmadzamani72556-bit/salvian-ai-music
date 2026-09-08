import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const MUSIC_CREDIT_COST = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));
const MUREKA_MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);

function cleanUrl(value: unknown) { if (typeof value !== "string") return null; const s = value.trim(); return /^https?:\/\//i.test(s) ? s : null; }
function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8) return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  // Only inspect fields that can actually contain generated audio.
  for (const key of ["audio_url", "audioUrl", "wav_url", "wavUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl"]) {
    const found = cleanUrl(obj[key]);
    if (found) return found;
  }
  // Mureka returns generated songs under choices[]. Never treat arbitrary URLs
  // such as trace/provider URLs as an audio result.
  for (const key of ["choices", "songs", "outputs", "results"]) {
    if (obj[key]) { const found = findAudio(obj[key], depth + 1); if (found) return found; }
  }
  return null;
}
function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item); if (found) return found; } return null; }
  const obj = value as Record<string, unknown>;
  // For /song/generate the top-level id is the asynchronous task ID.
  for (const key of ["id", "task_id", "taskId"]) if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return String(obj[key]).trim();
  for (const key of ["task", "data"]) if (obj[key]) { const found = findTaskId(obj[key]); if (found) return found; }
  return null;
}
function findStatus(value: unknown): string { if (!value || typeof value !== "object") return "preparing"; const obj = value as Record<string, unknown>; for (const key of ["status", "state", "task_status", "taskStatus"]) if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]).toLowerCase(); return "preparing"; }
function isFinished(status: string) { return ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled"].some(v => status.toLowerCase() === v || status.toLowerCase().includes(v)); }
function isFailure(status: string) { return ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status.toLowerCase() === v || status.toLowerCase().includes(v)); }
function decodeJwtSubject(auth: string): string | null {
  try {
    const token = auth.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!token) return null;
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    const sub = payload?.sub;
    return typeof sub === "string" && sub.trim() ? sub.trim() : null;
  } catch { return null; }
}

async function neonRpc(auth: string, functionName: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${DATA_API}/rpc/${functionName}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json().catch(() => null);
  return { response, data };
}
async function getCredits(auth: string) { return neonRpc(auth, "salvian_get_my_credits"); }
async function consumeCredits(auth: string) { return neonRpc(auth, "salvian_consume_credits", { p_amount: MUSIC_CREDIT_COST, p_type: "USAGE", p_description: "Pembuatan lagu SALVIAN AI MUSIC" }); }
async function refundCredits(auth: string) { return neonRpc(auth, "salvian_refund_credits", { p_amount: MUSIC_CREDIT_COST, p_description: "Refund pembuatan lagu SALVIAN AI MUSIC" }); }

async function createLibraryProject(auth: string, body: Record<string, unknown>) {
  const userId = decodeJwtSubject(auth);
  if (userId) {
    const insertBody = { user_id: userId, title: body.p_title, lyrics: body.p_lyrics, style: body.p_style || "", model: body.p_model || "v5.5 Pro", task_id: body.p_task_id || null, status: body.p_status || "preparing", audio_url: body.p_audio_url || null, provider_data: body.p_provider_data || null, updated_at: new Date().toISOString() };
    const direct = await fetch(`${DATA_API}/salvian_music_projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" }, body: JSON.stringify(insertBody), cache: "no-store" });
    const directData = await direct.json().catch(() => null);
    if (direct.ok) return { response: direct, data: directData };
    console.error("MUSIC LIBRARY DIRECT INSERT", direct.status, directData);
  }
  const fallback = await neonRpc(auth, "salvian_create_music_project", body);
  if (!fallback.response.ok) console.error("MUSIC LIBRARY RPC INSERT", fallback.response.status, fallback.data);
  return fallback;
}
async function patchLibraryProject(auth: string, taskId: string, status: string, audio: string | null, data: unknown) {
  const patchUrl = `${DATA_API}/salvian_music_projects?task_id=eq.${encodeURIComponent(taskId)}`;
  return fetch(patchUrl, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status, audio_url: audio, updated_at: new Date().toISOString(), provider_data: data }), cache: "no-store" });
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
      if (!row || row.credits === undefined || row.credits === null) return NextResponse.json({ success: false, error: "Profil kredit akun belum tersedia." }, { status: 404 });
      return NextResponse.json({ success: true, plan: row.plan || "FREE", credits: Number(row.credits) });
    }

    if (action === "status") {
      if (!API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di deployment." }, { status: 503 });
      const taskId = body?.taskId || body?.task_id || body?.id;
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const response = await fetch(`${BASE_URL}/v1/song/query/${encodeURIComponent(String(taskId))}`, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ success: false, error: `Mureka Query ${response.status}`, data }, { status: response.status });
      const status = findStatus(data);
      const terminal = isFinished(status);
      const audio = terminal && !isFailure(status) ? findAudio(data) : null;
      try {
        const patch = await patchLibraryProject(auth, String(taskId), status, audio, data);
        if (!patch.ok) console.error("MUSIC LIBRARY STATUS ERROR", patch.status, await patch.text().catch(() => ""));
      } catch (libraryError) { console.error("MUSIC LIBRARY STATUS ERROR", libraryError); }
      const result = NextResponse.json({ success: true, taskId: String(taskId), status, audio, url: audio, finished: terminal, failed: isFailure(status), createdAt: Number(data?.created_at || 0), finishedAt: Number(data?.finished_at || 0), failedReason: data?.failed_reason || null, data });
      if (terminal) result.cookies.set("salvian_generation_task", "", { path: "/", maxAge: 0 });
      return result;
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
      const requestedModel = String(body?.model || "auto").trim();
      const providerModel = MUREKA_MODELS.has(requestedModel) ? requestedModel : "auto";
      const payload: Record<string, unknown> = { lyrics: lyrics.slice(0, 5000), model: providerModel, n: 1, stream: false };
      if (style) payload.prompt = style.slice(0, 1024);
      if (body?.instrumental) payload.instrumental = true;
      if (body?.reference_id) payload.reference_id = String(body.reference_id);
      if (body?.vocal_id) payload.vocal_id = String(body.vocal_id);
      if (body?.melody_id) payload.melody_id = String(body.melody_id);

      const response = await fetch(`${BASE_URL}/v1/song/generate`, { method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const providerMessage = data?.error?.message || data?.message || data?.error || `Mureka API ${response.status}`;
        return NextResponse.json({ success: false, error: `Mureka API ${response.status}: ${String(providerMessage)}`, data }, { status: response.status });
      }
      providerSucceeded = true;
      const taskId = findTaskId(data);
      const status = findStatus(data);
      const audio = isFinished(status) && !isFailure(status) ? findAudio(data) : null;
      let librarySaved = false;
      let libraryError = "";
      if (taskId) {
        try {
          const saved = await createLibraryProject(auth, { p_title: String(body?.title || "Salvian AI Song").slice(0, 160), p_lyrics: lyrics, p_style: style, p_model: String(body?.model || "auto").slice(0, 80), p_task_id: taskId, p_status: status, p_audio_url: audio, p_provider_data: data });
          librarySaved = saved.response.ok;
          if (!librarySaved) libraryError = `Library save gagal (${saved.response.status})`;
        } catch (libraryErrorCaught) { libraryError = libraryErrorCaught instanceof Error ? libraryErrorCaught.message : "Library save gagal"; console.error("MUSIC LIBRARY SAVE ERROR", libraryErrorCaught); }
      } else libraryError = "Mureka tidak mengembalikan Task ID.";

      const result = NextResponse.json({ success: true, title: String(body?.title || "Salvian AI Song"), taskId, status, audio, credits: Number(creditRow?.balance || 0), librarySaved, libraryError, createdAt: Number(data?.created_at || 0), data });
      if (taskId && !isFinished(status)) result.cookies.set("salvian_generation_task", String(taskId), { path: "/", maxAge: 3600, sameSite: "lax" });
      return result;
    } finally {
      if (!providerSucceeded) { try { await refundCredits(auth); } catch (refundError) { console.error("MUSIC CREDIT REFUND ERROR", refundError); } }
    }
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik." }, { status: 500 });
  }
}
