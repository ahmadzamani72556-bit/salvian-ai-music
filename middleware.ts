import { NextRequest, NextResponse } from "next/server";

/**
 * Stage-2 bridge:
 * After a Mureka reference upload, the upload route stores the full-duration
 * Mureka Remix upload ID in a short-lived HttpOnly cookie. The existing Studio
 * still posts generation requests to /api/music, so this bridge sends only
 * the next generation request to the dedicated Remix handler. Status polling
 * continues to use the existing /api/music route after the one-shot cookie is
 * cleared by the Remix handler.
 */
export function middleware(request: NextRequest) {
  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/api/music" &&
    request.cookies.get("salvian_stage2_pending")?.value === "1"
  ) {
    return NextResponse.rewrite(new URL("/api/music/remix", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/music"],
};
