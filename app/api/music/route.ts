import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function cleanUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

function findAudio(value: unknown, depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (typeof value === "string") return cleanUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudio(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["audio", "audio_url", "audioUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl"]) {
    const found = cleanUrl(obj[key]);
    if (found) return found;
  }
  for (const child of Object.values(obj)) {
    const found = findAudio(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskId(item);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of ["task_id", "taskId", "job_id", "jobId", "request_id", "requestId", "id"]) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return String(obj[key]).trim();
  }
  return null;
}

function findStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const obj = value as Record<string, unknown>;
  for (const key of ["status", "state", "task_status", "taskStatus"]) {
    if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]).toLowerCase();
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  if (!API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di deployment." }, { status: 503 });
  try {
    const body = await request.json();
    const action = body?.action || "generate";

    if (action === "status") {
      const taskId = body?.taskId || body?.task_id || body?.id;
      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const response = await fetch(`${BASE_URL}/v1/song/query/${encodeURIComponent(String(taskId))}`, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ success: false, taskId, error: `Mureka Query ${response.status}`, data }, { status: response.status });
      const audio = findAudio(data);
      return NextResponse.json({ success: true, taskId: String(taskId), status: findStatus(data), audio, url: audio, data });
    }

    const lyrics = String(body?.lyrics || "").trim();
    const style = String(body?.style || "").trim();
    if (!lyrics && !body?.instrumental) return NextResponse.json({ success: false, error: "Lirik lagu belum diisi." }, { status: 400 });

    const payload: Record<string, unknown> = {
      lyrics,
      model: String(body?.model || "auto"),
      n: Math.min(Math.max(Number(body?.n) || 2, 1), 3),
      stream: false,
    };
    if (style) payload.prompt = style.slice(0, 1024);
    if (body?.instrumental) payload.instrumental = true;
    if (body?.reference_id) payload.reference_id = String(body.reference_id);
    if (body?.vocal_id) payload.vocal_id = String(body.vocal_id);
    if (body?.melody_id) payload.melody_id = String(body.melody_id);

    const response = await fetch(`${BASE_URL}/v1/song/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ success: false, error: `Mureka API ${response.status}`, data }, { status: response.status });

    const taskId = findTaskId(data);
    const audio = findAudio(data);
    return NextResponse.json({ success: true, title: String(body?.title || "Salvian AI Song"), taskId, status: findStatus(data), audio, url: audio, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungi mesin musik." }, { status: 500 });
  }
}
