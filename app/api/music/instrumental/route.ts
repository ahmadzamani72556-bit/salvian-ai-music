import { NextRequest, NextResponse } from "next/server";
import { refundMusicCreditsServer, updateMusicProjectServer } from "../../../../lib/server-credit-refund";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const MUSIC_CREDIT_COST = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));
const MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);

function subject(auth: string) {
  try {
    const token = auth.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!token) return null;
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    return typeof payload?.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

async function rpc(auth: string, fn: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`${DATA_API}/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return { response: r, data: await r.json().catch(() => null) };
}

async function provider(path: string, init: RequestInit = {}) {
  if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC.");
  const r = await fetch(`${MUREKA_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  return { response: r, data: await r.json().catch(() => ({})) };
}

function taskId(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return o?.id ? String(o.id) : (o?.task_id ? String(o.task_id) : null);
}

function status(data: unknown) {
  if (!data || typeof data !== "object") return "preparing";
  const o = data as Record<string, unknown>;
  return String(o?.status || o?.state || "preparing").toLowerCase();
}

function audio(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const x of data) {
      const a = audio(x);
      if (a) return a;
    }
    return null;
  }
  const o = data as Record<string, unknown>;
  for (const k of ["audio_url", "audioUrl", "wav_url", "wavUrl", "song_url", "songUrl", "music_url", "musicUrl", "output_url", "outputUrl", "download_url", "downloadUrl", "stream_url", "streamUrl"]) {
    if (typeof o[k] === "string" && /^(https?:\/\/|data:|blob:)/i.test(o[k] as string)) return o[k] as string;
  }
  for (const k of ["choices", "songs", "outputs", "results", "data"]) {
    const a = audio(o[k]);
    if (a) return a;
  }
  return null;
}

function terminal(s: string) {
  return ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => s === v || s.includes(v));
}

function failure(s: string) {
  return ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => s === v || s.includes(v));
}

async function saveLibrary(auth: string, body: Record<string, unknown>) {
  const uid = subject(auth);
  if (uid) {
    const insert = await fetch(`${DATA_API}/salvian_music_projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: uid,
        title: body.title,
        lyrics: body.lyrics,
        style: body.style || "",
        model: body.model || "auto",
        task_id: body.taskId,
        status: body.status || "preparing",
        audio_url: body.audioUrl || null,
        provider_data: body.providerData || null,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    const data = await insert.json().catch(() => null);
    if (insert.ok) return { ok: true, data };
    console.error("INSTRUMENTAL LIBRARY DIRECT INSERT", insert.status, data);
  }

  const fallback = await rpc(auth, "salvian_create_music_project", {
    p_title: body.title,
    p_lyrics: body.lyrics,
    p_style: body.style || "",
    p_model: body.model || "auto",
    p_task_id: body.taskId,
    p_status: body.status || "preparing",
    p_audio_url: body.audioUrl || null,
    p_provider_data: body.providerData || null,
  });
  if (!fallback.response.ok) console.error("INSTRUMENTAL LIBRARY RPC INSERT", fallback.response.status, fallback.data);
  return { ok: fallback.response.ok, data: fallback.data };
}

async function patchLibrary(auth: string, taskIdValue: string, statusValue: string, audioUrl: string | null, providerData: unknown) {
  const userId = subject(auth);
  if (!userId) throw new Error("Sesi pengguna tidak valid untuk update Library instrumental.");
  return updateMusicProjectServer(userId, taskIdValue, statusValue, audioUrl, providerData);
}

async function refund(auth: string) {
  const userId = subject(auth);
  if (!userId) throw new Error("Sesi pengguna tidak valid untuk refund instrumental.");
  return refundMusicCreditsServer(userId, MUSIC_CREDIT_COST, "Refund instrumental SALVIAN AI MUSIC");
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth || !/^Bearer\s+/i.test(auth)) return NextResponse.json({ success: false, error: "Silakan login melalui Akun SALVIAN AI terlebih dahulu." }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  try {
    if (body?.action === "status") {
      const id = String(body?.taskId || "");
      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);
      if (!q.response.ok) return NextResponse.json({ success: false, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const s = status(q.data);
      const done = terminal(s);
      const bad = failure(s);
      const a = done && !bad ? audio(q.data) : null;
      try {
        const patched = await patchLibrary(auth, id, s, a, q.data);
        if (!patched) console.error("INSTRUMENTAL LIBRARY STATUS ERROR: project not found");
      } catch (e) {
        console.error("INSTRUMENTAL LIBRARY STATUS ERROR", e);
      }
      const result = NextResponse.json({ success: true, taskId: id, status: s, audio: a, url: a, finished: done, failed: bad, createdAt: Number(q.data?.created_at || 0), finishedAt: Number(q.data?.finished_at || 0), failedReason: q.data?.failed_reason || null, data: q.data });
      if (done) {
        result.cookies.set("salvian_generation_task", "", { path: "/", maxAge: 0 });
        result.cookies.set("salvian_generation_endpoint", "", { path: "/", maxAge: 0 });
      }
      return result;
    }

    const prompt = String(body?.prompt || "").trim().slice(0, 1024);
    if (!prompt) return NextResponse.json({ success: false, error: "Deskripsi musik belum diisi." }, { status: 400 });

    const credit = await rpc(auth, "salvian_consume_credits", { p_amount: MUSIC_CREDIT_COST, p_type: "USAGE", p_description: "Pembuatan instrumental SALVIAN AI MUSIC" });
    const creditRow = Array.isArray(credit.data) ? credit.data[0] : credit.data;
    if (!credit.response.ok || creditRow?.success !== true) return NextResponse.json({ success: false, error: creditRow?.message || "Kredit tidak cukup.", credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST }, { status: credit.response.status === 402 ? 402 : 503 });

    let providerAccepted = false;
    let shouldRefundTerminalFailure = false;
    let terminalTaskId = "";
    let terminalStatus = "";
    let terminalAudio: string | null = null;
    let terminalProviderData: unknown = null;

    try {
      const requested = String(body?.model || "auto");
      const model = MODELS.has(requested) ? requested : "auto";
      const generated = await provider("/v1/instrumental/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, n: 1, stream: false }),
      });
      if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });

      const id = taskId(generated.data);
      if (!id) return NextResponse.json({ success: false, error: "Mureka tidak mengembalikan Task ID. Kredit akan dikembalikan.", data: generated.data }, { status: 502 });
      providerAccepted = true;

      const s = status(generated.data);
      const bad = failure(s);
      const a = terminal(s) && !bad ? audio(generated.data) : null;
      shouldRefundTerminalFailure = terminal(s) && bad;
      terminalTaskId = id;
      terminalStatus = s;
      terminalAudio = a;
      terminalProviderData = generated.data;
      const saved = await saveLibrary(auth, {
        title: String(body?.title || "Instrumental SALVIAN AI").slice(0, 160),
        lyrics: "[Instrumental]",
        style: prompt,
        model,
        taskId: id,
        status: s,
        audioUrl: a,
        providerData: generated.data,
      });

      const result = NextResponse.json({ success: true, title: String(body?.title || "Instrumental SALVIAN AI"), taskId: id, status: s, audio: a, credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST, librarySaved: saved.ok, data: generated.data });
      if (!terminal(s)) {
        result.cookies.set("salvian_generation_task", id, { path: "/", maxAge: 3600, sameSite: "lax" });
        result.cookies.set("salvian_generation_endpoint", "/api/music/instrumental", { path: "/", maxAge: 3600, sameSite: "lax" });
      }
      return result;
    } finally {
      if (!providerAccepted) {
        try { await refund(auth); } catch (e) { console.error("INSTRUMENTAL REFUND", e); }
      } else if (shouldRefundTerminalFailure && terminalTaskId) {
        try {
          const patched = await patchLibrary(auth, terminalTaskId, terminalStatus, terminalAudio, terminalProviderData);
          if (!patched) console.error("INSTRUMENTAL TERMINAL REFUND DEFERRED: project not found");
        } catch (e) {
          console.error("INSTRUMENTAL TERMINAL REFUND DEFERRED", e);
        }
      }
    }
  } catch (error) {
    console.error("INSTRUMENTAL API ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal membuat instrumental." }, { status: 500 });
  }
}
