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

async function murekaUploadUrl(url: string, purpose: "reference" | "remix") {
  const form = new FormData();
  form.append("url", url);
  form.append("purpose", purpose);
  const response = await fetch(`${MUREKA_BASE_URL}/v1/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MUREKA_API_KEY}`, Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    const reason = nestedMessage(field(data, "error")) || text(field(data, "message"));
    throw new Error(`Mureka upload ${purpose} gagal (${response.status}): ${reason || "respons tidak menjelaskan penyebab"}`);
  }
  const id = text(
    field(data, "id") || field(data, "file_id") || field(data, "fileId") || field(data, "upload_id") || field(data, "uploadId") ||
    field(field(data, "data"), "id") || field(field(data, "data"), "file_id") || field(field(data, "data"), "fileId") ||
    field(field(data, "data"), "upload_id") || field(field(data, "data"), "uploadId") ||
    field(field(data, "file"), "id") || field(field(data, "file"), "file_id") || field(field(data, "file"), "upload_id")
  );
  if (!id) throw new Error(`Mureka tidak mengembalikan ID untuk upload ${purpose}.`);
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

function buildReferencePrompt(prompt: string, language: string, gender: string, instrumental: boolean) {
  const parts = [
    "SALVIAN AI MUSIC — REFERENCE GENERATION. The user's supplied lyrics are the source of truth for the vocal content.",
    prompt || "Follow the musical direction supplied by the user.",
    `Language: ${language || "Indonesia"}.`,
    gender ? `Preferred vocal gender: ${gender}.` : "",
    instrumental ? "Instrumental only; do not sing vocals." : "",
    "AUDIO REFERENCE: use the uploaded reference as the primary musical guide for groove, rhythm, harmonic feel, instrumentation, arrangement, section pacing, dynamics and production character.",
    "LYRICS ADHERENCE: sing the supplied lyrics exactly as written, preserving the words, section labels and order. Do not replace, paraphrase, summarize, improvise or invent different lyrics. Fit the melody and phrasing to the supplied lyrics instead of changing the lyrics to fit the reference.",
    "MUSIC QUALITY: keep the requested genre and concept clearly recognizable throughout the song. Preserve the reference's useful musical character while creating an original arrangement and original vocal melody. Do not fall back to generic pop or a different dominant genre.",
    "Do not copy protected lyrics or claim to reproduce an artist identity.",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 1024);
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

  if (!lyrics && !instrumental) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik baru wajib diisi." }, { status: 400 }));
  if (lyrics.length > 5000) return clearStage2Cookies(NextResponse.json({ success: false, error: "Lirik maksimal 5000 karakter." }, { status: 400 }));

  try {
    // Stage-1 stores the complete reference in Blob. Only now, when the user
    // presses Buat Musik, convert that stored URL to a Mureka REFERENCE file.
    // This is intentionally NOT purpose=remix: remix makes the source song
    // the dominant transformation path and was causing weak lyric adherence.
    if (!referenceId && referenceUrl) referenceId = referenceUrl;
    if (referenceId && /^https?:\/\//i.test(referenceId)) {
      const uploaded = await murekaUploadUrl(referenceId, "reference");
      referenceId = uploaded.id;
    }

    const modelRaw = text(body.model) || "mureka-9";
    const model = ["auto", "mureka-7.6", "mureka-o2", "mureka-8", "mureka-9", "mureka-9.5"].includes(modelRaw) ? modelRaw : "mureka-9";
    if (model === "mureka-o2" && vocalId) {
      return clearStage2Cookies(NextResponse.json({ success: false, error: "Model Mureka O2 tidak mendukung Voice & Vocal. Pilih Pro atau Adroit untuk Voice & Vocal." }, { status: 400 }));
    }

    const musicPrompt = buildReferencePrompt(prompt, language, gender, instrumental);
    const musicRequest: Record<string, unknown> = {
      lyrics: lyrics.slice(0, 5000),
      model,
      n,
      prompt: musicPrompt,
      stream: body.stream === true,
    };
    if (gender === "female" || gender === "male") musicRequest.gender = gender;
    if (referenceId) musicRequest.reference_id = referenceId;
    if (vocalId) musicRequest.vocal_id = vocalId;

    const providerResponse = await fetch(`${MUREKA_BASE_URL}/v1/song/generate`, {
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
        stage: "mureka-reference-generate",
        error: reason ? `Mureka menolak proses pembuatan lagu: ${reason}` : `Mureka menolak proses pembuatan lagu (${providerResponse.status}).`,
        provider: providerData,
      }, { status: providerResponse.status }));
    }

    const taskId = text(field(providerData, "id") || field(providerData, "task_id") || field(providerData, "taskId"));
    if (!taskId) return clearStage2Cookies(NextResponse.json({ success: false, stage: "mureka-reference-generate", error: "Mureka tidak mengembalikan Task ID.", provider: providerData }, { status: 502 }));

    const status = text(field(providerData, "status")) || "preparing";
    const saved = await saveTask(workspace, title, lyrics, musicPrompt, taskId, status, {
      musicEngine: "mureka",
      billingProvider: "mureka",
      stage: referenceId || vocalId ? "stage2-reference-vocal" : "stage2-text",
      hasReference: Boolean(referenceId),
      hasVoice: Boolean(vocalId),
      referenceGeneration: true,
      referenceUploadPurpose: referenceId ? "reference" : null,
      provider: providerData,
    });
    if (!saved) return clearStage2Cookies(NextResponse.json({ success: false, error: "Mureka menerima Task ID tetapi Library gagal menyimpan task.", taskId, librarySaved: false }, { status: 503 }));

    return clearStage2Cookies(NextResponse.json({
      success: true,
      mode: referenceId && vocalId ? "mureka-reference-vocal" : referenceId ? "mureka-reference" : "mureka-generate",
      musicEngine: "mureka",
      billingProvider: "mureka",
      taskId,
      task_id: taskId,
      status,
      librarySaved: true,
      note: referenceId
        ? "Audio Referensi dikonversi ke Mureka purpose=reference saat Buat Musik; lirik dan konsep dikirim melalui song/generate, bukan song/remix."
        : "Lagu dibuat melalui song/generate dengan lirik dan konsep pengguna.",
      provider: providerData,
    }));
  } catch (error) {
    console.error("SALVIAN Stage-2 Mureka reference generation error", error);
    return clearStage2Cookies(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghubungkan Mureka Stage-2." }, { status: 500 }));
  }
}
