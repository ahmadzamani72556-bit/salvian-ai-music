import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {} as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw } as Record<string, unknown>;
  }
}

async function saveTask(workspace: string, input: {
  title: string;
  lyrics: string;
  prompt: string;
  taskId: string;
  status: string;
  provider: unknown;
}) {
  return createMusicProjectServer(workspace, {
    title,
    lyrics,
    style: prompt,
    model: "mureka-remix",
    taskId,
    status,
    audioUrl: null,
    providerData: {
      musicEngine: "mureka",
      billingProvider: "mureka",
      stage: "stage2-reference-duration-remix",
      data: provider,
    },
  });
}

/**
 * Stage-2 full-reference Mureka Remix path.
 *
 * Normal reference_id generation is intentionally not used here because the
 * provider's `reference` purpose is fixed to a 30-second reference. This path
 * uploads the full source as `purpose=remix` and then starts /song/remix.
 *
 * Large files arrive here only as a public URL. The browser uploads them
 * directly to Vercel Blob first, so the audio bytes never pass through this
 * Vercel Function request body.
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

  let referenceUrl = "";
  let audioFile: File | null = null;
  let lyrics = "";
  let prompt = "";
  let title = "Salvian AI Music — Reference Duration";
  let n = 1;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    referenceUrl = cleanText(body.reference_url || body.referenceUrl);
    lyrics = cleanText(body.lyrics);
    prompt = cleanText(body.prompt || body.style);
    title = cleanText(body.title) || title;
    const nRaw = Number(body.n || 1);
    n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: "Form data tidak valid." }, { status: 400 });
    const audio = form.get("audio");
    if (audio instanceof File) audioFile = audio;
    referenceUrl = cleanText(form.get("reference_url"));
    lyrics = cleanText(form.get("lyrics"));
    prompt = cleanText(form.get("prompt"));
    title = cleanText(form.get("title")) || title;
    const nRaw = Number(cleanText(form.get("n")) || "1");
    n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;
  }

  if (!lyrics) return NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 });
  if (lyrics.length > 5000) return NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter untuk Mureka." }, { status: 400 });
  if (prompt.length > 1024) return NextResponse.json({ success: false, error: "Konsep musik maksimal 1024 karakter untuk Mureka." }, { status: 400 });

  try {
    // Preferred path: a public URL created by the direct browser upload.
    // The Mureka API accepts `url` instead of binary `file`, so large files do
    // not have to traverse the Vercel Function request body.
    const upload = new FormData();
    upload.append("purpose", "remix");

    if (referenceUrl) {
      if (!/^https?:\/\//i.test(referenceUrl)) {
        return NextResponse.json({ success: false, error: "URL Audio Referensi tidak valid." }, { status: 400 });
      }
      upload.append("url", referenceUrl);
    } else if (audioFile) {
      // Backward-compatible fallback for direct callers. This remains subject
      // to the provider/server request limits; the UI uses reference_url.
      if (audioFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "Jalur binary lama hanya mendukung maksimal 10 MB. Gunakan upload Audio Referensi dari Studio." }, { status: 413 });
      }
      const mime = audioFile.type || "audio/mpeg";
      if (!/^audio\/(mpeg|mp4|x-m4a|m4a)$/i.test(mime) && !/\.(mp3|m4a)$/i.test(audioFile.name)) {
        return NextResponse.json({ success: false, error: "Gunakan audio MP3 atau M4A untuk Remix Mureka." }, { status: 400 });
      }
      upload.append("file", new Blob([await audioFile.arrayBuffer()], { type: mime }), audioFile.name || "reference.mp3");
    } else {
      return NextResponse.json({ success: false, error: "Audio Referensi belum tersedia." }, { status: 400 });
    }

    const uploadResponse = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
      body: upload,
      cache: "no-store",
    });
    const uploadData = await readJson(uploadResponse);
    if (!uploadResponse.ok) {
      return NextResponse.json(
        { success: false, stage: "upload", error: "Mureka menolak Audio Referensi untuk mode Remix.", provider: uploadData },
        { status: uploadResponse.status },
      );
    }

    const uploadId = cleanText(uploadData.id);
    if (!uploadId) {
      return NextResponse.json({ success: false, stage: "upload", error: "Mureka tidak mengembalikan upload_id." }, { status: 502 });
    }

    const remixPrompt = prompt || "Preserve the source audio's musical style, groove, rhythm, harmonic feel, instrumentation, arrangement, pacing, dynamics, production character and overall duration as closely as the Remix model supports. Create an original song using the supplied new lyrics.";
    const remixResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MUREKA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ upload_audio_id: uploadId, lyrics, prompt: remixPrompt.slice(0, 1024), n }),
      cache: "no-store",
    });
    const remixData = await readJson(remixResponse);
    if (!remixResponse.ok) {
      return NextResponse.json(
        { success: false, stage: "remix", error: "Mureka gagal memulai Remix Audio Referensi.", provider: remixData },
        { status: remixResponse.status },
      );
    }

    const taskId = cleanText(remixData.id || remixData.task_id);
    if (!taskId) {
      return NextResponse.json({ success: false, stage: "remix", error: "Mureka menerima Remix tetapi tidak mengembalikan Task ID.", provider: remixData }, { status: 502 });
    }

    const status = cleanText(remixData.status) || "preparing";
    const saved = await saveTask(workspace, {
      title,
      lyrics,
      prompt: remixPrompt,
      taskId,
      status,
      provider: { upload: uploadData, remix: remixData, referenceUrl },
    });
    if (!saved) {
      return NextResponse.json({ success: false, error: "Mureka menerima task tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      mode: "mureka-reference-duration-remix",
      title,
      taskId,
      task_id: taskId,
      status,
      musicEngine: "mureka",
      billingProvider: "mureka",
      librarySaved: true,
      provider: remixData,
      note: "Audio Referensi dikirim sebagai source Remix penuh melalui URL. Mureka mendukung source Remix 10–350 detik; endpoint Remix tidak menyediakan vocal_id.",
    });
  } catch (error) {
    console.error("SALVIAN MUREKA reference-duration remix error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan jalur Remix Mureka." }, { status: 500 });
  }
}
