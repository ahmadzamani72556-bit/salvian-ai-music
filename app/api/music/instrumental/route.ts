import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = process.env.MUREKA_BASE_URL || "https://api.mureka.ai";
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;
const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const MUSIC_CREDIT_COST = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));
const MODELS = new Set(["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"]);

function subject(auth: string) { try { const token = auth.replace(/^Bearer\s+/i, "").split(".")[1]; if (!token) return null; const normalized = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "="); const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")); return typeof payload?.sub === "string" ? payload.sub : null; } catch { return null; } }
async function rpc(auth: string, fn: string, body: Record<string, unknown> = {}) { const r = await fetch(`${DATA_API}/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" }); return { response: r, data: await r.json().catch(() => null) }; }
async function provider(path: string, init: RequestInit = {}) { if (!MUREKA_API_KEY) throw new Error("MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC."); const r = await fetch(`${MUREKA_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" }); return { response: r, data: await r.json().catch(() => ({})) }; }
function taskId(data: unknown) { const o = data as Record<string, unknown>; return o?.id ? String(o.id) : (o?.task_id ? String(o.task_id) : null); }
function status(data: unknown) { const o = data as Record<string, unknown>; return String(o?.status || o?.state || "preparing").toLowerCase(); }
function audio(data: unknown): string | null { if (!data || typeof data !== "object") return null; if (Array.isArray(data)) { for (const x of data) { const a = audio(x); if (a) return a; } return null; } const o = data as Record<string, unknown>; for (const k of ["audio_url","audioUrl","wav_url","wavUrl","song_url","songUrl","music_url","musicUrl","output_url","outputUrl","download_url","downloadUrl","stream_url","streamUrl"]) if (typeof o[k] === "string" && /^(https?:\/\/|data:|blob:)/i.test(o[k] as string)) return o[k] as string; for (const k of ["choices","songs","outputs","results","data"]) { const a = audio(o[k]); if (a) return a; } return null; }
function terminal(s: string) { return ["succeeded","success","completed","complete","done","failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => s === v || s.includes(v)); }
function failure(s: string) { return ["failed","failure","timeouted","timeout","timedout","timed_out","cancelled","canceled","error"].some(v => s === v || s.includes(v)); }

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth || !/^Bearer\s+/i.test(auth)) return NextResponse.json({ success: false, error: "Silakan login melalui Akun SALVIAN AI terlebih dahulu." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === "status") {
      const id = String(body?.taskId || ""); if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });
      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`); if (!q.response.ok) return NextResponse.json({ success: false, error: q.data?.error?.message || q.data?.message || `Mureka Query ${q.response.status}`, data: q.data }, { status: q.response.status });
      const s = status(q.data); const done = terminal(s); const bad = failure(s); const a = done && !bad ? audio(q.data) : null;
      await fetch(`${DATA_API}/salvian_music_projects?task_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status: s, audio_url: a, updated_at: new Date().toISOString(), provider_data: q.data }), cache: "no-store" });
      const result = NextResponse.json({ success: true, taskId: id, status: s, audio: a, url: a, finished: done, failed: bad, createdAt: Number(q.data?.created_at || 0), finishedAt: Number(q.data?.finished_at || 0), failedReason: q.data?.failed_reason || null, data: q.data });
      if (done) { result.cookies.set("salvian_generation_task", "", { path: "/", maxAge: 0 }); result.cookies.set("salvian_generation_endpoint", "", { path: "/", maxAge: 0 }); }
      return result;
    }

    const prompt = String(body?.prompt || "").trim().slice(0, 1024);
    if (!prompt) return NextResponse.json({ success: false, error: "Deskripsi musik belum diisi." }, { status: 400 });
    const credit = await rpc(auth, "salvian_consume_credits", { p_amount: MUSIC_CREDIT_COST, p_type: "USAGE", p_description: "Pembuatan instrumental SALVIAN AI MUSIC" });
    const creditRow = Array.isArray(credit.data) ? credit.data[0] : credit.data;
    if (!credit.response.ok || creditRow?.success !== true) return NextResponse.json({ success: false, error: creditRow?.message || "Kredit tidak cukup.", credits: Number(creditRow?.balance || 0) }, { status: credit.response.status === 402 ? 402 : 503 });

    let providerSucceeded = false;
    try {
      const requested = String(body?.model || "auto");
      const model = MODELS.has(requested) ? requested : "auto";
      const generated = await provider("/v1/instrumental/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, n: 1, stream: false }) });
      if (!generated.response.ok) return NextResponse.json({ success: false, error: generated.data?.error?.message || generated.data?.message || `Mureka API ${generated.response.status}`, data: generated.data }, { status: generated.response.status });
      const id = taskId(generated.data); if (!id) return NextResponse.json({ success: false, error: "Mureka tidak mengembalikan Task ID. Kredit akan dikembalikan.", data: generated.data }, { status: 502 });
      providerSucceeded = true;
      const s = status(generated.data); const uid = subject(auth);
      let saved = false;
      if (uid) {
        const insert = await fetch(`${DATA_API}/salvian_music_projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth, Accept: "application/json", Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, title: String(body?.title || "Instrumental SALVIAN AI").slice(0, 160), lyrics: "[Instrumental]", style: prompt, model, task_id: id, status: s, audio_url: null, provider_data: generated.data, updated_at: new Date().toISOString() }), cache: "no-store" }); saved = insert.ok;
      }
      const result = NextResponse.json({ success: true, title: String(body?.title || "Instrumental SALVIAN AI"), taskId: id, status: s, audio: null, credits: Number(creditRow?.balance || 0), librarySaved: saved, data: generated.data });
      if (!terminal(s)) { result.cookies.set("salvian_generation_task", id, { path: "/", maxAge: 3600, sameSite: "lax" }); result.cookies.set("salvian_generation_endpoint", "/api/music/instrumental", { path: "/", maxAge: 3600, sameSite: "lax" }); }
      return result;
    } finally {
      if (!providerSucceeded) { try { await rpc(auth, "salvian_refund_credits", { p_amount: MUSIC_CREDIT_COST, p_description: "Refund instrumental SALVIAN AI MUSIC" }); } catch (e) { console.error("INSTRUMENTAL REFUND", e); } }
    }
  } catch (error) { console.error("INSTRUMENTAL API ERROR", error); return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal membuat instrumental." }, { status: 500 }); }
}
