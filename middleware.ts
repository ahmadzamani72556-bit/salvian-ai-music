import { NextRequest, NextResponse } from "next/server";

/**
 * Stage-2 bridge:
 * Route only the next Mureka generation request to the dedicated full-duration
 * Remix handler when BOTH one-shot cookies exist. A stale pending flag without
 * the actual Remix upload ID must never send the user into a Remix lookup error.
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

  // Remove an orphaned pending flag so an old failed upload can never poison
  // the next generation request. A valid remix cookie is left untouched.
  if (request.method === "POST" && request.nextUrl.pathname === "/api/music" && pending && !remixId) {
    const response = NextResponse.next();
    response.cookies.set("salvian_stage2_pending", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/music", maxAge: 0 });
    response.cookies.set("salvian_stage2_remix_id", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/music", maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/music"],
};
