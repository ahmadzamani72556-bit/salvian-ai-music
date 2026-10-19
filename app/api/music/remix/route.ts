import { NextRequest, NextResponse } from "next/server";
import { createMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 300;

const MUREKA_BASE_URL = (process.env.MUREKA_BASE_URL || "https://api.mureka.ai").replace(/\/$/, "");
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || process.env.MUSIC_API_KEY;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function nestedMessage(value: unknown) {
  return text(field(value, "message"));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { raw };
  } catch {
    return { raw };
  }
}

function clearStage2Cookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
  };
  response.cookies.set("salvian_stage2_pending", "", { ...options, path: "/api/music" });
  response.cookies.set("salvian_stage2_remix_id", "", { ...options, path: "/api/music" });
  response.cookies.set("salvian_stage2_remix_id_root", "", { ...options, path: "/" });
  return response;
}

async function murekaUploadUrl(url: string) {
  const form = new FormData();
  form.append("url", url);
  form.append("purpose", "remix");

  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MUREKA_API_KEY}`,
      Accept: "application/json",
    },
    body: form,
    cache: "no-store",
  });

  const data = await readJson(response);
  if (!response.ok) {
    const reason = nestedMessage(field(data, "error")) || text(field(data, "message"));
    throw new Error(`Mureka upload remix gagal (${response.status}): ${reason || "respons tidak menjelaskan penyebab"}`);
  }

  const id = text(
    field(data, "id") || field(data, "file_id") || field(data, "fileId") || field(data, "upload_id") || field(data, "uploadId") ||
    field(field(data, "data"), "id") || field(field(data, "data"), "file_id") || field(field(data, "data"), "fileId") ||
    field(field(data, "data"), "upload_id") || field(field(data, "data"), "uploadId") ||
    field(field(data, "file"), "id") || field(field(data, "file"), "file_id") || field(field(data, "file"), "upload_id")
  );

  if (!id) throw new Error("Mureka tidak mengembalikan ID untuk upload remix.");
  return { id, data };
}

async function saveTask(
  workspace: string,
  title: string,
  lyrics: string,
  prompt: string,
  taskId: string,
  status: string,
  providerData: unknown,
) {
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

function buildStrictRemixPrompt(
  prompt: string,
  language: string,
  gender: string,
  instrumental: boolean,
  tempo: number,
) {
  const parts = [
    "SALVIAN AI STRICT REFERENCE REMIX.",
    "PRIMARY GOAL: preserve the musical identity of the uploaded reference while creating a new performance with the supplied lyrics.",
    prompt || "Follow the user's music concept exactly.",
    `Language: ${language || "Indonesia"}.`,
    tempo > 0 ? `Target tempo: ${tempo} BPM; keep it consistent with the reference feel unless the reference clearly indicates otherwise.` : "",
    gender ? `Vocal gender: ${gender}.` : "",
    instrumental ? "Instrumental only; do not sing." : "",
    "REFERENCE AUDIO IS THE MUSICAL MASTER: preserve its tempo feel, groove, rhythmic pattern, chord/harmonic movement, melodic contour where appropriate, instrumentation, arrangement, section order, transitions, fills, dynamics, energy and overall production character. Do not turn the reference into a generic genre song.",
    "CONCEPT IS THE ARRANGEMENT DIRECTION: apply the user's concept on top of the reference without discarding the reference's recognizable musical feel.",
    "LYRICS ARE LOCKED: sing the supplied lyrics exactly as provided and in the same order. Do not rewrite, paraphrase, summarize, replace, omit, repeat, or invent words. Keep every section marker and line order when possible.",
    "PHRASING: fit the new lyrics naturally into the reference's musical phrasing and section structure. Change vocal phrasing as needed to accommodate the exact words, but do not change the words themselves.",
    "OUTPUT: a polished original remix/performance that is clearly guided by the uploaded reference, the user's concept, and the exact supplied lyrics.",
  ].filter(Boolean);

  return parts.join("\n").slice(0, 1024);
}

export async function POST(request: NextRequest) {
  if (!MUREKA_API_KEY) {
    return NextResponse.json(
      { success: false, error: "MUREKA_API_KEY / MUSIC_API_KEY belum tersedia di server." },
      { status: 503 },
    );
  }

  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) {
    return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const lyrics = text(body.lyrics);
  const language = text(body.language) || "Indonesia";
  const gender = text(body.gender);
  const instrumental = body.instrumental === true;
  const prompt = text(body.prompt || body.style).slice(0, 900);
  const title = text(body.title) || "Salvian AI Music — Reference Remix";
  const referenceUrl = text(body.reference_url || body.referenceUrl);
  const legacyReferenceId = text(body.reference_id || body.referenceId);
  const suppliedRemixUploadId = text(body.remix_upload_id || body.remixUploadId);
  const tempoRaw = Number(body.tempo || 0);
  const tempo = Number.isFinite(tempoRaw) ? Math.max(0, Math.round(tempoRaw)) : 0;
  const nRaw = Number(body.n || 1);
  const n = Number.isFinite(nRaw) ? Math.min(3, Math.max(1, Math.floor(nRaw))) : 1;

  if (!lyrics && !instrumental) {
    return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  }
  if (lyrics.length > 5000) {
    return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));
  }

  try {
    // IMPORTANT: When an Audio Referensi exists, use Mureka's REMIX endpoint.
    // This is the path designed to generate from an uploaded song while
    // accepting new lyrics + a controlling prompt. The previous implementation
    // incorrectly converted the audio to purpose=reference and called
    // /v1/song/generate, which weakened adherence to the actual recording.
    let remixUploadId = suppliedRemixUploadId;

    // The current browser stores the complete audio in Blob first. At Stage-2
    // we convert that exact URL into a Mureka purpose=remix upload. This keeps
    // the full source available to Mureka and avoids the browser/Vercel upload
    // size limit.
    if (!remixUploadId && referenceUrl) {
      const uploaded = await murekaUploadUrl(referenceUrl);
      remixUploadId = uploaded.id;
    }

    if (!remixUploadId && legacyReferenceId && !/^https?:\/\//i.test(legacyReferenceId)) {
      // A legacy reference_id was created with purpose=reference and cannot be
      // safely passed to /song/remix. Do not silently fall back to the weaker
      // generation path; ask the client to provide the original audio URL.
      return clearStage2Cookies(NextResponse.json({
        success: false,
        stage: "mureka-strict-reference-remix",
        error: "Audio Referensi lama belum memiliki upload Remix Mureka. Pilih kembali file Audio Referensi agar musik sumber diproses melalui jalur Remix penuh.",
      }, { status: 409 }));
    }

    if (!remixUploadId) {
      return clearStage2Cookies(NextResponse.json({
        success: false,
        stage: "mureka-strict-reference-remix",
        error: "Audio Referensi wajib tersedia untuk mode Remix penuh.",
      }, { status: 400 }));
    }

    // The strict-reference path deliberately uses Remix rather than the
    // lyrics-to-song reference_id path. Remix accepts uploaded audio + new
    // lyrics + prompt together, which is exactly the combination this Studio
    // needs for strong adherence to the source music.
    const musicPrompt = buildStrictRemixPrompt(prompt, language, gender, instrumental, tempo);
    const musicRequest: Record<string, unknown> = {
      upload_audio_id: remixUploadId,
      lyrics: lyrics.slice(0, 5000),
      prompt: musicPrompt,
      n,
    };

    const providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/remix`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MUREKA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(musicRequest),
      cache: "no-store",
    });
    const providerData = await readJson(providerResponse);

    if (!providerResponse.ok) {
      const reason = text(field(providerData, "message")) || nestedMessage(field(providerData, "error")) || text(field(providerData, "failed_reason")) || text(field(providerData, "detail"));
      return clearStage2Cookies(NextResponse.json({
        success: false,
        stage: "mureka-strict-reference-remix",
        error: reason
          ? `Mureka menolak Remix Referensi: ${reason}`
          : `Mureka menolak Remix Referensi (${providerResponse.status}).`,
        provider: providerData,
      }, { status: providerResponse.status }));
    }

    const taskId = text(field(providerData, "id") || field(providerData, "task_id") || field(providerData, "taskId"));
    if (!taskId) {
      return clearStage2Cookies(NextResponse.json({
        success: false,
        stage: "mureka-strict-reference-remix",
        error: "Mureka tidak mengembalikan Task ID.",
        provider: providerData,
      }, { status: 502 }));
    }

    const status = text(field(providerData, "status")) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, musicPrompt, taskId, status, {
      musicEngine: "mureka",
      billingProvider: "mureka",
      stage: "stage2-strict-reference-remix",
      hasReference: true,
      hasVoice: false,
      referenceGeneration: true,
      referenceUploadPurpose: "remix",
      remixUploadId,
      provider: providerData,
    });

    if (!saved) {
      return clearStage2Cookies(NextResponse.json({
        success: false,
        error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.",
        taskId,
        librarySaved: false,
      }, { status: 503 }));
    }

    return clearStage2Cookies(NextResponse.json({
      success: true,
      mode: "mureka-strict-reference-remix",
      musicEngine: "mureka",
      billingProvider: "mureka",
      taskId,
      task_id: taskId,
      status,
      librarySaved: true,
      referenceUploadPurpose: "remix",
      note: "Audio Referensi diproses melalui Mureka Remix penuh; lirik dikunci sebagai input kata; konsep musik dikirim sebagai kontrol aransemen.",
      provider: providerData,
    }));
  } catch (error) {
    console.error("SALVIAN strict Mureka reference remix error", error);
    return clearStage2Cookies(NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Remix.",
    }, { status: 500 }));
  }
}
