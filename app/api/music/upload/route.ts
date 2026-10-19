import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const ELEVEN_BASE_URL = process.env.ELEVEN_BASE_URL || "https://api.elevenlabs.io";
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = (process.env.SUNO_API_BASE_URL || "https://www.suno-api.io").replace(/\/$/, "");

async function json(response: Response) {
  const raw = await response.text().catch(() => "");
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw }; }
}

function pickId(data: any) {
  const candidates = [data?.id, data?.file_id, data?.fileId, data?.upload_id, data?.uploadId, data?.data?.id, data?.data?.file_id, data?.data?.fileId, data?.data?.upload_id, data?.data?.uploadId, data?.file?.id, data?.file?.file_id, data?.file?.upload_id];
  const id = candidates.find((value) => value !== undefined && value !== null && String(value).trim());
  return id ? String(id) : "";
}

async function murekaUpload(file: File, purpose: "reference" | "remix", timeoutMs?: number) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("purpose", purpose);
  return murekaUploadForm(form, purpose, timeoutMs);
}

async function murekaUploadUrl(url: string, purpose: "reference" | "remix", timeoutMs?: number) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("url", url); form.append("purpose", purpose);
  return murekaUploadForm(form, purpose, timeoutMs);
}

async function murekaUploadForm(form: FormData, purpose: "reference" | "remix", timeoutMs?: number) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store", ...(controller ? { signal: controller.signal } : {}) });
    const data = await json(response);
    if (!response.ok) throw new Error(`Mureka upload ${purpose} gagal (${response.status}): ${data?.error?.message || data?.message || "respons tidak menjelaskan penyebab"}`);
    const id = pickId(data); if (!id) throw new Error(`Mureka tidak mengembalikan ID untuk upload ${purpose}.`);
    return { id, data };
  } catch (error) {
    if (controller && error instanceof Error && error.name === "AbortError") throw new Error(`Mureka upload ${purpose} timeout setelah ${Math.round((timeoutMs || 0) / 1000)} detik.`);
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

async function murekaRemixUpload(file: File) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await murekaUpload(file, "remix"); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /\((429|500|502|503|504)\)/.test(message) || /timeout/i.test(message);
      if (!transient || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Mureka Remix upload gagal.");
}

async function murekaRemixUploadUrl(url: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await murekaUploadUrl(url, "remix"); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /\((429|500|502|503|504)\)/.test(message) || /timeout/i.test(message);
      if (!transient || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Mureka Remix upload gagal.");
}

async function murekaVocal(file: File) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("description", "Karakter vokal creator SALVIAN AI MUSIC");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/song/vocal-clone`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response); if (!response.ok) throw new Error(data?.error?.message || data?.message || `Mureka vocal clone ${response.status}`);
  const id = data?.vocal_id || data?.id || data?.data?.vocal_id || data?.data?.id; if (!id) throw new Error("Mureka tidak mengembalikan Vocal ID.");
  return { id: String(id), data };
}

async function elevenUpload(file: File) {
  if (!ELEVEN_API_KEY) throw new Error("ELEVEN_API_KEY / ELEVENLABS_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file); form.append("extract_composition_plan", "music_v2_5");
  const response = await fetch(`${ELEVEN_BASE_URL}/v1/music/upload`, { method: "POST", headers: { "xi-api-key": ELEVEN_API_KEY, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response); if (!response.ok) throw new Error(data?.detail?.message || data?.message || `Eleven Music upload ${response.status}`);
  const id = data?.song_id || data?.id; if (!id) throw new Error("Eleven Music tidak mengembalikan song_id untuk audio referensi.");
  return { id: String(id), data };
}

async function sunoUpload(file: File, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file); form.append("file_name", file.name); form.append("model", "suno-v6");
  let path = "/api/music/upload-source"; form.append("upload_type", "file_upload");
  if (purpose === "voice") { path = "/api/music/voice-profile/create"; form.append("title", file.name.replace(/\.[^.]+$/, "").slice(0, 80)); form.append("source_kind", "upload"); }
  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response); if (!response.ok || data?.success === false || (data?.code && data.code !== 200)) throw new Error(data?.message || data?.error?.message || `Suno upload ${response.status}`);
  const payload = data?.data || data; const id = purpose === "voice" ? payload?.voice_id : (payload?.clip_id || payload?.song_id || payload?.id);
  if (!id) throw new Error(`Suno tidak mengembalikan ID ${purpose === "voice" ? "voice profile" : "source audio"}.`);
  return { id: String(id), data };
}

function stage2CookieOptions(path = "/api/music") { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path, maxAge: 60 * 60 }; }

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const rawFile = form.get("file");
    const fileUrl = String(form.get("file_url") || "").trim();
    const requestedPurpose = String(form.get("purpose") || "reference").toLowerCase();
    const engine = String(form.get("engine") || "mureka").toLowerCase();
    const purpose: "reference" | "voice" | "remix" = requestedPurpose === "voice" ? "voice" : requestedPurpose === "remix" ? "remix" : "reference";
    if (!(rawFile instanceof File) && !fileUrl) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });
    if (rawFile instanceof File && rawFile.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: `File ${(rawFile.size / 1024 / 1024).toFixed(1)} MB terlalu besar. Mureka files/upload membatasi file langsung sampai 10 MB.` }, { status: 413 });
    const file = rawFile instanceof File ? rawFile : null;
    const name = String(form.get("file_name") || file?.name || fileUrl.split("/").pop() || "audio.mp3").toLowerCase();
    if (!(name.endsWith(".mp3") || name.endsWith(".m4a") || (engine === "suno_v6" && (name.endsWith(".wav") || name.endsWith(".aac") || name.endsWith(".flac") || name.endsWith(".ogg"))))) return NextResponse.json({ success: false, error: "Format audio yang didukung: MP3 atau M4A (Suno juga menerima WAV, AAC, FLAC, dan OGG)." }, { status: 400 });

    let result: { id: string; data: unknown };
    let stage2RemixId = "";
    let referenceId = "";
    let referenceWarning = "";

    if (engine === "mureka") {
      if (purpose === "voice") {
        if (!file) throw new Error("Voice & Vocal memerlukan file langsung.");
        result = await murekaVocal(file);
      } else if (purpose === "remix") {
        result = fileUrl ? await murekaRemixUploadUrl(fileUrl) : await murekaRemixUpload(file!);
        stage2RemixId = result.id;
      } else {
        // Full-duration Remix is the source of truth for Stage-2.
        // Large files arrive here as a public Blob URL, so the 4.5 MB Vercel
        // Function request-body limit is no longer in the audio path.
        const remixResult = fileUrl ? await murekaRemixUploadUrl(fileUrl) : await murekaRemixUpload(file!);
        stage2RemixId = remixResult.id;
        result = remixResult;

        // BOP/reference remains a secondary 30-second reference path.
        try {
          const referenceResult = fileUrl ? await murekaUploadUrl(fileUrl, "reference", 30000) : await murekaUpload(file!, "reference", 30000);
          referenceId = referenceResult.id;
        } catch (error) {
          referenceWarning = error instanceof Error ? error.message : "Upload BOP/reference gagal; Remix penuh tetap siap.";
        }
      }
    } else if (engine === "eleven_music_v2_5") {
      if (!file) throw new Error("Eleven Music memerlukan file langsung.");
      result = await elevenUpload(file); referenceId = result.id;
    } else if (engine === "suno_v6") {
      if (!file) throw new Error("Suno memerlukan file langsung.");
      if (purpose === "remix") return NextResponse.json({ success: false, error: "Mode Remix penuh saat ini hanya tersedia untuk Mureka." }, { status: 400 });
      result = await sunoUpload(file, purpose === "voice" ? "voice" : "reference"); referenceId = result.id;
    } else {
      return NextResponse.json({ success: false, error: "Mesin musik tidak dikenal." }, { status: 400 });
    }

    if (!result.id || typeof result.id !== "string") throw new Error("Mesin musik tidak mengembalikan ID audio yang dapat digunakan.");

    const stage2ClientId = referenceId || (purpose === "reference" && stage2RemixId ? stage2RemixId : "");
    const response = NextResponse.json({
      success: true,
      id: stage2ClientId || (purpose === "remix" ? result.id : ""),
      reference_id: referenceId || null,
      purpose,
      engine,
      stage2Reference: Boolean(referenceId),
      stage2Ready: Boolean(stage2RemixId),
      remix_upload_id: stage2RemixId || (purpose === "remix" ? result.id : null),
      warning: referenceWarning || null,
      data: result.data,
    });

    if (stage2RemixId && engine === "mureka" && (purpose === "reference" || purpose === "remix")) {
      response.cookies.set("salvian_stage2_pending", "1", stage2CookieOptions("/api/music"));
      response.cookies.set("salvian_stage2_remix_id", stage2RemixId, stage2CookieOptions("/api/music"));
      response.cookies.set("salvian_stage2_remix_id_root", stage2RemixId, stage2CookieOptions("/"));
    }
    return response;
  } catch (error) {
    console.error("SALVIAN MUSIC upload error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload audio gagal." }, { status: 500 });
  }
}