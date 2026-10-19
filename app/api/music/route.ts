import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer, ownsMusicTaskServer, updateMusicProjectServer } from "../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const ELEVEN_BASE_URL = process.env.ELEVEN_BASE_URL || "https://api.elevenlabs.io";
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = (process.env.SUNO_API_BASE_URL || "https://www.suno-api.io").replace(/\/$/, "");
const SUNO_GENERATE_PATH = process.env.SUNO_GENERATE_PATH || "/api/music/create/custom";
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || "/api/music/query";
const MUREKA_MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);
const ENGINE_ALIASES = new Map([
  ["mureka", "mureka"],
  ["eleven_music_v2_5", "eleven_music_v2_5"],
  ["eleven", "eleven_music_v2_5"],
  ["suno_v6", "suno_v6"],
  ["suno", "suno_v6"],
]);

type MusicEngine = "mureka" | "eleven_music_v2_5" | "suno_v6";
type ProviderData = Record<string, unknown>;

function workspace(request: NextRequest) {
  return request.headers.get("x-music-workspace")?.trim() || "";
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return /^(https?:\/\/|data:|blob:)/i.test(s) ? s : null;
}

function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 12) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudio(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of [
    "audio_url", "audioUrl", "wav_url", "wavUrl", "flac_url", "flacUrl", "mp3_url", "mp3Url",
    "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl",
    "stream_url", "streamUrl", "play_url", "playUrl", "url",
  ]) {
    const found = cleanUrl(obj[key]);
    if (found) return found;
  }
  for (const key of ["audio", "song", "songs", "clips", "choices", "outputs", "results", "result", "data", "items", "tasks", "task"]) {
    if (obj[key] != null) {
      const found = findAudio(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findTaskId(value: unknown, depth = 0): string | null {
  if (!value || depth > 10) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["song_id", "songId", "id", "task_id", "taskId", "job_id", "jobId", "request_id", "requestId", "clip_id", "clipId"]) {
    if (obj[key] != null && String(obj[key]).trim()) return String(obj[key]).trim();
  }
  for (const key of ["data", "result", "task", "songs", "clips", "tasks"]) {
    if (obj[key]) {
      const found = findTaskId(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findStatus(value: unknown, depth = 0): string {
  if (!value || depth > 10) return "preparing";
  if (Array.isArray(value)) return value.length ? findStatus(value[0], depth + 1) : "preparing";
  if (typeof value !== "object") return "preparing";
  const obj = value as Record<string, unknown>;
  for (const key of ["status", "state", "task_status", "taskStatus"]) {
    if (obj[key] != null) return String(obj[key]).toLowerCase();
  }
  for (const key of ["data", "result", "task", "songs", "clips", "tasks"]) {
    if (obj[key]) {
      const found = findStatus(obj[key], depth + 1);
      if (found !== "preparing") return found;
    }
  }
  return "preparing";
}

function terminal(status: string) {
  return ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));
}

function failure(status: string) {
  return ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));
}

function resolveEngine(body: Record<string, unknown>): MusicEngine {
  const raw = String(body.musicEngine || body.engine || "mureka").trim().toLowerCase();
  return (ENGINE_ALIASES.get(raw) as MusicEngine | undefined) || "mureka";
}

function billingProvider(engine: MusicEngine) {
  if (engine === "mureka") return "mureka";
  if (engine === "eleven_music_v2_5") return "eleven_music_v2_5";
  return "suno_v6";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function mureka(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const response = await fetch(`${MUREKA_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  return { response, data: await readJson(response) as any };
}

function buildUserMusicDirective(body: Record<string, unknown>, provider: "mureka" | "eleven") {
  const rawStyle = String(body.style || "").trim();
  const language = String(body.language || "Indonesia").trim();
  const tempo = Number(body.tempo || 0);
  const gender = String(body.gender || "").trim();
  const instrumental = body.instrumental === true;
  const referenceId = String(body.reference_id || "").trim();
  const vocalId = String(body.vocal_id || "").trim();
  const targetDurationMs = Number(body.reference_duration_ms || 0);
  const targetDuration = Number.isFinite(targetDurationMs) && targetDurationMs >= 10000
    ? `${Math.round(targetDurationMs / 1000)} seconds`
    : "";
  const parts = [
    "SALVIAN AI MUSIC — USER MUSIC DIRECTIVE. Treat this directive as the source of truth.",
    rawStyle || "Create the music according to the user's other controls.",
    `Language: ${language}.`,
    tempo > 0 ? `Target tempo: ${tempo} BPM.` : "",
    gender ? `Preferred vocal gender: ${gender}.` : "",
    instrumental ? "Instrumental only; no vocals." : "",
    referenceId ? "AUDIO REFERENCE ACTIVE: use the reference as the primary musical guide for groove, rhythm, harmonic feel, instrumentation, arrangement, section pacing, dynamics and production character. Keep the new lyrics independent from the reference lyrics. Preserve the reference's recognizable musical character while creating an original result." : "",
    vocalId ? "VOICE/VOCAL REFERENCE ACTIVE: use the uploaded vocal clone as the primary vocal identity and timbre. Preserve its recognizable vocal character and delivery quality. The preferred gender is only a secondary preference when a vocal reference is active." : "",
    referenceId && vocalId ? "REFERENCE + VOCAL MODE: combine the reference music direction with the selected vocal identity. Do not replace either one with a generic voice or generic arrangement. The supplied lyrics may be completely different from the reference while the musical style and vocal character remain guided by the references." : "",
    targetDuration ? `Target song duration: approximately ${targetDuration}. Keep the overall musical pacing and ending close to the reference duration when the model supports duration control.` : "",
    "Follow the user's requested genre, culture, era, rhythm, instruments, mood, vocal character and production details literally. If several styles are requested, preserve the requested blend instead of choosing a generic alternative. Do not copy protected lyrics or claim to reproduce an artist identity.",
  ].filter(Boolean);
  const joined = parts.join("\n");
  return provider === "mureka" ? joined.slice(0, 1024) : joined;
}

function buildElevenPrompt(body: Record<string, unknown>) {
  const lyrics = String(body.lyrics || "").trim();
  const concept = buildUserMusicDirective(body, "eleven");
  const instrumental = body.instrumental === true;
  const arrangement = instrumental
    ? "Use a coherent instrumental arrangement with an immediate identity, development, variation, climax and clean ending."
    : "Use a coherent song arrangement with intro, verses, chorus, development/bridge, final chorus and outro when appropriate to the requested style.";
  const lyricsBudget = Math.max(0, 4000 - concept.length - arrangement.length - 180);
  const clippedLyrics = lyrics.slice(0, lyricsBudget);
  return [
    "Create an original song with Music v2.5.",
    concept,
    arrangement,
    "PROMPT ADHERENCE: The user's concept is the source of truth. Make the requested style clearly recognizable from rhythm, harmony, instrumentation, vocal delivery, arrangement and production throughout the track. Do not drift into a different dominant genre or generic pop unless the user explicitly requests it.",
    instrumental ? "INSTRUMENTAL ONLY." : "Use the supplied lyrics as the lyrical source and do not replace them with unrelated lyrics.",
    clippedLyrics ? `LYRICS:\n${clippedLyrics}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 4100);
}

async function elevenCompose(body: Record<string, unknown>) {
  if (!ELEVEN_API_KEY) throw new Error("ELEVEN_API_KEY / ELEVENLABS_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const prompt = buildElevenPrompt(body);
  const durationMs = Math.min(Math.max(Number(body.durationMs || 180000), 3000), 600000);
  const planResponse = await fetch(`${ELEVEN_BASE_URL}/v1/music/plan`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: durationMs, model_id: "music_v2_5" }),
    cache: "no-store",
  });
  const planData = await readJson(planResponse) as any;
  const compositionPlan = planResponse.ok && Array.isArray(planData?.chunks) ? planData : null;
  const requestBody: Record<string, unknown> = { model_id: "music_v2_5", music_length_ms: durationMs, force_instrumental: body.instrumental === true, store_for_inpainting: false };
  if (compositionPlan) {
    compositionPlan.chunks = compositionPlan.chunks.map((chunk: any) => ({ ...chunk, context_adherence: "high" }));
    const conditioningIds = [body.reference_id, body.vocal_id].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (conditioningIds.length && compositionPlan.chunks.length) {
      compositionPlan.chunks[0] = { ...compositionPlan.chunks[0], conditioning_ref: { song_id: String(conditioningIds[0]), range: { start_ms: 0, end_ms: 30000 } }, condition_strength: "high" };
      if (conditioningIds.length > 1 && compositionPlan.chunks.length > 1) compositionPlan.chunks[1] = { ...compositionPlan.chunks[1], conditioning_ref: { song_id: String(conditioningIds[1]), range: { start_ms: 0, end_ms: 30000 } }, condition_strength: "high" };
    }
    requestBody.composition_plan = compositionPlan;
  } else {
    requestBody.prompt = prompt;
  }
  const response = await fetch(`${ELEVEN_BASE_URL}/v1/music?output_format=mp3_48000_192`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(error || `Eleven Music API ${response.status}`);
  }
  const audio = Buffer.from(await response.arrayBuffer()).toString("base64");
  const songId = response.headers.get("song-id") || `eleven-${crypto.randomUUID()}`;
  return { taskId: songId, status: "completed", audioBase64: audio, contentType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg", data: { song_id: songId, model: "music_v2_5", prompt, compositionPlan } };
}

async function sunoRequest(path: string, init: RequestInit = {}) {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  return { response, data: await readJson(response) };
}

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
      const taskId = String(body.taskId || body.task_id || body.id || "").trim();
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      if (!(await ownsMusicTaskServer(userId, taskId))) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library workspace ini." }, { status: 404 });
      if (engine === "mureka") {
        let q = await mureka(`/v1/song/query/${encodeURIComponent(taskId)}`);
        if (!q.response.ok) return NextResponse.json({ success: false, taskId, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
        let providerStatus = findStatus(q.data);
        const failed = failure(providerStatus);
        let audio = failed ? null : findAudio(q.data);
        if (!failed && providerStatus === "succeeded" && !audio) {
          await new Promise(resolve => setTimeout(resolve, 800));
          const retry = await mureka(`/v1/song/query/${encodeURIComponent(taskId)}`);
          if (retry.response.ok) {
            q = retry;
            providerStatus = findStatus(q.data);
            audio = failure(providerStatus) ? null : findAudio(q.data);
          }
        }
        const finished = failed || Boolean(audio);
        const normalizedStatus = failed ? providerStatus : audio ? "succeeded" : providerStatus === "succeeded" ? "finalizing_audio" : providerStatus;
        await updateMusicProjectServer(userId, taskId, normalizedStatus, audio, { musicEngine: engine, billingProvider: billingProvider(engine), providerData: q.data }).catch(error => console.error("MUSIC LIBRARY STATUS ERROR", error));
        return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: normalizedStatus, providerStatus, audio, url: audio, finished, failed, data: q.data });
      }
      if (engine === "eleven_music_v2_5") {
        return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: "completed", finished: true, failed: false, audio: `/api/music/audio?taskId=${encodeURIComponent(taskId)}&workspace=${encodeURIComponent(userId)}` });
      }
      const q = await sunoRequest(SUNO_STATUS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song_ids: [taskId], model: "suno-v6" }) });
      if (!q.response.ok) return NextResponse.json({ success: false, taskId, error: `Suno Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const providerStatus = findStatus(q.data);
      const failed = failure(providerStatus);
      const audio = failed ? null : findAudio(q.data);
      const finished = terminal(providerStatus) || Boolean(audio);
      const normalizedStatus = finished && audio ? "succeeded" : providerStatus;
      await updateMusicProjectServer(userId, taskId, normalizedStatus, audio, { musicEngine: engine, billingProvider: billingProvider(engine), providerData: q.data }).catch(error => console.error("MUSIC LIBRARY STATUS ERROR", error));
      return NextResponse.json({ success: true, taskId, musicEngine: engine, billingProvider: billingProvider(engine), status: normalizedStatus, providerStatus, audio, url: audio, finished, failed, data: q.data });
    }

    if (body.instrumental === true && engine === "mureka") return NextResponse.redirect(new URL("/api/music/instrumental", request.url), 307);
    const lyrics = String(body.lyrics || "").trim();
    if (!lyrics && body.instrumental !== true) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });
    const title = String(body.title || "Salvian AI Song").slice(0, 160);
    const style = String(body.style || "").trim().slice(0, 1000);

    if (engine === "eleven_music_v2_5") {
      const generated = await elevenCompose(body);
      const taskId = generated.taskId;
      const audioUrl = `/api/music/audio?taskId=${encodeURIComponent(taskId)}&workspace=${encodeURIComponent(userId)}`;
      const saved = await saveProject(userId, { title, lyrics, style, model: "music_v2_5", musicEngine: engine, taskId, status: "completed", audioUrl, providerData: { musicEngine: engine, billingProvider: billingProvider(engine), audioBase64: generated.audioBase64, contentType: generated.contentType, data: generated.data } });
      if (!saved.ok) return NextResponse.json({ success: false, error: "Eleven Music selesai tetapi Library gagal menyimpan hasil.", taskId, librarySaved: false }, { status: 503 });
      return NextResponse.json({ success: true, title, taskId, status: "completed", musicEngine: engine, billingProvider: billingProvider(engine), audio: audioUrl, librarySaved: true, data: generated.data });
    }

    if (engine === "suno_v6") {
      const gender = String(body.gender || "").trim().toLowerCase();
      const hasReference = typeof body.reference_id === "string" && Boolean(body.reference_id.trim());
      const hasVoice = typeof body.vocal_id === "string" && Boolean(body.vocal_id.trim());
      let generated: { response: Response; data: any };
      if (hasReference && hasVoice) {
        generated = await sunoRequest("/api/music/voice-profile/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "suno-v6", voice_id: String(body.vocal_id), song_clip_id: String(body.reference_id), lyrics: lyrics.slice(0, 3000), style_requirements: style || "Follow the reference music's rhythm, arrangement and production while singing the supplied original lyrics.", title, vocal_gender: gender, audio_weight: 0.85, max_mode: false }) });
      } else if (hasVoice) {
        generated = await sunoRequest("/api/music/voice-profile/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "suno-v6", voice_id: String(body.vocal_id), lyrics: lyrics.slice(0, 3000), style_requirements: style || "Create an original arrangement for the supplied lyrics using the selected voice profile.", title, vocal_gender: gender, max_mode: false }) });
      } else if (hasReference) {
        generated = await sunoRequest("/api/music/generate-from-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "suno-v6", sourceClipId: String(body.reference_id), prompt: lyrics.slice(0, 3000), customMode: true, style: style || "Preserve the reference track's broad rhythm, arrangement and production character", title, instrumental: body.instrumental === true, vocalGender: gender, audio_weight: 0.85, waitAudio: false }) });
      } else {
        const payload: ProviderData = { model: "suno-v6", lyrics: lyrics.slice(0, 3000), style_tags: style || "pop, modern, emotional", song_title: title, instrumental: body.instrumental === true };
        if (!body.instrumental && ["male", "female", "m", "f"].includes(gender)) payload.vocal_gender = gender;
        if (typeof body.styleWeight === "number") payload.style_weight = Math.min(Math.max(body.styleWeight, 0), 1);
        if (typeof body.weirdness === "number") payload.weirdness_constraint = Math.min(Math.max(body.weirdness, 0), 1);
        if (Number.isInteger(body.variety)) payload.variety = Math.min(Math.max(Number(body.variety), 0), 4);
        generated = await sunoRequest(SUNO_GENERATE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.message || generated.data?.error?.message || "Suno API " + generated.response.status, data: generated.data, musicEngine: engine }, { status: generated.response.status });
      const taskId = findTaskId(generated.data);
      if (!taskId) return NextResponse.json({ success: false, error: "Suno menerima permintaan tetapi tidak mengembalikan Song ID.", data: generated.data, musicEngine: engine }, { status: 502 });
      const providerStatus = findStatus(generated.data);
      const audio = findAudio(generated.data);
      const finished = terminal(providerStatus) || Boolean(audio);
      const failed = failure(providerStatus);
      const saved = await saveProject(userId, { title, lyrics, style, model: "suno-v6", musicEngine: engine, taskId, status: providerStatus, audioUrl: audio, providerData: { musicEngine: engine, billingProvider: billingProvider(engine), hasReference, hasVoice, data: generated.data } });
      if (!saved.ok) return NextResponse.json({ success: false, error: "Suno berhasil menerima permintaan tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
      return NextResponse.json({ success: true, title, taskId, status: providerStatus, musicEngine: engine, billingProvider: billingProvider(engine), audio, librarySaved: true, finished, failed, data: generated.data });
    }

    const requestedModel = String(body.model || "mureka-9.5").trim();
    const model = MUREKA_MODELS.has(requestedModel) ? requestedModel : "mureka-9.5";
    const requestedN = Number(body.n);
    const n = Number.isFinite(requestedN) ? Math.min(Math.max(Math.floor(requestedN), 1), 3) : 1;
    const referenceId = typeof body.reference_id === "string" ? body.reference_id.trim() : "";
    const vocalId = typeof body.vocal_id === "string" ? body.vocal_id.trim() : "";
    if (model === "mureka-o2" && (vocalId || body.melody_id)) {
      return NextResponse.json({ success: false, error: "Model Mureka O2 tidak mendukung Voice & Vocal atau Melody Reference. Pilih Standard, Pro, atau Adroit untuk tahap 2." }, { status: 400 });
    }
    const musicRequest: ProviderData = { lyrics: lyrics.slice(0, 5000), model, n, stream: body.stream === true && body.disable_stream !== true };
    if (style || referenceId || vocalId) musicRequest.prompt = buildUserMusicDirective(body, "mureka");
    const gender = String(body.gender || "").toLowerCase();
    if (gender === "female" || gender === "male") musicRequest.gender = gender;
    if (referenceId) musicRequest.reference_id = referenceId;
    if (vocalId) musicRequest.vocal_id = vocalId;
    if (body.melody_id) musicRequest.melody_id = String(body.melody_id);
    const generated = await mureka("/v1/song/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(musicRequest) });
    if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || generated.data?.error || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });
    const taskId = findTaskId(generated.data);
    if (!taskId) return NextResponse.json({ success: false, error: "Mureka menerima permintaan tetapi tidak mengembalikan Task ID." }, { status: 502 });
    const providerStatus = findStatus(generated.data);
    const finished = failure(providerStatus) || Boolean(findAudio(generated.data));
    const failed = failure(providerStatus);
    const audio = finished && !failed ? findAudio(generated.data) : null;
    const saved = await saveProject(userId, {
      title,
      lyrics,
      style,
      model,
      musicEngine: engine,
      taskId,
      status: providerStatus,
      audioUrl: audio,
      providerData: {
        musicEngine: engine,
        billingProvider: billingProvider(engine),
        stage: referenceId || vocalId ? "stage2-reference-vocal" : "stage1-text",
        hasReference: Boolean(referenceId),
        hasVoice: Boolean(vocalId),
        targetReferenceDurationMs: Number(body.reference_duration_ms || 0) || null,
        data: generated.data,
      },
    });
    if (!saved.ok) return NextResponse.json({ success: false, error: "Task berhasil dibuat tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
    return NextResponse.json({ success: true, title, taskId, status: providerStatus, musicEngine: engine, billingProvider: billingProvider(engine), audio, librarySaved: true, finished, data: generated.data });
  } catch (error) {
    console.error("MUSIC API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik SALVIAN AI MUSIC.", musicEngine: engine }, { status: 500 });
  }
}
