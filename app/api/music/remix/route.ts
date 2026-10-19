import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function field(value: unknown, key: string): unknown { if (!value || typeof value !== "object") return undefined; return (value as Record<string, unknown>)[key]; }
function nestedMessage(value: unknown) { return text(field(value, "message")); }
async function readJson(response: Response): Promise<Record<string, unknown>> { const raw = await response.text().catch(() => ""); if (!raw) return {}; try { const parsed: unknown = JSON.parse(raw); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { raw }; } catch { return { raw }; } }
function clearStage2Cookies(response: NextResponse) { const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 0 }; response.cookies.set("salvian_stage2_pending", "", { ...options, path: "/api/music" }); response.cookies.set("salvian_stage2_remix_id", "", { ...options, path: "/api/music" }); response.cookies.set("salvian_stage2_remix_id_root", "", { ...options, path: "/" }); return response; }

async function murekaRemixUploadUrl(url: string) {
  const form = new FormData(); form.append("url", url); form.append("purpose", "remix");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) { const reason = nestedMessage(field(data, "error")) || text(field(data, "message")); throw new Error(`Mureka upload remix gagal (${response.status}): ${reason || "respons tidak menjelaskan penyebab"}`); }
  const id = text(field(data, "id") || field(data, "file_id") || field(data, "fileId") || field(data, "upload_id") || field(data, "uploadId") || field(field(data, "data"), "id") || field(field(data, "data"), "file_id") || field(field(data, "data"), "upload_id") || field(field(data, "file"), "id") || field(field(data, "file"), "file_id"));
  if (!id) throw new Error("Mureka tidak mengembalikan ID upload remix.");
  return { id, data };
}
async function saveTask(workspace: string, title: string, lyrics: string, prompt: string, taskId: string, status: string, providerData: unknown) { return createMusicProjectServer(workspace, { title, lyrics, style: prompt, model: "mureka", taskId, status, audioUrl: null, providerData }); }
function normalizeLyricsForMureka(lyrics: string) { return lyrics.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/[ \t]+/g, " ").trim()).filter(line => line.length > 0).join("\n").trim(); }

function buildReferencePrompt(prompt: string, language: string, gender: string, instrumental: boolean, tempo: number) {
  const concept = prompt || "Follow the user's requested music concept exactly.";
  const control = [
    "REFERENCE AUDIO LOCK = ABSOLUTE PRIMARY ANCHOR. Keep its beat placement, groove, pocket, tempo feel, melodic contour, vocal melody/nada, phrasing/cadence, section order, transitions, arrangement flow, instrumentation feel and vocal character. Do not replace, flatten or reinterpret the reference flow with a generic template.",
    "LYRIC DICTION LOCK = EVERY WORD MUST BE CLEAR. Sing the supplied lyrics exactly, in exact line/section order. Never rewrite, paraphrase, translate, invent, skip, merge, swap or randomly repeat words. Preserve syllables and word endings. Never mumble or turn Indonesian words into unclear/foreign phonemes.",
    "INDONESIAN SINGING = NATURAL, CRISP, INTELLIGIBLE. Make each consonant and vowel distinct, with clean syllable separation and audible final consonants. Fit words to the reference musical phrases without rushing. Use short controlled breaths between phrases; never swallow words.",
    "VOCAL = REALISTIC, SMOOTH, CLEAR, BRIGHT, WARM, FULL AND FORWARD. Natural breath, stable pitch, expressive dynamics and clean studio presence. Keep the vocal balanced over the beat: present and intelligible, never buried, harsh, nasal, muddy, distant or robotic.",
    "CENGKOK LOCK = BEAUTIFUL AND PRECISE. Follow the reference vocal melody and phrasing; add tasteful authentic cengkok, melisma and controlled vibrato mainly on sustained vowels and phrase endings. Keep cengkok fluid and expressive like a polished real singer, but NEVER let ornamentation cover or distort lyric consonants.",
    "JEDAG-JEDUG = STRONGER BUT MUSICAL. Increase kick impact, bass pulse, snare/clap and percussion accents, rhythmic fills, drops and transitions. Make the groove hit clearly and feel energetic while preserving the reference's original rhythmic identity and requested genre/style.",
    "MIX = SMOOTH + CLEAN + BRIGHT + DEEP + BALANCED. Tight round low-end, punchy controlled kick/bass, clean open mids, crisp non-harsh highs, separated instruments, centered vocal, controlled dynamics and moderate reverb. No mud, boom, boxiness, clipping, brittle highs or washed-out vocal. Music and vocal must sit together naturally.",
    "STYLE LOCK = every explicit genre, remix type, mood and production term in the user's concept is mandatory. Reinforce the requested style without substituting another dominant genre. Dangdut stays dangdut; dangdut remix/pesta stays dangdut remix/pesta; slow stays slow; other requested styles remain themselves.",
    language ? `Language: ${language}; keep diction consistent.` : "Language: Indonesian; keep diction consistently Bahasa Indonesia.",
    gender ? `Preferred vocal gender: ${gender}.` : "",
    tempo > 0 ? `Target tempo: ${tempo} BPM.` : "",
    instrumental ? "INSTRUMENTAL ONLY; no vocals." : "",
    "Create an original result using the reference as musical guidance, without copying protected lyrics or a specific artist identity."
  ].filter(Boolean).join("\n");
  const separator = "\n"; const maxConcept = Math.max(0, 1024 - control.length - separator.length); return `${concept.slice(0, maxConcept)}${separator}${control}`.slice(0, 1024);
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." }, { status: 503 });
  const workspace = request.headers.get("x-music-workspace")?.trim(); if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rawLyrics = text(body.lyrics); const lyrics = normalizeLyricsForMureka(rawLyrics); const language = text(body.language) || "Indonesia"; const gender = text(body.gender); const instrumental = body.instrumental === true; const prompt = text(body.prompt || body.style); const title = text(body.title) || "Salvian AI Music — Reference Generation"; let referenceId = text(body.reference_id || body.referenceId); const referenceUrl = text(body.reference_url || body.referenceUrl); const suppliedRemixId = text(body.remix_upload_id || body.remixUploadId); const nRaw = Number(body.n || 1); const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1; const tempoRaw = Number(body.tempo || 0); const tempo = Number.isFinite(tempoRaw) ? Math.max(0, Math.round(tempoRaw)) : 0;
  if (!lyrics && !instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  if (lyrics.length > 5000) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));
  if (instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mode Reference Remix saat ini membutuhkan vokal/lirik. Gunakan mode Instrumental untuk karya tanpa vokal." }, { status: 400 }));
  try {
    if (!referenceId && referenceUrl) referenceId = referenceUrl; let uploadId = suppliedRemixId;
    if (!uploadId && referenceId && /^https?:\/\//i.test(referenceId)) { const uploaded = await murekaRemixUploadUrl(referenceId); uploadId = uploaded.id; } else if (!uploadId && referenceId) uploadId = referenceId;
    if (!uploadId) return clearStage2Cookies(NextResponse.json({ success: false, error: "Audio Referensi belum tersedia untuk Reference Remix." }, { status: 400 }));
    const modelRaw = text(body.model) || "mureka-9"; const model = ["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"].includes(modelRaw) ? modelRaw : "mureka-9"; const musicPrompt = buildReferencePrompt(prompt, language, gender, false, tempo);
    const musicRequest: Record<string, unknown> = { upload_audio_id: uploadId, prompt: musicPrompt, lyrics: lyrics.slice(0, 5000), n };
    const providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(musicRequest), cache: "no-store" });
    const providerData = await readJson(providerResponse);
    if (!providerResponse.ok) { const reason = text(field(providerData, "message")) || nestedMessage(field(providerData, "error")) || text(field(providerData, "failed_reason")) || text(field(providerData, "detail")); return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-remix", error: reason ? `Mureka menolak proses Reference Remix: ${reason}` : `Mureka menolak proses Reference Remix (${providerResponse.status}).`, provider: providerData }, { status: providerResponse.status })); }
    const taskId = text(field(providerData, "id") || field(providerData, "task_id") || field(providerData, "taskId")); if (!taskId) return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-remix", error: "Mureka tidak mengembalikan Task ID.", provider: providerData }, { status: 502 }));
    const status = text(field(providerData, "status")) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, musicPrompt, taskId, status, { musicEngine: "mureka", billingProvider: "mureka", stage: "stage2-reference-remix", hasReference: true, hasVoice: false, referenceGeneration: true, referenceUploadPurpose: "remix", model, provider: providerData });
    if (!saved) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 }));
    return clearStage2Cookies(NextResponse.json({ success: true, mode: "mureka-reference-remix", musicEngine: "mureka", billingProvider: "mureka", taskId, task_id: taskId, status, librarySaved: true, note: "Reference Remix: audio referensi terkunci sebagai jangkar; lirik dikunci kata-per-kata; vokal diperjelas dengan cengkok presisi; jedag-jedug diperkuat; mix dibuat lebih halus, terang, jernih dan seimbang.", provider: providerData }));
  } catch (error) { console.error("SALVIAN Stage-2 Mureka reference remix error", error); return clearStage2Cookies(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Reference Remix." }, { status: 500 })); }
}
