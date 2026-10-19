import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

/**
 * Stage-2 reference-duration path.
 *
 * This endpoint intentionally does NOT change /api/music stage 1.
 * It uses Mureka's dedicated Remix API because normal `reference_id`
 * uploads are limited to a 30-second reference, while `purpose=remix`
 * accepts 10–350 seconds of source audio.
 *
 * The generated song keeps the supplied new lyrics and prompt while the
 * full uploaded reference is supplied as the remix source.
 */
export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) {
    return NextResponse.json(
      { success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." },
      { status: 503 },
    );
  }

  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) {
    return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ success: false, error: "Form data tidak valid." }, { status: 400 });
  }

  const audio = form.get("audio");
  const lyrics = text(form.get("lyrics"));
  const prompt = text(form.get("prompt"));
  const title = text(form.get("title")) || "Salvian AI Music — Reference Duration";
  const nRaw = Number(text(form.get("n")) || "1");
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;

  if (!(audio instanceof File)) {
    return NextResponse.json({ success: false, error: "Audio Referensi belum dipilih." }, { status: 400 });
  }
  if (!lyrics) {
    return NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 });
  }
  if (lyrics.length > 5000) {
    return NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter untuk Mureka." }, { status: 400 });
  }
  if (prompt.length > 1024) {
    return NextResponse.json({ success: false, error: "Konsep musik maksimal 1024 karakter untuk Mureka." }, { status: 400 });
  }
  if (audio.size > 10 * 1024 * 1024) {
    return NextResponse.json({ success: false, error: "Audio Referensi maksimal 10 MB." }, { status: 400 });
  }

  const mime = audio.type || "audio/mpeg";
  if (!/^audio\/(mpeg|mp4|x-m4a|m4a|aac|wav|x-wav)$/i.test(mime) && !/\.(mp3|m4a)$/i.test(audio.name)) {
    return NextResponse.json({ success: false, error: "Gunakan audio MP3 atau M4A untuk Remix Mureka." }, { status: 400 });
  }

  try {
    // Mureka's Remix upload supports 10–350 seconds, unlike purpose=reference,
    // which is fixed to a 30-second reference. The provider validates duration.
    const upload = new FormData();
    upload.append("purpose", "remix");
    upload.append("file", new Blob([await audio.arrayBuffer()], { type: mime }), audio.name || "reference.mp3");

    const uploadResponse = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
      body: upload,
      cache: "no-store",
    });
    const uploadData = await readJson(uploadResponse);
    if (!uploadResponse.ok) {
      return NextResponse.json(
        { success: false, stage: "upload", error: "Mureka menolak Audio Referensi untuk mode durasi penuh.", provider: uploadData },
        { status: uploadResponse.status },
      );
    }

    const uploadId = String(uploadData?.id || "").trim();
    if (!uploadId) {
      return NextResponse.json({ success: false, stage: "upload", error: "Mureka tidak mengembalikan upload_id." }, { status: 502 });
    }

    const remixResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MUREKA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        upload_audio_id: uploadId,
        lyrics,
        prompt: prompt || "Preserve the source audio's musical style, groove, arrangement, pacing, dynamics and overall duration. Create an original song using the supplied new lyrics.",
        n,
      }),
      cache: "no-store",
    });
    const remixData = await readJson(remixResponse);
    if (!remixResponse.ok) {
      return NextResponse.json(
        { success: false, stage: "remix", error: "Mureka gagal memulai Remix Audio Referensi.", provider: remixData },
        { status: remixResponse.status },
      );
    }

    const taskId = String(remixData?.id || remixData?.task_id || "").trim();
    return NextResponse.json({
      success: true,
      mode: "mureka-reference-duration-remix",
      title,
      upload_id: uploadId,
      task_id: taskId || null,
      status: remixData?.status || "preparing",
      provider: remixData,
      note: "Mode ini menggunakan audio referensi penuh 10–350 detik. Voice/Vocal clone tidak diterapkan pada endpoint Remix karena API Mureka Remix tidak menyediakan vocal_id.",
    });
  } catch (error) {
    console.error("SALVIAN MUREKA reference-duration remix error", error);
    return NextResponse.json({ success: false, error: "Gagal menghubungkan jalur Remix Mureka." }, { status: 500 });
  }
}
