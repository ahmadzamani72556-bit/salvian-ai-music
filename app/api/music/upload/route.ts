import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

type UploadPurpose = "reference" | "melody" | "audio";

async function verifyAuth(auth: string | null) {
  if (!auth || !/^Bearer\s+/i.test(auth)) return false;
  try {
    const response = await fetch(`${DATA_API}/rpc/salvian_get_my_credits`, {
      method: "POST",
      headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function murekaUpload(file: File, purpose: UploadPurpose) {
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
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function murekaVocalClone(file: File) {
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
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAuth(request.headers.get("authorization")))) {
      return NextResponse.json({ success: false, error: "Sesi akun tidak valid. Silakan masuk melalui Akun SALVIAN AI CREATOR." }, { status: 401 });
    }
    const form = await request.formData();
    const file = form.get("file");
    const requestedPurpose = String(form.get("purpose") || "reference").toLowerCase();
    const purpose: UploadPurpose = requestedPurpose === "melody" ? "melody" : requestedPurpose === "audio" ? "audio" : "reference";
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "Ukuran file maksimal 10 MB." }, { status: 413 });
    const name = file.name.toLowerCase();
    const validMp3M4a = name.endsWith(".mp3") || name.endsWith(".m4a");
    const validMelody = validMp3M4a || name.endsWith(".mid") || name.endsWith(".midi");
    if (!validMelody || (purpose !== "melody" && !validMp3M4a)) {
      return NextResponse.json({ success: false, error: purpose === "melody" ? "Format melody yang didukung: MP3, M4A, MID, atau MIDI." : "Format audio yang didukung: MP3 atau M4A." }, { status: 400 });
    }

    if (requestedPurpose === "voice") {
      const { response, data } = await murekaVocalClone(file);
      if (!response.ok) return NextResponse.json({ success: false, error: data?.error?.message || data?.message || `Mureka ${response.status}`, data }, { status: response.status });
      return NextResponse.json({ success: true, vocal_id: data?.vocal_id || data?.id || null, data });
    }

    const { response, data } = await murekaUpload(file, purpose);
    if (!response.ok) return NextResponse.json({ success: false, error: data?.error?.message || data?.message || `Mureka ${response.status}`, data }, { status: response.status });
    return NextResponse.json({ success: true, id: data?.id || data?.file_id || data?.fileId || null, purpose, data });
  } catch (error) {
    console.error("SALVIAN MUSIC upload error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload audio gagal." }, { status: 500 });
  }
}
