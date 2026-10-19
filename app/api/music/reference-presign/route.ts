import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_REFERENCE_BYTES = 1024 * 1024 * 1024;
const ALLOWED = /\.(mp3|m4a)$/i;

export async function POST(request: NextRequest) {
  const workspace = request.headers.get("x-music-workspace")?.trim();
  if (!workspace) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim().toLowerCase() : "audio/mpeg";
  const size = Number(body.size || 0);

  if (!filename || !ALLOWED.test(filename)) return NextResponse.json({ success: false, error: "Audio Referensi harus MP3 atau M4A." }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_REFERENCE_BYTES) return NextResponse.json({ success: false, error: "Ukuran Audio Referensi tidak valid." }, { status: 400 });
  if (!/^audio\/(mpeg|mp4|x-m4a|m4a)$/i.test(contentType)) return NextResponse.json({ success: false, error: "Format Audio Referensi tidak didukung." }, { status: 400 });

  try {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `salvian-music/${workspace}/stage2-reference/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const token = await issueSignedToken({
      pathname,
      operations: ["put"],
      allowedContentTypes: [contentType],
      maximumSizeInBytes: size,
      validUntil: Date.now() + 30 * 60 * 1000,
    });
    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: "put",
      access: "public",
      validUntil: Date.now() + 30 * 60 * 1000,
    });

    const storeId = process.env.BLOB_STORE_ID?.trim();
    if (!storeId) throw new Error("BLOB_STORE_ID belum tersedia pada deployment.");
    const publicUrl = `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;
    return NextResponse.json({ success: true, presignedUrl, url: publicUrl, pathname, contentType, size });
  } catch (error) {
    console.error("SALVIAN Stage-2 Blob presign error", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menyiapkan upload Audio Referensi." }, { status: 500 });
  }
}
