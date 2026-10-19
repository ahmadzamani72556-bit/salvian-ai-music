import { NextRequest, NextResponse } from "next/server";
import { getMusicProjectServer } from "../../../../lib/server-music-projects";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId")?.trim() || "";
    const workspace = url.searchParams.get("workspace")?.trim() || "";
    if (!taskId || !workspace) return NextResponse.json({ success: false, error: "Audio tidak lengkap." }, { status: 400 });

    const project = await getMusicProjectServer(workspace, taskId);
    if (!project) return NextResponse.json({ success: false, error: "Hasil lagu tidak ditemukan." }, { status: 404 });

    const provider = project.provider_data as Record<string, unknown> | null;
    const audioBase64 = typeof provider?.audioBase64 === "string" ? provider.audioBase64 : "";
    const contentType = typeof provider?.contentType === "string" ? provider.contentType : "audio/mpeg";
    if (!audioBase64) return NextResponse.json({ success: false, error: "Audio tersimpan sebagai URL eksternal atau belum tersedia." }, { status: 404 });

    const bytes = Buffer.from(audioBase64, "base64");
    const chunkSize = 1024 * 1024;
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkSize, bytes.length);
        controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
        offset = end;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("MUSIC AUDIO ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Audio gagal dibaca." }, { status: 500 });
  }
}
