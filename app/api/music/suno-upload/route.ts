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
  } catch {
    return false;
  }
}

async function sunoUploadFromUrl(fileUrl: string, name: string, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  if (!isTrustedBlobUrl(fileUrl)) throw new Error("Audio tidak berasal dari penyimpanan SALVIAN yang valid.");

  // IMPORTANT: the verified storage-first flow stores the browser file in
  // Vercel Blob first. Suno then receives the public Blob URL as JSON.
  // This follows Suno's documented `file_url` upload path and avoids sending
  // a second multipart request through the provider parser.
  const path = purpose === "voice"
    ? "/api/music/voice-profile/create"
    : "/api/music/upload-source";

  const body = purpose === "voice"
    ? {
        file_url: fileUrl,
        file_name: name,
        title: name.replace(/\.[^.]+$/i, "").slice(0, 80),
        source_kind: "upload",
      }
    : {
        model: "suno-v6",
        file_url: fileUrl,
        file_name: name,
        upload_type: "file_upload",
      };

  const response = await fetch(`${SUNO_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await json(response);
  if (!response.ok || data?.success === false || (data?.code && data.code !== 200)) {
    throw new Error(data?.message || data?.error?.message || `Suno upload ${response.status}`);
  }

  const payload = data?.data || data;
  const id = purpose === "voice"
    ? payload?.voice_id
    : (payload?.clip_id || payload?.song_id || payload?.id);

  if (!id) {
    throw new Error(`Suno tidak mengembalikan ID ${purpose === "voice" ? "voice profile" : "source audio"}.`);
  }

  return { id: String(id), data };
}

async function sunoUploadFromFile(file: File, name: string, purpose: "reference" | "voice") {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY belum tersedia di Vercel.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("file_name", name);
  if (purpose === "reference") {
    form.append("model", "suno-v6");
    form.append("upload_type", "file_upload");
  } else {
    form.append("title", name.replace(/\.[^.]+$/i, "").slice(0, 80));
    form.append("source_kind", "upload");
  }

  const path = purpose === "voice"
    ? "/api/music/voice-profile/create"
    : "/api/music/upload-source";

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
  const id = purpose === "voice"
    ? payload?.voice_id
    : (payload?.clip_id || payload?.song_id || payload?.id);
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

    // The normal browser path is Blob URL -> JSON file_url -> Suno.
    // Keep direct multipart only as a safe fallback for non-Blob callers.
    const result = fileUrl
      ? await sunoUploadFromUrl(fileUrl, name, purpose)
      : file instanceof File
        ? await sunoUploadFromFile(file, name, purpose)
        : null;

    if (!result) return NextResponse.json({ success: false, error: "File audio belum dipilih." }, { status: 400 });

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
