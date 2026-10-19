import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Large Stage-2 audio reference upload.
 *
 * The browser uploads directly to Vercel Blob. The audio bytes therefore do
 * not pass through a Vercel Function's 4.5 MB request-body limit. Mureka is
 * called only when the user presses Buat Musik, after the lyrics and concept
 * are ready.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let workspace = "";
        try {
          const parsed = JSON.parse(clientPayload || "{}");
          workspace = typeof parsed?.workspace === "string" ? parsed.workspace.trim() : "";
        } catch {
          workspace = "";
        }
        if (!workspace) throw new Error("Workspace Music belum siap.");

        return {
          allowedContentTypes: ["audio/mpeg", "audio/mp4", "audio/x-m4a"],
          addRandomSuffix: true,
          // No application-level 10 MB cap. Vercel Blob supports much larger
          // files and the client SDK can use multipart uploads automatically.
          tokenPayload: JSON.stringify({ workspace }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("SALVIAN Stage-2 reference upload completed", blob.pathname);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("SALVIAN Stage-2 reference upload token error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload Audio Referensi gagal." },
      { status: 400 },
    );
  }
}
