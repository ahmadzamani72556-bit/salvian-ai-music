import { NextRequest, NextResponse } from "next/server";

const PUBLIC_MUSIC_ORIGINS = new Set([
  "https://music.sovira.id",
  "https://salvian-ai-music.vercel.app",
]);

function isAllowedMutationOrigin(request: NextRequest) {
  // Same-origin browser requests normally carry Sec-Fetch-Site= same-origin.
  // Do not reject requests that omit these browser headers (native clients and
  // server-to-server calls can legitimately omit them), but reject an explicit
  // cross-site origin so a third-party page cannot drive privileged Music APIs.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return true;

  return PUBLIC_MUSIC_ORIGINS.has(origin);
}

/**
 * Public Music security boundary.
 *
 * 1. Blocks explicit cross-site mutations against Music/Assistant endpoints.
 * 2. Keeps the existing Stage-2 Mureka bridge exactly as-is.
 * 3. Prevents stale Stage-2 cookies from poisoning a normal generation.
 * 4. Adds no usage quota or message limit.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedMutation =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    (pathname === "/api/music" || pathname.startsWith("/api/music/") || pathname === "/api/assistant");

  if (isProtectedMutation && !isAllowedMutationOrigin(request)) {
    return new NextResponse(
      JSON.stringify({ error: "Cross-site request blocked." }),
      {
        status: 403,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  const pending = request.cookies.get("salvian_stage2_pending")?.value === "1";
  const remixId = request.cookies.get("salvian_stage2_remix_id")?.value?.trim();

  if (
    request.method === "POST" &&
    pathname === "/api/music" &&
    pending &&
    Boolean(remixId)
  ) {
    return NextResponse.rewrite(new URL("/api/music/remix", request.url));
  }

  // Remove an orphaned pending flag so an old failed upload can never poison
  // the next generation request. A valid remix cookie is left untouched.
  if (
    request.method === "POST" &&
    pathname === "/api/music" &&
    pending &&
    !remixId
  ) {
    const response = NextResponse.next();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/music",
      maxAge: 0,
    };
    response.cookies.set("salvian_stage2_pending", "", cookieOptions);
    response.cookies.set("salvian_stage2_remix_id", "", cookieOptions);
    return response;
  }

  const response = NextResponse.next();
  if (pathname.startsWith("/api/music") || pathname === "/api/assistant") {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return response;
}

export const config = {
  matcher: ["/api/music/:path*", "/api/assistant"],
};
