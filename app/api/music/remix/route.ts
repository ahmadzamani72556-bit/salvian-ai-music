import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {} as Record<string, unknown>;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return { raw }; }
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." }, { status: 503 });
  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const referenceUrl = text(body.reference_url || body.referenceUrl);
  const lyrics = text(body.lyrics);
  const prompt = text(body.prompt || body.style);
  const title = text(body.title) || "Salvian AI Music — Reference Remix";
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;

  if (!/^https:\/\//i.test(referenceUrl)) return NextResponse.json({ success: false, error: "Audio Referensi belum tersedia atau URL tidak valid." }, { status: 400 });
  if (!lyrics) return NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 });
  if (lyrics.length > 5000) return NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 });

  const remixPrompt = (prompt || "Pertahankan karakter musik dari Audio Referensi: groove, ritme, harmoni, instrumen, aransemen, dinamika, pacing, nuansa produksi, dan struktur/durasi sumber sedekat mungkin dengan kemampuan Remix. Gunakan lirik baru secara independen dan buat hasil musik original.").slice(0, 1024);

  try {
    const uploadForm = new FormData();
    uploadForm.append("purpose", "remix");
    uploadForm.append("url", referenceUrl);

    const uploadResponse = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
      body: uploadForm,
      cache: "no-store",
    });
    const uploadData = await readJson(uploadResponse);
    if (!uploadResponse.ok) return NextResponse.json({ success: false, stage: "upload", error: "Mureka menolak Audio Referensi Remix.", provider: uploadData }, { status: uploadResponse.status });

    const uploadId = text(uploadData.id || uploadData.upload_id);
    if (!uploadId) return NextResponse.json({ success: false, stage: "upload", error: "Mureka tidak mengembalikan upload_id.", provider: uploadData }, { status: 502 });

    const remixResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ upload_audio_id: uploadId, lyrics, prompt: remixPrompt, n }),
      cache: "no-store",
    });
    const remixData = await readJson(remixResponse);
    if (!remixResponse.ok) return NextResponse.json({ success: false, stage: "remix", error: "Mureka gagal memulai proses Remix.", provider: remixData }, { status: remixResponse.status });

    const taskId = text(remixData.id || remixData.task_id);
    if (!taskId) return NextResponse.json({ success: false, stage: "remix", error: "Mureka tidak mengembalikan Task ID.", provider: remixData }, { status: 502 });

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
    if (!saved) return NextResponse.json({ success: false, error: "Task Mureka diterima tetapi gagal disimpan ke Library.", taskId, librarySaved: false }, { status: 503 });

    return NextResponse.json({ success: true, mode: "mureka-reference-duration-remix", musicEngine: "mureka", billingProvider: "mureka", taskId, task_id: taskId, status, librarySaved: true, provider: remixData });
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka Remix error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Remix." }, { status: 500 });
  }
}
