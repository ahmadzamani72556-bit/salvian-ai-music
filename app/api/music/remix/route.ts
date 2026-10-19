import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {} as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

function isSupportedAudio(pathname: string, contentType: string) {
  return /\.(mp3|m4a)$/i.test(pathname) || /^(audio\/mpeg|audio\/mp3|audio\/mp4|audio\/x-m4a)$/i.test(contentType);
}

async function loadReferenceFromBlob(referenceUrl: string) {
  const parsed = new URL(referenceUrl);
  const isVercelBlob = /\.(private|public)\.blob\.vercel-storage\.com$/i.test(parsed.hostname);

  if (!isVercelBlob) {
    const response = await fetch(referenceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Audio Referensi tidak dapat dibaca dari URL (${response.status}).`);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const bytes = await response.arrayBuffer();
    return {
      bytes,
      contentType,
      filename: decodeURIComponent(parsed.pathname.split("/").pop() || "reference.mp3"),
    };
  }

  const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!pathname) throw new Error("Path Audio Referensi Blob tidak valid.");

  const access = /\.private\.blob\.vercel-storage\.com$/i.test(parsed.hostname) ? "private" : "public";
  const result = await get(pathname, { access });
  if (!result) throw new Error("Audio Referensi tidak ditemukan di Blob.");

  const bytes = await new Response(result.stream).arrayBuffer();
  const contentType = result.blob.contentType || "application/octet-stream";
  const filename = pathname.split("/").pop() || "reference.mp3";

  return { bytes, contentType, filename };
}

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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const referenceUrl = text(body.reference_url || body.referenceUrl);
  const lyrics = text(body.lyrics);
  const prompt = text(body.prompt || body.style);
  const title = text(body.title) || "Salvian AI Music — Reference Remix";
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;

  if (!/^https:\/\//i.test(referenceUrl)) {
    return NextResponse.json({ success: false, error: "Audio Referensi belum tersedia atau URL tidak valid." }, { status: 400 });
  }
  if (!lyrics) {
    return NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 });
  }
  if (lyrics.length > 5000) {
    return NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 });
  }

  const remixPrompt = (
    prompt ||
    "Pertahankan karakter musik dari Audio Referensi: groove, ritme, harmoni, instrumen, aransemen, dinamika, pacing, nuansa produksi, dan struktur/durasi sumber sedekat mungkin dengan kemampuan Remix. Gunakan lirik baru secara independen dan buat hasil musik original."
  ).slice(0, 1024);

  try {
    // Keep the user's private Blob store private. The server reads the reference
    // using its Blob credentials, then sends the bytes to Mureka as multipart data.
    // This avoids exposing BLOB_READ_WRITE_TOKEN and avoids requiring Mureka to
    // authenticate against a private Blob URL.
    const reference = await loadReferenceFromBlob(referenceUrl);

    if (reference.bytes.byteLength > MAX_REFERENCE_BYTES) {
      return NextResponse.json(
        { success: false, stage: "upload", error: "Audio Referensi Remix maksimal 10 MB." },
        { status: 400 },
      );
    }
    if (!isSupportedAudio(reference.filename, reference.contentType)) {
      return NextResponse.json(
        { success: false, stage: "upload", error: "Audio Referensi Remix harus MP3 atau M4A." },
        { status: 400 },
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("purpose", "remix");
    uploadForm.append(
      "file",
      new Blob([reference.bytes], { type: reference.contentType }),
      reference.filename,
    );

    const uploadResponse = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
      body: uploadForm,
      cache: "no-store",
    });
    const uploadData = await readJson(uploadResponse);

    if (!uploadResponse.ok) {
      const providerReason = text(uploadData.message || uploadData.error || uploadData.failed_reason || uploadData.detail);
      return NextResponse.json(
        {
          success: false,
          stage: "upload",
          error: providerReason
            ? `Mureka menolak Audio Referensi Remix: ${providerReason}`
            : "Mureka menolak Audio Referensi Remix.",
          provider: uploadData,
        },
        { status: uploadResponse.status },
      );
    }

    const uploadId = text(uploadData.id || uploadData.upload_id);
    if (!uploadId) {
      return NextResponse.json(
        { success: false, stage: "upload", error: "Mureka tidak mengembalikan upload_id.", provider: uploadData },
        { status: 502 },
      );
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
        prompt: remixPrompt,
        n,
      }),
      cache: "no-store",
    });
    const remixData = await readJson(remixResponse);

    if (!remixResponse.ok) {
      const providerReason = text(remixData.message || remixData.error || remixData.failed_reason || remixData.detail);
      return NextResponse.json(
        {
          success: false,
          stage: "remix",
          error: providerReason
            ? `Mureka gagal memulai proses Remix: ${providerReason}`
            : "Mureka gagal memulai proses Remix.",
          provider: remixData,
        },
        { status: remixResponse.status },
      );
    }

    const taskId = text(remixData.id || remixData.task_id);
    if (!taskId) {
      return NextResponse.json(
        { success: false, stage: "remix", error: "Mureka tidak mengembalikan Task ID.", provider: remixData },
        { status: 502 },
      );
    }

    const status = text(remixData.status) || "preparing";
    const saved = await createMusicProjectServer(workspace, {
      title,
      lyrics,
      style: remixPrompt,
      model: "mureka-remix",
      taskId,
      status,
      audioUrl: null,
      providerData: {
        musicEngine: "mureka",
        billingProvider: "mureka",
        stage: "stage2-reference-duration-remix",
        referenceUrl,
        upload: uploadData,
        remix: remixData,
      },
    });

    if (!saved) {
      return NextResponse.json(
        {
          success: false,
          error: "Task Mureka diterima tetapi gagal disimpan ke Library.",
          taskId,
          librarySaved: false,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: "mureka-reference-duration-remix",
      musicEngine: "mureka",
      billingProvider: "mureka",
      taskId,
      task_id: taskId,
      status,
      librarySaved: true,
      provider: remixData,
    });
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka Remix error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Remix." },
      { status: 500 },
    );
  }
}
