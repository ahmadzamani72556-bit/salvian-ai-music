import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = (process.env.SUNO_API_BASE_URL || "https://www.suno-api.io").replace(/\/$/, "");

async function json(response: Response) {
  const raw = await response.text().catch(() => "");
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw }; }
}

function isTrustedBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch { return false; }
}

async function fileFromBlobUrl(url: string, name: string) {
  if (!isTrustedBlobUrl(url)) throw new Error("Audio tidak berasal dari penyimpanan SALVIAN yang valid.");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Gagal membaca Audio dari penyimpanan (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 10 * 1024 * 1024) throw new Error("Audio melebihi batas 10 MB.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("Audio melebihi batas 10 MB.");
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  return new File([buffer], name || "audio.mp3", { type: contentType });
}

async function sunoUpload(file: File, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("file_name", file.name);
  form.append("model", "suno-v6");
  form.append("upload_type", "file_upload");

  let path = "/api/music/upload-source";
  if (purpose === "voice") {
    path = "/api/music/voice-profile/create";
    form.append("title", file.name.replace(/\.[^.]+$/i, "").slice(0, 80));
    form.append("source_kind", "upload");
  }

  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUNO_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await json(response);
  if (!response.ok || data?.success === false || (data?.code && data.code !== 200)) {
    throw new Error(data?.message || data?.error?.message || `Suno upload ${response.status}`);
  }

  const payload = data?.data || data;
  const id = purpose === "voice" ? payload?.voice_id : (payload?.clip_id || payload?.song_id || payload?.id);
  if (!id) throw new Error(`Suno tidak mengembalikan ID ${purpose === "voice" ? "voice profile" : "source audio"}.`);
  return { id: String(id), data };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const fileUrl = String(form.get("file_url") || "").trim();
    const file = form.get("file");
    const purposeRaw = String(form.get("purpose") || "reference").toLowerCase();
    const purpose = purposeRaw === "voice" ? "voice" : "reference";
    const name = String(form.get("file_name") || (file instanceof File ? file.name : "audio.mp3"));

    if (purposeRaw === "remix") {
      return NextResponse.json({ success: false, error: "Mode Remix penuh saat ini hanya tersedia untuk Mureka." }, { status: 400 });
    }

    const sourceFile = file instanceof File ? file : (fileUrl ? await fileFromBlobUrl(fileUrl, name) : null);
    if (!sourceFile) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });
    if (sourceFile.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "Audio melebihi batas 10 MB." }, { status: 413 });

    const allowed = /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(sourceFile.name);
    if (!allowed) return NextResponse.json({ success: false, error: "Format audio yang didukung: MP3, M4A, WAV, AAC, FLAC, dan OGG." }, { status: 400 });

    const result = await sunoUpload(sourceFile, purpose);
    return NextResponse.json({
      success: true,
      id: result.id,
      reference_id: purpose === "reference" ? result.id : null,
      voice_id: purpose === "voice" ? result.id : null,
      purpose,
      engine: "suno_v6",
      stage2Reference: purpose === "reference",
      data: result.data,
    });
  } catch (error) {
    console.error("SALVIAN Suno storage-first upload error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload audio gagal." }, { status: 500 });
  }
}
