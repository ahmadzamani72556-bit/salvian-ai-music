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

/**
 * Upload the selected Stage-1 Blob into Mureka specifically for REMIX.
 *
 * This is intentionally purpose=remix, not purpose=reference. Mureka's
 * documented remix flow is the path that accepts all three controls together:
 * uploaded audio + prompt/concept + exact replacement lyrics.
 */
async function murekaRemixUploadUrl(url: string) {
  const form = new FormData();
  form.append("url", url);
  form.append("purpose", "remix");
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    const reason = nestedMessage(field(data, "error")) || text(field(data, "message"));
    throw new Error(`Mureka upload remix gagal (${response.status}): ${reason || "respons tidak menjelaskan penyebab"}`);
  }
  const id = text(
    field(data, "id") || field(data, "file_id") || field(data, "fileId") ||
    field(data, "upload_id") || field(data, "uploadId") || field(field(data, "data"), "id") ||
    field(field(data, "data"), "file_id") || field(field(data, "data"), "upload_id") ||
    field(field(data, "file"), "id") || field(field(data, "file"), "file_id"),
  );
  if (!id) throw new Error("Mureka tidak mengembalikan ID upload remix.");
  return { id, data };
}

async function saveTask(workspace: string, title: string, lyrics: string, prompt: string, taskId: string, status: string, providerData: unknown) {
  return createMusicProjectServer(workspace, {
    title,
    lyrics,
    style: prompt,
    model: "mureka",
    taskId,
    status,
    audioUrl: null,
    providerData,
  });
}

/**
 * Preserve the user's words while making the lyric payload easier for the
 * singing model to parse. Existing section labels and line breaks are kept.
 * Only whitespace is normalized; no words are rewritten or translated.
 */
function normalizeLyricsForMureka(lyrics: string) {
  return lyrics
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(line => line.length > 0)
    .join("\n")
    .trim();
}

/**
 * Mureka has a 1024-character prompt limit. Keep the user's concept visible,
 * then add compact, high-priority controls. The reference controls musical
 * identity and vocal phrasing; the user's concept controls the requested
 * genre/production; the lyrics remain immutable source text.
 */
function buildReferencePrompt(prompt: string, language: string, gender: string, instrumental: boolean, tempo: number) {
  const concept = prompt || "Follow the user's requested music concept exactly.";
  const control = [
    "REFERENCE AUDIO = PRIMARY MUSICAL ANCHOR: follow its groove, beat pattern, rhythmic feel, melodic contour, vocal phrasing, section flow, arrangement movement, transitions, dynamics, instrumentation character and production feel. Do not replace the reference's musical/vocal flow with a generic template.",
    "GENRE/STYLE LOCK: every explicit genre, style, mood, culture, era, remix type and production term written by the user is mandatory. Reinforce those terms throughout the song. NEVER substitute another dominant genre. If the user says dangdut, dangdut remix, koplo, pesta, slow, reggae, pop, rock or another style, follow exactly what the user requested rather than adding a fixed house genre.",
    "VOCAL DICITION + CLARITY LOCK: use a clean, bright, warm, rich, close and intelligible studio vocal. Crisp consonants, natural Indonesian vowel pronunciation, controlled breath, stable pitch, clear word endings, low muddiness, low mumbling, restrained reverb and no robotic/monotone delivery. Keep every word understandable.",
    "VOCAL EXPRESSION: preserve the reference vocal melody/phrasing while adding tasteful natural dynamics, emotional intensity, beautiful cengkok/ornamentation and controlled vibrato. Put cengkok mainly on sustained vowels so it never destroys the pronunciation of the lyrics.",
    "LYRICS LOCK: sing the supplied lyrics exactly and in the same order. Do not rewrite, paraphrase, summarize, omit, invent, translate or replace words. Fit the reference melody and phrasing to the supplied lyrics; change the musical phrasing before changing a lyric word.",
    "LYRIC TIMING: respect section order and line order. Keep syllables aligned to the musical phrase. Natural melisma is allowed on vowels, but all lyric words and their consonants must remain present and intelligible.",
    language ? `LANGUAGE / DICTION: ${language}. Pronounce the supplied lyrics naturally in that language; never switch into pseudo-words or an unrelated language.` : "LANGUAGE / DICTION: Indonesian. Pronounce every supplied lyric naturally in Bahasa Indonesia; never switch into pseudo-words or an unrelated language.",
    gender ? `Preferred vocal gender: ${gender}.` : "",
    tempo > 0 ? `Target tempo: ${tempo} BPM.` : "",
    instrumental ? "INSTRUMENTAL ONLY; no vocals." : "",
    "Create an original result; use the reference for musical guidance, not for copying protected lyrics or a specific artist identity.",
  ].filter(Boolean).join("\n");

  const separator = "\n";
  const maxConcept = Math.max(0, 1024 - control.length - separator.length);
  return `${concept.slice(0, maxConcept)}${separator}${control}`.slice(0, 1024);
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) return NextResponse.json({ success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." }, { status: 503 });
  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rawLyrics = text(body.lyrics);
  const lyrics = normalizeLyricsForMureka(rawLyrics);
  const language = text(body.language) || "Indonesia";
  const gender = text(body.gender);
  const instrumental = body.instrumental === true;
  const prompt = text(body.prompt || body.style);
  const title = text(body.title) || "Salvian AI Music — Reference Generation";
  let referenceId = text(body.reference_id || body.referenceId);
  const referenceUrl = text(body.reference_url || body.referenceUrl);
  const suppliedRemixId = text(body.remix_upload_id || body.remixUploadId);
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;
  const tempoRaw = Number(body.tempo || 0);
  const tempo = Number.isFinite(tempoRaw) ? Math.max(0, Math.round(tempoRaw)) : 0;

  if (!lyrics && !instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  if (lyrics.length > 5000) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));
  if (instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mode Reference Remix saat ini membutuhkan vokal/lirik. Gunakan mode Instrumental untuk karya tanpa vokal." }, { status: 400 }));

  try {
    // The browser stores the original file in Blob first. For the actual
    // generation handoff, upload that exact file to Mureka with purpose=remix
    // so the full 10–350 second remix reference path is used.
    if (!referenceId && referenceUrl) referenceId = referenceUrl;
    let uploadId = suppliedRemixId;
    if (!uploadId && referenceId && /^https?:\/\//i.test(referenceId)) {
      const uploaded = await murekaRemixUploadUrl(referenceId);
      uploadId = uploaded.id;
    } else if (!uploadId && referenceId) {
      uploadId = referenceId;
    }
    if (!uploadId) return clearStage2Cookies(NextResponse.json({ success: false, error: "Audio Referensi belum tersedia untuk Reference Remix." }, { status: 400 }));

    const modelRaw = text(body.model) || "mureka-9";
    const model = ["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"].includes(modelRaw) ? modelRaw : "mureka-9";
    const musicPrompt = buildReferencePrompt(prompt, language, gender, false, tempo);

    // IMPORTANT: /v1/song/remix is the documented Mureka operation that
    // accepts uploaded audio + prompt + replacement lyrics together. Do not
    // silently fall back to /v1/song/generate here; that path does not provide
    // the same documented combination of reference audio and prompt control.
    const musicRequest: Record<string, unknown> = {
      upload_audio_id: uploadId,
      prompt: musicPrompt,
      lyrics: lyrics.slice(0, 5000),
      n,
    };
    const providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(musicRequest),
      cache: "no-store",
    });
    const providerData = await readJson(providerResponse);
    if (!providerResponse.ok) {
      const reason = text(field(providerData, "message")) || nestedMessage(field(providerData, "error")) || text(field(providerData, "failed_reason")) || text(field(providerData, "detail"));
      return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-remix", error: reason ? `Mureka menolak proses Reference Remix: ${reason}` : `Mureka menolak proses Reference Remix (${providerResponse.status}).`, provider: providerData }, { status: providerResponse.status }));
    }

    const taskId = text(field(providerData, "id") || field(providerData, "task_id") || field(providerData, "taskId"));
    if (!taskId) return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-remix", error: "Mureka tidak mengembalikan Task ID.", provider: providerData }, { status: 502 }));

    const status = text(field(providerData, "status")) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, musicPrompt, taskId, status, {
      musicEngine: "mureka",
      billingProvider: "mureka",
      stage: "stage2-reference-remix",
      hasReference: true,
      hasVoice: false,
      referenceGeneration: true,
      referenceUploadPurpose: "remix",
      model,
      provider: providerData,
    });
    if (!saved) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 }));

    return clearStage2Cookies(NextResponse.json({
      success: true,
      mode: "mureka-reference-remix",
      musicEngine: "mureka",
      billingProvider: "mureka",
      taskId,
      task_id: taskId,
      status,
      librarySaved: true,
      note: "Reference Remix: audio referensi tetap menjadi jangkar ketukan/alur/melodi/vocal phrasing; konsep pengguna mengunci genre/produksi; lirik dipertahankan persis dengan penguatan diksi Bahasa Indonesia, kejelasan vokal, dan cengkok pada vokal panjang tanpa menghilangkan kata.",
      provider: providerData,
    }));
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka reference remix error", error);
    return clearStage2Cookies(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Reference Remix." }, { status: 500 }));
  }
}
