import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const candidates = [
    data?.id,
    data?.file_id,
    data?.fileId,
    data?.upload_id,
    data?.uploadId,
    data?.data?.id,
    data?.data?.file_id,
    data?.data?.fileId,
    data?.data?.upload_id,
    data?.data?.uploadId,
    data?.file?.id,
    data?.file?.file_id,
    data?.file?.upload_id,
  ];
  const id = candidates.find((value) => value !== undefined && value !== null && String(value).trim());
  return id ? String(id) : "";
}

async function murekaUpload(file: File, purpose: "reference" | "remix") {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("purpose", purpose);
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Mureka upload ${purpose} ${response.status}`);
  const id = pickId(data);
  if (!id) throw new Error(`Mureka tidak mengembalikan ID untuk upload ${purpose}.`);
  return { id, data };
}

async function murekaVocal(file: File) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("description", "Karakter vokal creator SALVIAN AI MUSIC");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/song/vocal-clone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Mureka vocal clone ${response.status}`);
  const id = data?.vocal_id || data?.id || data?.data?.vocal_id || data?.data?.id;
  if (!id) throw new Error("Mureka tidak mengembalikan Vocal ID.");
  return { id: String(id), data };
}

async function elevenUpload(file: File) {
  if (!ELEVEN_API_KEY) throw new Error("ELEVEN_API_KEY / ELEVENLABS_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file);
  form.append("extract_composition_plan", "music_v2_5");
  const response = await fetch(`${ELEVEN_BASE_URL}/v1/music/upload`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_API_KEY, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.detail?.message || data?.message || `Eleven Music upload ${response.status}`);
  const id = data?.song_id || data?.id;
  if (!id) throw new Error("Eleven Music tidak mengembalikan song_id untuk audio referensi.");
  return { id: String(id), data };
}

async function sunoUpload(file: File, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file);
  form.append("file_name", file.name);
  form.append("model", "suno-v6");
  let path = "/api/music/upload-source";
  form.append("upload_type", "file_upload");
  if (purpose === "voice") {
    path = "/api/music/voice-profile/create";
    form.append("title", file.name.replace(/\.[^.]+$/, "").slice(0, 80));
    form.append("source_kind", "upload");
  }
  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await json(response);
  if (!response.ok || data?.success === false || (data?.code && data.code !== 200)) throw new Error(data?.message || data?.error?.message || `Suno upload ${response.status}`);
  const payload = data?.data || data;
  const id = purpose === "voice" ? payload?.voice_id : (payload?.clip_id || payload?.song_id || payload?.id);
  if (!id) throw new Error(`Suno tidak mengembalikan ID ${purpose === "voice" ? "voice profile" : "source audio"}.`);
  return { id: String(id), data };
}

function stage2CookieOptions(path = "/api/music") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge: 60 * 60,
  };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const requestedPurpose = String(form.get("purpose") || "reference").toLowerCase();
    const engine = String(form.get("engine") || "mureka").toLowerCase();
    const purpose: "reference" | "voice" | "remix" = requestedPurpose === "voice" ? "voice" : requestedPurpose === "remix" ? "remix" : "reference";
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "Ukuran file maksimal 10 MB." }, { status: 413 });
    const name = file.name.toLowerCase();
    if (!(name.endsWith(".mp3") || name.endsWith(".m4a") || (engine === "suno_v6" && (name.endsWith(".wav") || name.endsWith(".aac") || name.endsWith(".flac") || name.endsWith(".ogg"))))) {
      return NextResponse.json({ success: false, error: "Format audio yang didukung: MP3 atau M4A (Suno juga menerima WAV, AAC, FLAC, dan OGG)." }, { status: 400 });
    }

    let result: { id: string; data: unknown };
    let stage2RemixId = "";

    if (engine === "mureka") {
      if (purpose === "voice") {
        result = await murekaVocal(file);
      } else if (purpose === "remix") {
        // Explicit Stage-2 fallback: upload the original full file with the
        // Mureka remix purpose and return that upload ID directly.
        result = await murekaUpload(file, "remix");
        stage2RemixId = result.id;
      } else {
        // Keep the existing 30-second reference upload for Stage 1.
        result = await murekaUpload(file, "reference");
        // Also upload the same original file with purpose=remix. This is the
        // authoritative full-duration source for Stage 2.
        const remix = await murekaUpload(file, "remix");
        stage2RemixId = remix.id;
      }
    } else if (engine === "eleven_music_v2_5") {
      result = await elevenUpload(file);
    } else if (engine === "suno_v6") {
      if (purpose === "remix") return NextResponse.json({ success: false, error: "Mode Remix penuh saat ini hanya tersedia untuk Mureka." }, { status: 400 });
      result = await sunoUpload(file, purpose === "voice" ? "voice" : "reference");
    } else {
      return NextResponse.json({ success: false, error: "Mesin musik tidak dikenal." }, { status: 400 });
    }

    if (!result.id || typeof result.id !== "string") throw new Error("Mesin musik tidak mengembalikan ID audio yang dapat digunakan.");

    const response = NextResponse.json({
      success: true,
      id: result.id,
      ...(purpose === "voice" ? { vocal_id: result.id } : {}),
      purpose,
      engine,
      stage2Reference: Boolean(stage2RemixId),
      stage2Ready: Boolean(stage2RemixId),
      remix_upload_id: stage2RemixId || (purpose === "remix" ? result.id : null),
      data: result.data,
    });

    if (stage2RemixId && engine === "mureka" && (purpose === "reference" || purpose === "remix")) {
      // Set both the API-path cookie and a root-scoped backup. The latter makes
      // the handoff survive direct /api/music/remix calls as well as the
      // middleware bridge, while remaining HttpOnly.
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
