import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}
function nestedMessage(value: unknown) { return text(field(value, "message")); }
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { raw };
  } catch { return { raw }; }
}
function clearStage2Cookies(response: NextResponse) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 0 };
  response.cookies.set("salvian_stage2_pending", "", { ...options, path: "/api/music" });
  response.cookies.set("salvian_stage2_remix_id", "", { ...options, path: "/api/music" });
  response.cookies.set("salvian_stage2_remix_id_root", "", { ...options, path: "/" });
  return response;
}
async function murekaUploadUrl(url: string) {
  const form = new FormData();
  form.append("url", url);
  form.append("purpose", "reference");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" }, body: form, cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) {
    const reason = nestedMessage(field(data, "error")) || text(field(data, "message"));
    throw new Error(`Mureka upload reference gagal (${response.status}): ${reason || "respons tidak menjelaskan penyebab"}`);
  }
  const id = text(field(data, "id") || field(data, "file_id") || field(data, "fileId") || field(data, "upload_id") || field(data, "uploadId") || field(field(data, "data"), "id") || field(field(data, "data"), "file_id") || field(field(data, "data"), "fileId") || field(field(data, "data"), "upload_id") || field(field(data, "data"), "uploadId") || field(field(data, "file"), "id") || field(field(data, "file"), "file_id") || field(field(data, "file"), "upload_id"));
  if (!id) throw new Error("Mureka tidak mengembalikan ID untuk upload reference.");
  return { id, data };
}
async function saveTask(workspace: string, title: string, lyrics: string, prompt: string, taskId: string, status: string, providerData: unknown) {
  return createMusicProjectServer(workspace, { title, lyrics, style: prompt, model: "mureka", taskId, status, audioUrl: null, providerData });
}
function buildReferencePrompt(prompt: string, language: string, gender: string, instrumental: boolean, tempo: number) {
  const concept = [prompt ? `USER MUSIC CONCEPT: ${prompt}` : "USER MUSIC CONCEPT: Follow the musical direction supplied by the user.", language ? `Language: ${language}.` : "", gender ? `Preferred vocal gender: ${gender}.` : "", tempo > 0 ? `Requested tempo: ${tempo} BPM.` : ""].filter(Boolean).join("\n");
  const control = [
    "REFERENCE AUDIO IS THE MUSICAL ANCHOR: follow the uploaded reference for musical feel, groove, rhythm, harmonic movement, instrumental character, arrangement, section flow, transitions, dynamics, pacing, vocal melody/contour and vocal phrasing as closely as the model can while creating an original result.",
    "USER CONCEPT HAS CREATIVE CONTROL: apply the user's requested genre, style, instruments, arrangement, tempo, vocal character and production direction. Do not impose or substitute a preset genre such as remix, dangdut, pop or rock unless the user asks for it. Do not classify the reference and replace it with a generic genre template.",
    "LYRICS ARE LOCKED: the lyrics field sent with this request is the exact text to sing. Sing those words in the same order. Do not rewrite, paraphrase, summarize, replace, omit, add or invent lyrics. Adapt melody, phrasing and timing to the supplied lyrics instead of changing the lyrics to fit the reference.",
    instrumental ? "INSTRUMENTAL: do not sing vocals." : "",
    "Keep the reference's musical identity and vocal contour as the foundation, while making the user's concept and exact lyrics clearly audible in the final result.",
  ].filter(Boolean).join("\n");
  const maxConcept = Math.max(0, 1024 - control.length - 1);
  return `${concept.slice(0, maxConcept)}\n${control}`.slice(0, 1024);
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." }, { status: 503 });
  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const lyrics = text(body.lyrics);
  const language = text(body.language) || "Indonesia";
  const gender = text(body.gender);
  const instrumental = body.instrumental === true;
  const prompt = text(body.prompt || body.style).slice(0, 900);
  const title = text(body.title) || "Salvian AI Music — Reference Generation";
  let referenceId = text(body.reference_id || body.referenceId);
  const referenceUrl = text(body.reference_url || body.referenceUrl);
  const vocalId = text(body.vocal_id || body.vocalId);
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;
  const tempoRaw = Number(body.tempo || 0);
  const tempo = Number.isFinite(tempoRaw) ? Math.max(0, Math.round(tempoRaw)) : 0;
  if (!lyrics && !instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  if (lyrics.length > 5000) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));
  try {
    // Restore the first working Stage-2 path: Blob URL -> Mureka purpose=reference -> song/generate.
    // Do not use song/remix here; it made the reference dominate the lyrics.
    if (!referenceId && referenceUrl) referenceId = referenceUrl;
    if (referenceId && /^https?:\/\//i.test(referenceId)) {
      const uploaded = await murekaUploadUrl(referenceId);
      referenceId = uploaded.id;
    }
    const modelRaw = text(body.model) || "mureka-9";
    const model = ["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"].includes(modelRaw) ? modelRaw : "mureka-9";
    if (model === "mureka-o2" && vocalId) return clearStage2Cookies(NextResponse.json({ success: false, error: "Model Mureka O2 tidak mendukung Voice & Vocal. Pilih Pro atau Adroit untuk Voice & Vocal." }, { status: 400 }));
    const musicPrompt = buildReferencePrompt(prompt, language, gender, instrumental, tempo);
    const musicRequest: Record<string, unknown> = { lyrics: lyrics.slice(0, 5000), model, n, prompt: musicPrompt, stream: body.stream === true };
    if (gender === "female" || gender === "male") musicRequest.gender = gender;
    if (referenceId) musicRequest.reference_id = referenceId;
    if (vocalId) musicRequest.vocal_id = vocalId;
    const providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/generate`, { method: "POST", headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(musicRequest), cache: "no-store" });
    const providerData = await readJson(providerResponse);
    if (!providerResponse.ok) {
      const reason = text(field(providerData, "message")) || nestedMessage(field(providerData, "error")) || text(field(providerData, "failed_reason")) || text(field(providerData, "detail"));
      return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-generate", error: reason ? `Mureka menolak proses pembuatan lagu: ${reason}` : `Mureka menolak proses pembuatan lagu (${providerResponse.status}).`, provider: providerData }, { status: providerResponse.status }));
    }
    const taskId = text(field(providerData, "id") || field(providerData, "task_id") || field(providerData, "taskId"));
    if (!taskId) return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-generate", error: "Mureka tidak mengembalikan Task ID.", provider: providerData }, { status: 502 }));
    const status = text(field(providerData, "status")) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, musicPrompt, taskId, status, { musicEngine: "mureka", billingProvider: "mureka", stage: referenceId && vocalId ? "stage2-reference-vocal" : referenceId ? "stage2-reference" : "stage2-text", hasReference: Boolean(referenceId), hasVoice: Boolean(vocalId), referenceGeneration: true, referenceUploadPurpose: referenceId ? "reference" : null, provider: providerData });
    if (!saved) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 }));
    return clearStage2Cookies(NextResponse.json({ success: true, mode: referenceId && vocalId ? "mureka-reference-vocal" : referenceId ? "mureka-reference" : "mureka-generate", musicEngine: "mureka", billingProvider: "mureka", taskId, task_id: taskId, status, librarySaved: true, note: referenceId ? "Reference Generation: audio referensi menjadi jangkar musik/vokal; konsep pengguna tetap aktif; lirik dikirim persis melalui song/generate." : "Lagu dibuat melalui song/generate dengan lirik dan konsep pengguna.", provider: providerData }));
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka reference generation error", error);
    return clearStage2Cookies(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Stage-2." }, { status: 500 }));
  }
}
