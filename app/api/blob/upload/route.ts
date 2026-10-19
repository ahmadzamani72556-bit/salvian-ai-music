import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname }),
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("SALVIAN Blob audio upload error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Blob upload gagal." }, { status: 500 });
  }
}
