import { NextRequest, NextResponse } from "next/server";

const ISSUER = "salvian-ai";
const AUDIENCE = "salvian-apps";
const COOKIE_NAME = "salvian_sso";

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Record<string, unknown>;
}

async function verifySalvianToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("Invalid token algorithm");
  if (payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.app !== "music") throw new Error("Invalid token audience");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Missing subject");

  const exp = Number(payload.exp || 0);
  if (!exp || Date.now() / 1000 >= exp) throw new Error("Expired token");

  const secretValue = process.env.SALVIAN_MUSIC_SSO_SHARED_SECRET;
  if (!secretValue || secretValue.length < 32) throw new Error("Music SSO secret is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Invalid token signature");

  return payload;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";

  if (!token) return NextResponse.redirect(new URL("/", request.url), 303);

  try {
    await verifySalvianToken(token);
  } catch {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(returnTo.startsWith("/") ? returnTo : "/", request.url), 303);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return response;
}
