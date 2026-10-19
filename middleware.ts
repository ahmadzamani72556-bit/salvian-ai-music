import { NextRequest, NextResponse } from "next/server";

/**
 * Stage-2 bridge:
 * Only route the next Mureka generation request to the dedicated full-duration
 * Remix handler when BOTH one-shot cookies exist. A stale pending flag without
 * the actual Remix upload ID must never send the user into a guaranteed
 * "Audio Referensi Remix belum ditemukan" failure.
 */
export function middleware(request: NextRequest) {
  const pending = request.cookies.get("salvian_stage2_pending")?.value === "1";
  const remixId = request.cookies.get("salvian_stage2_remix_id")?.value?.trim();

  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/api/music" &&
    pending &&
    Boolean(remixId)
  ) {
    return NextResponse.rewrite(new URL("/api/music/remix", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/music"],
};
