import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

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
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return { raw }; }
}

function clearStage2Cookies(response: NextResponse) {
  response.cookies.set("salvian_stage2_pending", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/music", maxAge: 0 });
  response.cookies.set("salvian_stage2_remix_id", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/music", maxAge: 0 });
  return response;
}

async function saveTask(workspace: string, title: string, lyrics: string, prompt: string, taskId: string, status: string, providerData: unknown) {
  return createMusicProjectServer(workspace, {
    title,
    lyrics,
    style: prompt,
    model: "mureka-remix",
    taskId,
    status,
    audioUrl: null,
    providerData,
  });
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." }, { status: 503 });

  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const lyrics = text(body.lyrics);
  const prompt = text(body.prompt || body.style).slice(0, 1024);
  const title = text(body.title) || "Salvian AI Music — Reference Remix";
  const referenceId = text(body.reference_id || body.referenceId);
  const vocalId = text(body.vocal_id || body.vocalId);
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;

  if (!lyrics) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  if (lyrics.length > 5000) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));
  if (!referenceId) return clearStage2Cookies(NextResponse.json({ success: false, error: "Audio Referensi belum memiliki Reference ID Mureka. Upload Referensi lagi." }, { status: 400 }));

  const defaultPrompt = "Pertahankan karakter Audio Referensi: groove, ritme, harmoni, instrumen, aransemen, dinamika, pacing, nuansa produksi, dan struktur musik. Gunakan lirik baru secara independen dan hasilkan lagu original. Jika menggunakan Remix penuh, pertahankan alur dan durasi sumber sedekat mungkin dengan kemampuan model.";
  const remixPrompt = (prompt || defaultPrompt).slice(0, 1024);

  try {
    let providerResponse: Response;
    let providerData: Record<string, unknown>;
    let mode: string;

    if (vocalId) {
      // Mureka's Remix endpoint has no vocal_id field. When both controls are
      // supplied, use the documented generate endpoint so reference_id +
      // vocal_id remain functional. The normal reference path is 30 seconds;
      // full-duration Remix is used when no vocal clone is requested.
      mode = "mureka-reference-vocal";
      providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lyrics,
          model: text(body.model) || "mureka-9",
          n,
          prompt: remixPrompt,
          reference_id: referenceId,
          vocal_id: vocalId,
          stream: body.stream === true,
        }),
        cache: "no-store",
      });
      providerData = await readJson(providerResponse);
    } else {
      const remixUploadId = text(request.cookies.get("salvian_stage2_remix_id")?.value);
      if (!remixUploadId) {
        return clearStage2Cookies(NextResponse.json({ success: false, error: "Audio Referensi Remix tidak ditemukan. Upload Audio Referensi baru sekali lagi agar file penuh tersimpan langsung di Mureka." }, { status: 400 }));
      }
      mode = "mureka-reference-duration-remix";
      providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ upload_audio_id: remixUploadId, lyrics, prompt: remixPrompt, n }),
        cache: "no-store",
      });
      providerData = await readJson(providerResponse);
    }

    if (!providerResponse.ok) {
      const reason = text(providerData.message || providerData.error || providerData.failed_reason || providerData.detail);
      return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka", error: reason ? `Mureka menolak proses Stage-2: ${reason}` : `Mureka menolak proses Stage-2 (${providerResponse.status}).`, provider: providerData }, { status: providerResponse.status }));
    }

    const taskId = text(providerData.id || providerData.task_id || providerData.taskId);
    if (!taskId) return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka", error: "Mureka tidak mengembalikan Task ID.", provider: providerData }, { status: 502 }));

    const status = text(providerData.status) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, remixPrompt, taskId, status, {
      musicEngine: "mureka",
      billingProvider: "mureka",
      stage: mode,
      hasReference: true,
      hasVoice: Boolean(vocalId),
      fullDurationReference: mode === "mureka-reference-duration-remix",
      provider: providerData,
    });

    if (!saved) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 }));

    return clearStage2Cookies(NextResponse.json({
      success: true,
      mode,
      musicEngine: "mureka",
      billingProvider: "mureka",
      taskId,
      task_id: taskId,
      status,
      librarySaved: true,
      note: vocalId
        ? "Reference + Voice/Vocal aktif. Mureka mendukung kombinasi ini melalui song/generate; full-duration Remix tidak dipakai karena endpoint Remix tidak menyediakan vocal_id."
        : "Audio Referensi penuh dikirim ke Mureka dengan purpose=remix, sehingga tidak bergantung pada Blob dan tidak memakai batas reference 30 detik.",
      provider: providerData,
    }));
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka Remix error", error);
    return clearStage2Cookies(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Stage-2." }, { status: 500 }));
  }
}
