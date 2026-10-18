import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer, ownsMusicTaskServer, updateMusicProjectServer } from "../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);

function workspace(request: NextRequest) { return request.headers.get("x-music-workspace")?.trim() || ""; }
function cleanUrl(value: unknown) { if (typeof value !== "string") return null; const s = value.trim(); return /^(https?:\/\/|data:|blob:)/i.test(s) ? s : null; }
function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) { for (const item of value) { const found = findAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["audio_url","audioUrl","wav_url","wavUrl","song_url","songUrl","music_url","musicUrl","output_url","outputUrl","download_url","downloadUrl"]) { const found = cleanUrl(obj[key]); if (found) return found; }
  for (const key of ["audio","choices","songs","outputs","results","data"]) { if (obj[key]) { const found = findAudio(obj[key], depth + 1); if (found) return found; } }
  return null;
}
function findStreamAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8 || typeof value === "string") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findStreamAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["stream_url","streamUrl"]) { const found = cleanUrl(obj[key]); if (found) return found; }
  for (const key of ["audio","choices","songs","outputs","results","data"]) { if (obj[key]) { const found = findStreamAudio(obj[key], depth + 1); if (found) return found; } }
  return null;
}
function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item); if (found) return found; } return null; }
  const obj = value as Record<string, unknown>;
  for (const key of ["id","task_id","taskId","job_id","jobId","request_id","requestId"]) if (obj[key] != null && String(obj[key]).trim()) return String(obj[key]).trim();
  for (const key of ["task","data","result"]) if (obj[key]) { const found = findTaskId(obj[key]); if (found) return found; }
  return null;
}
function findStatus(value: unknown): string { if (!value || typeof value !== "object") return "preparing"; const obj = value as Record<string, unknown>; for (const key of ["status","state","task_status","taskStatus"]) if (obj[key] != null) return String(obj[key]).toLowerCase(); return "preparing"; }
function terminal(status: string) { return ["succeeded","success","completed","complete","done","failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => status === v || status.includes(v)); }
function failure(status: string) { return ["failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => status === v || status.includes(v)); }
async function provider(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const response = await fetch(`${MUREKA_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" });
  return { response, data: await response.json().catch(() => ({})) };
}
async function saveProject(userId: string, body: Record<string, unknown>) {
  const direct = await createMusicProjectServer(userId, { title: String(body.title || "Salvian AI Song"), lyrics: String(body.lyrics || ""), style: String(body.style || ""), model: String(body.model || "auto"), taskId: body.taskId ? String(body.taskId) : null, status: String(body.status || "preparing"), audioUrl: body.audio ? String(body.audio) : null, providerData: body.providerData ?? null });
  return direct ? { ok: true, data: direct } : { ok: false, data: null };
}

export async function POST(request: NextRequest) {
  const userId = workspace(request);
  if (!userId) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const action = body?.action || "generate";
  try {
    if (action === "status") {
      const taskId = String(body?.taskId || body?.task_id || body?.id || "");
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      if (!(await ownsMusicTaskServer(userId, taskId))) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library workspace ini." }, { status: 404 });
      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`);
      if (!q.response.ok) return NextResponse.json({ success: false, taskId, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const providerStatus = findStatus(q.data);
      const failed = failure(providerStatus);
      const audio = !failed ? findAudio(q.data) : null;
      const streamUrl = !failed ? findStreamAudio(q.data) : null;
      const finished = terminal(providerStatus);
      const normalizedStatus = finished && audio ? "succeeded" : providerStatus;
      await updateMusicProjectServer(userId, taskId, normalizedStatus, audio, q.data).catch(error => console.error("MUSIC LIBRARY STATUS ERROR", error));
      return NextResponse.json({ success: true, taskId, status: normalizedStatus, providerStatus, audio, url: audio, streamUrl, finished, failed, data: q.data });
    }

    if (body?.instrumental === true) return NextResponse.redirect(new URL("/api/music/instrumental", request.url), 307);
    const lyrics = String(body?.lyrics || "").trim();
    if (!lyrics) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });
    const requestedModel = String(body?.model || "auto").trim();
    const model = MODELS.has(requestedModel) ? requestedModel : "auto";
    const requestedN = Number(body?.n);
    const n = Number.isFinite(requestedN) ? Math.min(Math.max(Math.floor(requestedN), 1), 3) : 1;
    const musicRequest: Record<string, unknown> = { lyrics: lyrics.slice(0, 5000), model, n, stream: body?.stream === true && body?.disable_stream !== true };
    const style = String(body?.style || "").trim().slice(0, 1024); if (style) musicRequest.prompt = style;
    const gender = String(body?.gender || "").toLowerCase(); if (gender === "female" || gender === "male") musicRequest.gender = gender;
    if (body?.reference_id) musicRequest.reference_id = String(body.reference_id);
    if (body?.vocal_id) musicRequest.vocal_id = String(body.vocal_id);
    if (body?.melody_id) musicRequest.melody_id = String(body.melody_id);

    const generated = await provider("/v1/song/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(musicRequest) });
    if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || generated.data?.error || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });
    const taskId = findTaskId(generated.data);
    if (!taskId) return NextResponse.json({ success: false, error: "Mureka menerima permintaan tetapi tidak mengembalikan Task ID.", data: generated.data }, { status: 502 });
    const providerStatus = findStatus(generated.data);
    const finished = terminal(providerStatus);
    const failed = failure(providerStatus);
    const audio = finished && !failed ? findAudio(generated.data) : null;
    const saved = await saveProject(userId, { title: String(body?.title || "Salvian AI Song").slice(0, 160), lyrics, style, model, taskId, status: providerStatus, audio, providerData: generated.data });
    if (!saved.ok) return NextResponse.json({ success: false, error: "Task berhasil dibuat tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
    return NextResponse.json({ success: true, title: String(body?.title || "Salvian AI Song"), taskId, status: providerStatus, audio, librarySaved: true, data: generated.data });
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik SALVIAN AI MUSIC." }, { status: 500 });
  }
}
