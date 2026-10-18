import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer, ownsMusicTaskServer, updateMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);
function workspace(request: NextRequest) { return request.headers.get("x-music-workspace")?.trim() || ""; }
function provider(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  return fetch(`${MUREKA_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" }).then(async response => ({ response, data: await response.json().catch(() => ({})) }));
}
function taskId(data: unknown) { if (!data || typeof data !== "object") return null; const o = data as Record<string, unknown>; return o.id ? String(o.id) : o.task_id ? String(o.task_id) : null; }
function status(data: unknown) { if (!data || typeof data !== "object") return "preparing"; const o = data as Record<string, unknown>; return String(o.status || o.state || "preparing").toLowerCase(); }
function audio(data: unknown): string | null { if (!data || typeof data !== "object") return null; if (Array.isArray(data)) { for (const x of data) { const a = audio(x); if (a) return a; } return null; } const o = data as Record<string, unknown>; for (const k of ["audio_url","audioUrl","wav_url","wavUrl","song_url","songUrl","music_url","musicUrl","output_url","outputUrl","download_url","downloadUrl","url"]) if (typeof o[k] === "string" && /^(https?:\/\/|data:|blob:)/i.test(o[k] as string)) return o[k] as string; for (const k of ["audio","choices","songs","outputs","results","data"]) { const a = audio(o[k]); if (a) return a; } return null; }
function streamAudio(data: unknown): string | null { if (!data || typeof data !== "object") return null; if (Array.isArray(data)) { for (const x of data) { const a = streamAudio(x); if (a) return a; } return null; } const o = data as Record<string, unknown>; for (const k of ["stream_url","streamUrl"]) if (typeof o[k] === "string" && /^(https?:\/\/|data:|blob:)/i.test(o[k] as string)) return o[k] as string; for (const k of ["audio","choices","songs","outputs","results","data"]) { const a = streamAudio(o[k]); if (a) return a; } return null; }
function terminal(s: string) { return ["succeeded","success","completed","complete","done","failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => s === v || s.includes(v)); }
function failure(s: string) { return ["failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => s === v || s.includes(v)); }

export async function POST(request: NextRequest) {
  const userId = workspace(request);
  if (!userId) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === "status") {
      const id = String(body?.taskId || "");
      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      if (!(await ownsMusicTaskServer(userId, id))) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library workspace ini." }, { status: 404 });
      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);
      if (!q.response.ok) return NextResponse.json({ success: false, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const s = status(q.data), bad = failure(s), a = !bad ? audio(q.data) : null, streamUrl = !bad ? streamAudio(q.data) : null, finished = terminal(s), normalizedStatus = finished && a ? "succeeded" : s;
      await updateMusicProjectServer(userId, id, normalizedStatus, a, q.data).catch(error => console.error("INSTRUMENTAL LIBRARY STATUS ERROR", error));
      return NextResponse.json({ success: true, taskId: id, status: normalizedStatus, audio: a, url: a, streamUrl, finished, failed: bad, data: q.data });
    }
    const prompt = String(body?.prompt || "").trim().slice(0, 1024);
    if (!prompt) return NextResponse.json({ success: false, error: "Deskripsi musik belum diisi." }, { status: 400 });
    const requested = String(body?.model || "auto"), model = MODELS.has(requested) ? requested : "auto";
    const generated = await provider("/v1/instrumental/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, n: 1, stream: true }) });
    if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });
    const id = taskId(generated.data);
    if (!id) return NextResponse.json({ success: false, error: "Mureka tidak mengembalikan Task ID.", data: generated.data }, { status: 502 });
    const s = status(generated.data), bad = failure(s), a = terminal(s) && !bad ? audio(generated.data) : null;
    const saved = await createMusicProjectServer(userId, { title: String(body?.title || "Instrumental SALVIAN AI").slice(0, 160), lyrics: "[Instrumental]", style: prompt, model, taskId: id, status: s, audioUrl: a, providerData: generated.data });
    if (!saved) return NextResponse.json({ success: false, error: "Task berhasil dibuat tetapi Library gagal menyimpan task.", taskId: id, librarySaved: false }, { status: 503 });
    return NextResponse.json({ success: true, title: String(body?.title || "Instrumental SALVIAN AI"), taskId: id, status: s, audio: a, librarySaved: true, data: generated.data });
  } catch (error) {
    console.error("INSTRUMENTAL API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal membuat instrumental." }, { status: 500 });
  }
}
