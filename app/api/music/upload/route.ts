import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 60;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const ELEVEN_BASE_URL = process.env.ELEVEN_BASE_URL || "https://api.elevenlabs.io";
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = (process.env.SUNO_API_BASE_URL || "https://www.suno-api.io").replace(/\/$/, "");

async function json(response: Response) {
  const text = await response.text().catch(() => "");
  try { return text ? JSON.parse(text) : {}; } catch { return { message: text }; }
}

async function murekaUpload(file: File, purpose: "reference" | "audio") {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("purpose", purpose);
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Mureka upload ${response.status}`);
  return { id: data?.id || data?.file_id || data?.fileId, data };
}
async function murekaVocal(file: File) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("description", "Karakter vokal creator SALVIAN AI MUSIC");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/song/vocal-clone`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Mureka vocal clone ${response.status}`);
  return { id: data?.vocal_id || data?.id, data };
}
async function elevenUpload(file: File) {
  if (!ELEVEN_API_KEY) throw new Error("ELEVEN_API_KEY / ELEVENLABS_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("extract_composition_plan", "music_v2_5");
  const response = await fetch(`${ELEVEN_BASE_URL}/v1/music/upload`, { method: "POST", headers: { "xi-api-key": ELEVEN_API_KEY, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response);
  if (!response.ok) throw new Error(data?.detail?.message || data?.message || `Eleven Music upload ${response.status}`);
  const id = data?.song_id || data?.id;
  if (!id) throw new Error("Eleven Music tidak mengembalikan song_id untuk audio referensi.");
  return { id: String(id), data };
}
async function sunoUpload(file: File, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  const form = new FormData(); form.append("file", file, file.name); form.append("file_name", file.name); form.append("model", "suno-v6");
  let path = "/api/music/upload-source";
  form.append("upload_type", "file_upload");
  if (purpose === "voice") { path = "/api/music/voice-profile/create"; form.append("title", file.name.replace(/\.[^.]+$/, "").slice(0, 80)); form.append("source_kind", "upload"); }
  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await json(response);
  if (!response.ok || data?.success === false || (data?.code && data.code !== 200)) throw new Error(data?.message || data?.error?.message || `Suno upload ${response.status}`);
  const payload = data?.data || data;
  const id = purpose === "voice" ? payload?.voice_id : (payload?.clip_id || payload?.song_id || payload?.id);
  if (!id) throw new Error(`Suno tidak mengembalikan ID ${purpose === "voice" ? "voice profile" : "source audio"}.`);
  return { id: String(id), data };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const requestedPurpose = String(form.get("purpose") || "reference").toLowerCase();
    const engine = String(form.get("engine") || "mureka").toLowerCase();
    const purpose = requestedPurpose === "voice" ? "voice" : "reference";
    const workspace = request.headers.get("x-music-workspace")?.trim();
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "Ukuran file maksimal 10 MB." }, { status: 413 });
    const name = file.name.toLowerCase();
    if (!(name.endsWith(".mp3") || name.endsWith(".m4a") || (engine === "suno_v6" && (name.endsWith(".wav") || name.endsWith(".aac") || name.endsWith(".flac") || name.endsWith(".ogg"))))) {
      return NextResponse.json({ success: false, error: "Format audio yang didukung: MP3 atau M4A (Suno juga menerima WAV, AAC, FLAC, dan OGG)." }, { status: 400 });
    }

    let result: { id: string; data: unknown };
    if (engine === "mureka") result = purpose === "voice" ? await murekaVocal(file) : await murekaUpload(file, "reference");
    else if (engine === "eleven_music_v2_5") result = await elevenUpload(file);
    else if (engine === "suno_v6") result = await sunoUpload(file, purpose);
    else return NextResponse.json({ success: false, error: "Mesin musik tidak dikenal." }, { status: 400 });
    if (!result.id || typeof result.id !== "string") throw new Error("Mesin musik tidak mengembalikan ID audio yang dapat digunakan.");

    // Stage 1 keeps using the Mureka reference ID. Stage 2 also needs the
    // original, full-duration bytes because Mureka's reference purpose trims
    // audio to 30 seconds. Keep a private copy keyed by the Mureka file ID.
    // This does not alter the Stage-1 Mureka reference flow.
    let stage2Reference = false;
    if (engine === "mureka" && purpose === "reference" && workspace) {
      const safeWorkspace = workspace.replace(/[^a-zA-Z0-9_-]/g, "_");
      const pathname = `music-stage2-references/${safeWorkspace}/${result.id}`;
      try {
        await put(pathname, file, { access: "private", addRandomSuffix: false });
        stage2Reference = true;
      } catch (blobError) {
        console.error("SALVIAN Stage-2 reference Blob save error", blobError);
      }
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      ...(purpose === "voice" ? { vocal_id: result.id } : {}),
      purpose,
      engine,
      stage2Reference,
      data: result.data,
    });
  } catch (error) {
    console.error("SALVIAN MUSIC upload error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload audio gagal." }, { status: 500 });
  }
}
