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
  const qasidahSholawat = /qasidah|sholawat|shalawat|religi|islami|islamic|maulid|nasyid/i.test(concept);
  const qasidahControl = "REFERENCE = PRIMARY MUSICAL ANCHOR. Preserve its beat, groove, tempo feel, vocal melody/nada, phrasing, section flow and arrangement identity. For QASIDAH/SHOLAWAT, make the Islamic devotional character deeply felt: use a recognizable sholawat melodic color with spiritual, warm, reverent phrasing and expressive rises/falls; emphasize a memorable devotional hook and call-and-response feel where musically natural. Keep Arabic/Indonesian devotional diction clear. DANGDUT SHOLAWAT = authentic dangdut rhythm, kendang patterns, bass pulse, clean kick and tasteful fills; if the concept says slow, keep it slow and deep; if it says dangdut, make the dangdut groove clearly felt. Do not turn it into EDM or another dominant genre. VOCAL = very clear, bright, loud-but-natural, warm, full and forward; beautiful authentic dangdut cengkok, controlled melisma and vibrato on sustained notes, never hiding words. MIX = smooth, bright, clean, deep and balanced: tight round low-end, crisp percussion, open highs, separated instruments, vocal clearly in front, no mud, boom, clipping or harshness. Sing supplied lyrics EXACTLY in order; never rewrite, translate, omit, merge, swap or invent words. Indonesian/Arabic syllables and endings must remain intelligible.";
  const genericControl = "REFERENCE AUDIO = PRIMARY ANCHOR. Preserve beat, groove, tempo feel, melodic contour, vocal melody/nada, phrasing, section flow, transitions, arrangement feel and vocal character. Sing supplied lyrics exactly in line/section order; never rewrite, translate, omit, merge, swap or invent words. Keep Indonesian diction crisp and every syllable intelligible. Vocal clear, bright, warm, full and forward with natural breath, stable pitch, tasteful cengkok and controlled vibrato. Strengthen kick/bass/percussion impact and rhythmic fills without changing the requested genre. Mix smooth, punchy, clean, bright, deep and balanced; no mud, boom, clipping or harshness. Follow every explicit style term in the user's concept and do not substitute another dominant genre.";
  const control = qasidahSholawat ? qasidahControl : genericControl;
  const extras = [language ? ` Language: ${language}.` : "", gender ? ` Vocal gender: ${gender}.` : "", tempo > 0 ? ` Tempo: ${tempo} BPM.` : "", instrumental ? " Instrumental only." : ""].join("");
  const suffix = `${extras} Original result; use the reference as musical guidance.`;
  const maxConcept = Math.max(0, 1024 - control.length - suffix.length - 2);
  return `${concept.slice(0, maxConcept)}\n${control}${suffix}`.slice(0, 1024);
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
