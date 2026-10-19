import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer, ownsMusicTaskServer, updateMusicProjectServer } from "../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const ELEVEN_BASE_URL = process.env.ELEVEN_BASE_URL || "https://api.elevenlabs.io";
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = process.env.SUNO_API_BASE_URL?.replace(/\/$/, "");
const SUNO_GENERATE_PATH = process.env.SUNO_GENERATE_PATH;
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH;
const MUREKA_MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);
const ENGINE_ALIASES = new Map([
  ["mureka", "mureka"],
  ["eleven_music_v2_5", "eleven_music_v2_5"],
  ["eleven", "eleven_music_v2_5"],
  ["suno_v6", "suno_v6"],
  ["suno", "suno_v6"],
]);

type MusicEngine = "mureka" | "eleven_music_v2_5" | "suno_v6";

function workspace(request: NextRequest) { return request.headers.get("x-music-workspace")?.trim() || ""; }
function cleanUrl(value: unknown) { if (typeof value !== "string") return null; const s = value.trim(); return /^(https?:\/\/|data:|blob:)/i.test(s) ? s : null; }
function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) { for (const item of value) { const found = findAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["audio_url", "audioUrl", "wav_url", "wavUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl"]) { const found = cleanUrl(obj[key]); if (found) return found; }
  for (const key of ["audio", "choices", "songs", "outputs", "results", "clips", "data"]) { if (obj[key]) { const found = findAudio(obj[key], depth + 1); if (found) return found; } }
  return null;
}
function findStreamAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 8 || typeof value === "string") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findStreamAudio(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["stream_url", "streamUrl"]) { const found = cleanUrl(obj[key]); if (found) return found; }
  for (const key of ["audio", "choices", "songs", "outputs", "results", "clips", "data"]) { if (obj[key]) { const found = findStreamAudio(obj[key], depth + 1); if (found) return found; } }
  return null;
}
function findTaskId(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["id", "task_id", "taskId", "job_id", "jobId", "request_id", "requestId", "clip_id", "clipId", "song_id", "songId"]) if (obj[key] != null && String(obj[key]).trim()) return String(obj[key]).trim();
  for (const key of ["task", "data", "result", "clips", "songs"]) if (obj[key]) { const found = findTaskId(obj[key]); if (found) return found; }
  return null;
}
function findStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "preparing";
  if (Array.isArray(value)) return value.length ? findStatus(value[0]) : "preparing";
  const obj = value as Record<string, unknown>;
  for (const key of ["status", "state", "task_status", "taskStatus"]) if (obj[key] != null) return String(obj[key]).toLowerCase();
  return "preparing";
}
function terminal(status: string) { return ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v)); }
function failure(status: string) { return ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v)); }
function resolveEngine(body: Record<string, unknown>): MusicEngine {
  const raw = String(body.musicEngine || body.engine || "mureka").trim().toLowerCase();
  return (ENGINE_ALIASES.get(raw) as MusicEngine | undefined) || "mureka";
}
function billingProvider(engine: MusicEngine) {
  return engine === "mureka" ? "mureka" : engine === "eleven_music_v2_5" ? "eleven_music_v2_5" : "suno_v6";
}

async function mureka(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const response = await fetch(`${MUREKA_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" });
  return { response, data: await response.json().catch(() => ({})) };
}

async function elevenCompose(body: Record<string, unknown>) {
  if (!ELEVEN_API_KEY) throw new Error("ELEVEN_API_KEY / ELEVENLABS_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const lyrics = String(body.lyrics || "").trim();
  const style = String(body.style || "").trim();
  const language = String(body.language || "Indonesia").trim();
  const tempo = Number(body.tempo || 100);
  const gender = String(body.gender || "female");
  const prompt = [
    `Create an original ${language} song.`,
    style ? `Style: ${style}.` : "",
    `Tempo: ${tempo} BPM.`,
    `Vocal: ${gender}.`,
    body.instrumental ? "Instrumental only; do not use vocals." : "",
    lyrics ? `Lyrics:\n${lyrics.slice(0, 3500)}` : "",
  ].filter(Boolean).join("\n\n");
  const response = await fetch(`${ELEVEN_BASE_URL}/v1/music?output_format=mp3_48000_192`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      prompt: prompt.slice(0, 4100),
      model_id: "music_v2_5",
      music_length_ms: Math.min(Math.max(Number(body.durationMs || 180000), 3000), 600000),
      force_instrumental: body.instrumental === true,
      store_for_inpainting: false,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(error || `Eleven Music API ${response.status}`);
  }
  const audio = Buffer.from(await response.arrayBuffer()).toString("base64");
  const songId = response.headers.get("song-id") || `eleven-${crypto.randomUUID()}`;
  return { taskId: songId, status: "completed", audioBase64: audio, contentType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg", data: { song_id: songId, model: "music_v2_5" } };
}

async function sunoRequest(path: string, init: RequestInit = {}) {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  if (!SUNO_API_BASE_URL) throw new Error("SUNO_API_BASE_URL belum dikonfigurasi. Gunakan endpoint resmi Suno Platform yang diberikan ke akun API Anda.");
  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" });
  const text = await response.text().catch(() => "");
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { response, data };
}
function sunoPath(template: string, taskId: string) { return template.replace(/\{id\}|\{taskId\}|\{songId\}/g, encodeURIComponent(taskId)); }

async function saveProject(userId: string, body: Record<string, unknown>) {
  const direct = await createMusicProjectServer(userId, {
    title: String(body.title || "Salvian AI Song"),
    lyrics: String(body.lyrics || ""),
    style: String(body.style || ""),
    model: String(body.model || body.musicEngine || "mureka"),
    taskId: body.taskId ? String(body.taskId) : null,
    status: String(body.status || "preparing"),
    audioUrl: body.audioUrl ? String(body.audioUrl) : null,
    providerData: body.providerData ?? null,
  });
  return direct ? { ok: true, data: direct } : { ok: false, data: null };
}

export async function POST(request: NextRequest) {
  const userId = workspace(request);
  if (!userId) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action || "generate";
  const engine = resolveEngine(body);
  try {
    if (action === "status") {
      const taskId = String(body.taskId || body.task_id || body.id || "");
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      if (!(await ownsMusicTaskServer(userId, taskId))) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library workspace ini." }, { status: 404 });

      if (engine === "mureka") {
        const q = await mureka(`/v1/song/query/${encodeURIComponent(taskId)}`);
        if (!q.response.ok) return NextResponse.json({ success: false, taskId, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
        const providerStatus = findStatus(q.data);
        const failed = failure(providerStatus);
        const audio = !failed ? findAudio(q.data) : null;
        const streamUrl = !failed ? findStreamAudio(q.data) : null;
        const finished = terminal(providerStatus);
        const normalizedStatus = finished && audio ? "succeeded" : providerStatus;
        await updateMusicProjectServer(userId, taskId, normalizedStatus, audio, { musicEngine: engine, billingProvider: billingProvider(engine), providerData: q.data }).catch(error => console.error("MUSIC LIBRARY STATUS ERROR", error));
        return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: normalizedStatus, providerStatus, audio, url: audio, streamUrl, finished, failed, data: q.data });
      }

      if (engine === "eleven_music_v2_5") {
        return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: "completed", finished: true, failed: false, audio: `/api/music/audio?taskId=${encodeURIComponent(taskId)}&workspace=${encodeURIComponent(userId)}` });
      }

      if (!SUNO_STATUS_PATH) return NextResponse.json({ success: false, taskId, musicEngine: engine, error: "SUNO_STATUS_PATH belum dikonfigurasi untuk akun Suno resmi." }, { status: 503 });
      const q = await sunoRequest(sunoPath(SUNO_STATUS_PATH, taskId));
      if (!q.response.ok) return NextResponse.json({ success: false, taskId, error: `Suno Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const providerStatus = findStatus(q.data);
      const failed = failure(providerStatus);
      const audio = !failed ? findAudio(q.data) : null;
      const finished = terminal(providerStatus) || Boolean(audio);
      const normalizedStatus = finished && audio ? "succeeded" : providerStatus;
      await updateMusicProjectServer(userId, taskId, normalizedStatus, audio, { musicEngine: engine, billingProvider: billingProvider(engine), providerData: q.data }).catch(error => console.error("MUSIC LIBRARY STATUS ERROR", error));
      return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: normalizedStatus, providerStatus, audio, url: audio, finished, failed, data: q.data });
    }

    if (body?.instrumental === true && engine === "mureka") return NextResponse.redirect(new URL("/api/music/instrumental", request.url), 307);
    const lyrics = String(body?.lyrics || "").trim();
    if (!lyrics && body?.instrumental !== true) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });
    const title = String(body?.title || "Salvian AI Song").slice(0, 160);
    const style = String(body?.style || "").trim().slice(0, 1024);

    if (engine === "eleven_music_v2_5") {
      const generated = await elevenCompose(body);
      const taskId = generated.taskId;
      const audioUrl = `/api/music/audio?taskId=${encodeURIComponent(taskId)}&workspace=${encodeURIComponent(userId)}`;
      const saved = await saveProject(userId, { title, lyrics, style, model: "music_v2_5", musicEngine: engine, taskId, status: "completed", audioUrl, providerData: { musicEngine: engine, billingProvider: billingProvider(engine), audioBase64: generated.audioBase64, contentType: generated.contentType, data: generated.data } });
      if (!saved.ok) return NextResponse.json({ success: false, error: "Eleven Music selesai tetapi Library gagal menyimpan hasil.", taskId, librarySaved: false }, { status: 503 });
      return NextResponse.json({ success: true, title, taskId, status: "completed", musicEngine: engine, billingProvider: billingProvider(engine), audio: audioUrl, librarySaved: true, data: generated.data });
    }

    if (engine === "suno_v6") {
      if (!SUNO_GENERATE_PATH) return NextResponse.json({ success: false, error: "SUNO_GENERATE_PATH belum dikonfigurasi. Suno resmi saat ini menyediakan akses API melalui Suno Platform untuk akun yang diberi akses.", musicEngine: engine }, { status: 503 });
      const generated = await sunoRequest(SUNO_GENERATE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "suno-v6", title, lyrics: lyrics || undefined, prompt: style || undefined, style: style || undefined, instrumental: body?.instrumental === true, vocal_gender: body?.gender || undefined }),
      });
      if (!generated.response.ok) return NextResponse.json({ success: false, error: `Suno API ${generated.response.status}`, data: generated.data, musicEngine: engine }, { status: generated.response.status });
      const taskId = findTaskId(generated.data);
      if (!taskId) return NextResponse.json({ success: false, error: "Suno menerima permintaan tetapi tidak mengembalikan ID generasi.", data: generated.data }, { status: 502 });
      const providerStatus = findStatus(generated.data);
      const audio = findAudio(generated.data);
      const finished = terminal(providerStatus) || Boolean(audio);
      const saved = await saveProject(userId, { title, lyrics, style, model: "suno-v6", musicEngine: engine, taskId, status: providerStatus, audioUrl: audio, providerData: { musicEngine: engine, billingProvider: billingProvider(engine), data: generated.data } });
      if (!saved.ok) return NextResponse.json({ success: false, error: "Suno menerima permintaan tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
      return NextResponse.json({ success: true, title, taskId, status: providerStatus, musicEngine: engine, billingProvider: billingProvider(engine), audio, librarySaved: true, finished, data: generated.data });
    }

    const requestedModel = String(body?.model || "auto").trim();
    const model = MUREKA_MODELS.has(requestedModel) ? requestedModel : "auto";
    const requestedN = Number(body?.n);
    const n = Number.isFinite(requestedN) ? Math.min(Math.max(Math.floor(requestedN), 1), 3) : 1;
    const musicRequest: Record<string, unknown> = { lyrics: lyrics.slice(0, 5000), model, n, stream: body?.stream === true && body?.disable_stream !== true };
    if (style) musicRequest.prompt = style;
    const gender = String(body?.gender || "").toLowerCase(); if (gender === "female" || gender === "male") musicRequest.gender = gender;
    if (body?.reference_id) musicRequest.reference_id = String(body.reference_id);
    if (body?.vocal_id) musicRequest.vocal_id = String(body.vocal_id);
    if (body?.melody_id) musicRequest.melody_id = String(body.melody_id);

    const generated = await mureka("/v1/song/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(musicRequest) });
    if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || generated.data?.error || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });
    const taskId = findTaskId(generated.data);
    if (!taskId) return NextResponse.json({ success: false, error: "Mureka menerima permintaan tetapi tidak mengembalikan Task ID.", data: generated.data }, { status: 502 });
    const providerStatus = findStatus(generated.data);
    const finished = terminal(providerStatus);
    const failed = failure(providerStatus);
    const audio = finished && !failed ? findAudio(generated.data) : null;
    const saved = await saveProject(userId, { title, lyrics, style, model, musicEngine: engine, taskId, status: providerStatus, audioUrl: audio, providerData: { musicEngine: engine, billingProvider: billingProvider(engine), data: generated.data } });
    if (!saved.ok) return NextResponse.json({ success: false, error: "Task berhasil dibuat tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
    return NextResponse.json({ success: true, title, taskId, status: providerStatus, musicEngine: engine, billingProvider: billingProvider(engine), audio, librarySaved: true, data: generated.data });
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik SALVIAN AI MUSIC.", musicEngine: engine }, { status: 500 });
  }
}
