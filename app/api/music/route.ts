import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer, refundMusicCreditsServer, updateMusicProjectServer } from "../../../lib/server-credit-refund";

export const runtime = "nodejs";
export const maxDuration = 300;

// Use the same direct Mureka provider path as SALVIAN AI CREATOR.
// Authentication, credits, and Library remain owned by SALVIAN AI MUSIC.
const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const MUSIC_CREDIT_COST = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));
const MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);

function cleanUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return /^(https?:\/\/|data:|blob:)/i.test(s) ? s : null;
}

function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) { const found = findAudio(item, depth + 1); if (found) return found; }
    return null;
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["audio_url", "audioUrl", "wav_url", "wavUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl", "stream_url", "streamUrl"]) {
    const found = cleanUrl(obj[key]);
    if (found) return found;
  }
  for (const key of ["audio", "choices", "songs", "outputs", "results", "data"]) {
    if (obj[key]) { const found = findAudio(obj[key], depth + 1); if (found) return found; }
  }
  return null;
}

function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item); if (found) return found; } return null; }
  const obj = value as Record<string, unknown>;
  for (const key of ["id", "task_id", "taskId", "job_id", "jobId", "request_id", "requestId"]) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return String(obj[key]).trim();
  }
  for (const key of ["task", "data", "result"]) { if (obj[key]) { const found = findTaskId(obj[key]); if (found) return found; } }
  return null;
}

function findStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "preparing";
  const obj = value as Record<string, unknown>;
  for (const key of ["status", "state", "task_status", "taskStatus"]) if (obj[key] != null) return String(obj[key]).toLowerCase();
  return "preparing";
}

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of keys) if (obj[key] != null && String(obj[key]).trim()) return String(obj[key]).trim();
  for (const key of ["data", "result", "task"]) if (obj[key]) { const found = findString(obj[key], keys); if (found) return found; }
  return null;
}

function terminal(status: string) {
  return ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));
}

function failure(status: string) {
  return ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));
}

function subject(auth: string): string | null {
  try {
    const token = auth.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!token) return null;
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    return typeof payload?.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch { return null; }
}

async function rpc(auth: string, fn: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${DATA_API}/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { response, data: await response.json().catch(() => null) };
}

async function consume(auth: string) {
  return rpc(auth, "salvian_consume_credits", {
    p_amount: MUSIC_CREDIT_COST,
    p_type: "USAGE",
    p_description: "Pembuatan lagu SALVIAN AI MUSIC",
  });
}

async function provider(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const response = await fetch(`${MUREKA_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" });
  return { response, data: await response.json().catch(() => ({})) };
}

async function saveProject(auth: string, body: Record<string, unknown>) {
  const userId = subject(auth);
  if (userId) {
    const direct = await fetch(`${DATA_API}/salvian_music_projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, title: body.title, lyrics: body.lyrics, style: body.style || "", model: body.model || "auto", task_id: body.taskId || null, status: body.status || "preparing", audio_url: body.audio || null, provider_data: body.providerData || null, updated_at: new Date().toISOString() }), cache: "no-store" });
    const data = await direct.json().catch(() => null);
    if (direct.ok) return { ok: true, data };

    try {
      const recovered = await createMusicProjectServer(userId, {
        title: String(body.title || "Salvian AI Song"),
        lyrics: String(body.lyrics || ""),
        style: String(body.style || ""),
        model: String(body.model || "auto"),
        taskId: body.taskId ? String(body.taskId) : null,
        status: String(body.status || "preparing"),
        audioUrl: body.audio ? String(body.audio) : null,
        providerData: body.providerData ?? null,
      });
      if (recovered) return { ok: true, data: recovered, recovered: true };
    } catch (error) {
      console.error("MUSIC LIBRARY SERVER RECOVERY ERROR", error);
    }
  }
  const fallback = await rpc(auth, "salvian_create_music_project", { p_title: body.title, p_lyrics: body.lyrics, p_style: body.style || "", p_model: body.model || "auto", p_task_id: body.taskId || null, p_status: body.status || "preparing", p_audio_url: body.audio || null, p_provider_data: body.providerData || null });
  return { ok: fallback.response.ok, data: fallback.data };
}

async function ownsTask(auth: string, taskId: string) {
  const userId = subject(auth);
  if (!userId) return false;
  const response = await fetch(`${DATA_API}/salvian_music_projects?user_id=eq.${encodeURIComponent(userId)}&task_id=eq.${encodeURIComponent(taskId)}&select=id&limit=1`, { method: "GET", headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) return false;
  const data = await response.json().catch(() => []);
  return Array.isArray(data) && data.length > 0;
}

async function patchProject(auth: string, taskId: string, status: string, audio: string | null, providerData: unknown) {
  const userId = subject(auth);
  if (!userId) throw new Error("Sesi pengguna tidak valid untuk update Library.");
  return updateMusicProjectServer(userId, taskId, status, audio, providerData);
}

async function refund(auth: string) {
  const userId = subject(auth);
  if (!userId) throw new Error("Sesi pengguna tidak valid untuk refund.");
  return refundMusicCreditsServer(userId, MUSIC_CREDIT_COST, "Refund pembuatan lagu SALVIAN AI MUSIC");
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const body = await request.json().catch(() => ({}));
  const action = body?.action || "generate";

  try {
    if (!auth || !/^Bearer\s+/i.test(auth)) return NextResponse.json({ success: false, error: "Silakan login melalui Akun SALVIAN AI terlebih dahulu." }, { status: 401 });

    if (action === "balance") {
      const credit = await rpc(auth, "salvian_get_my_credits");
      const row = Array.isArray(credit.data) ? credit.data[0] : credit.data;
      if (!credit.response.ok || !row || row.credits == null) return NextResponse.json({ success: false, error: "Gagal membaca saldo kredit pusat." }, { status: 401 });
      return NextResponse.json({ success: true, plan: row.plan || "FREE", credits: Number(row.credits), creditCost: MUSIC_CREDIT_COST });
    }

    if (action === "status") {
      const taskId = String(body?.taskId || body?.task_id || body?.id || "");
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const owned = await ownsTask(auth, taskId);
      if (!owned) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 403 });
      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`, { method: "GET" });
      if (!q.response.ok) {
        const providerError = q.data?.error?.message || q.data?.message || q.data?.error || `Mureka Query ${q.response.status}`;
        // A missing task after it was accepted means the provider no longer exposes
        // the paid job. Mark it failed so the server-side refund path can run once.
        if (q.response.status === 404) {
          try { await patchProject(auth, taskId, "failed", null, { provider_error: providerError, http_status: 404 }); } catch (e) { console.error("MUSIC ORPHAN TASK RECOVERY ERROR", e); }
        }
        return NextResponse.json({ success: false, taskId, error: providerError, providerStatus: q.response.status, data: q.data }, { status: q.response.status });
      }
      const status = findStatus(q.data);
      const bad = failure(status);
      // Mureka documents these fields on the asynchronous task response.
      const providerModel = findString(q.data, ["model"]);
      const traceId = findString(q.data, ["trace_id", "traceId"]);
      const failedReason = findString(q.data, ["failed_reason", "failedReason"]);
      // Some Mureka responses expose the playable URL before the terminal status
      // is normalized. Keep that URL instead of waiting for a status string.
      const audio = !bad ? findAudio(q.data) : null;
      const done = terminal(status) || Boolean(audio);
      try { const patch = await patchProject(auth, taskId, done && audio ? "succeeded" : status, audio, q.data); if (!patch) console.error("MUSIC LIBRARY STATUS ERROR: project not found"); } catch (e) { console.error("MUSIC LIBRARY STATUS ERROR", e); }
      const result = NextResponse.json({ success: true, taskId, status: done && audio ? "succeeded" : status, providerStatus: status, providerModel, traceId, audio, url: audio, finished: done, failed: bad, createdAt: Number(q.data?.created_at || q.data?.data?.created_at || 0), finishedAt: Number(q.data?.finished_at || q.data?.data?.finished_at || 0), failedReason, data: q.data });
      if (done) result.cookies.set("salvian_generation_task", "", { path: "/", maxAge: 0 });
      return result;
    }

    if (body?.instrumental === true) return NextResponse.redirect(new URL("/api/music/instrumental", request.url), 307);

    const lyrics = String(body?.lyrics || "").trim();
    const style = String(body?.style || "").trim();
    if (!lyrics) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });

    const credit = await consume(auth);
    const creditRow = Array.isArray(credit.data) ? credit.data[0] : credit.data;
    if (!credit.response.ok || creditRow?.success !== true) return NextResponse.json({ success: false, error: creditRow?.message || "Kredit tidak cukup.", credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST }, { status: credit.response.status === 402 ? 402 : 503 });

    let providerAccepted = false;
    let shouldRefundTerminalFailure = false;
    let terminalTaskId = "";
    let terminalStatus = "";
    let terminalAudio: string | null = null;
    let terminalProviderData: unknown = null;

    try {
      const requestedModel = String(body?.model || "auto").trim();
      const model = MODELS.has(requestedModel) ? requestedModel : "auto";
      const requestedN = Number(body?.n);
      const n = Number.isFinite(requestedN) ? Math.min(Math.max(Math.floor(requestedN), 1), 3) : 1;
      const stream = body?.stream === true;
      // This mirrors the working CREATOR request shape: model, n, stream,
      // lyrics, prompt, gender and optional reference/vocal/melody IDs.
      const musicRequest: Record<string, unknown> = { lyrics: lyrics.slice(0, 5000), model, n, stream };
      const prompt = style.slice(0, 1024);
      if (prompt) musicRequest.prompt = prompt;
      const gender = String(body?.gender || "").toLowerCase();
      if (gender === "female" || gender === "male") musicRequest.gender = gender;
      if (model !== "mureka-o2") {
        if (body?.reference_id) musicRequest.reference_id = String(body.reference_id);
        if (body?.vocal_id) musicRequest.vocal_id = String(body.vocal_id);
        if (body?.melody_id) musicRequest.melody_id = String(body.melody_id);
      }

      console.log("MUREKA GENERATE", { model, n, stream, promptLength: prompt.length });
      const generated = await provider("/v1/song/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(musicRequest) });
      if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || generated.data?.error || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });

      const taskId = findTaskId(generated.data);
      if (!taskId) return NextResponse.json({ success: false, error: "Mureka menerima permintaan tetapi tidak mengembalikan Task ID. Kredit akan dikembalikan.", data: generated.data }, { status: 502 });

      providerAccepted = true;
      const status = findStatus(generated.data);
      const done = terminal(status);
      const bad = failure(status);
      const audio = done && !bad ? findAudio(generated.data) : null;
      shouldRefundTerminalFailure = done && bad;
      terminalTaskId = taskId;
      terminalStatus = status;
      terminalAudio = audio;
      terminalProviderData = generated.data;

      const saved = await saveProject(auth, { title: String(body?.title || "Salvian AI Song").slice(0, 160), lyrics, style, model, taskId, status, audio, providerData: generated.data });
      if (!saved.ok) {
        try { await refund(auth); } catch (e) { console.error("MUSIC ORPHAN TASK REFUND ERROR", e); }
        return NextResponse.json({ success: false, error: "Task Mureka berhasil dibuat tetapi Library gagal menyimpan task. Kredit sudah dikembalikan.", taskId, librarySaved: false }, { status: 503 });
      }

      const result = NextResponse.json({ success: true, title: String(body?.title || "Salvian AI Song"), taskId, status, audio, credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST, librarySaved: true, libraryRecovered: saved.recovered === true, createdAt: Number(generated.data?.created_at || generated.data?.data?.created_at || 0), data: generated.data });
      if (!done) result.cookies.set("salvian_generation_task", taskId, { path: "/", maxAge: 3600, sameSite: "lax" });
      return result;
    } finally {
      if (!providerAccepted) {
        try { await refund(auth); } catch (e) { console.error("MUSIC CREDIT REFUND ERROR", e); }
      } else if (shouldRefundTerminalFailure && terminalTaskId) {
        try {
          const patched = await patchProject(auth, terminalTaskId, terminalStatus, terminalAudio, terminalProviderData);
          if (!patched) console.error("MUSIC TERMINAL REFUND DEFERRED: project not found");
        } catch (e) {
          console.error("MUSIC TERMINAL REFUND DEFERRED", e);
        }
      }
    }
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik SALVIAN AI MUSIC." }, { status: 500 });
  }
}
