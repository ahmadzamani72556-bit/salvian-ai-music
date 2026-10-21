import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

const DAILY_LIMIT = 15;
const BURST_LIMIT = 8;
const BURST_WINDOW_SECONDS = 30;
const COOKIE_NAME = "salvian_sso";
const ISSUER = "salvian-ai";
const AUDIENCE = "salvian-apps";

const DATABASE_URL = process.env.DATABASE_URL;
let schemaReady: Promise<void> | null = null;

function getSql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL belum tersedia untuk batas harian Asisten AI.");
  return neon(DATABASE_URL);
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

function decodeJson(value: string) {
  return JSON.parse(Buffer.from(base64UrlToBytes(value)).toString("utf8")) as Record<string, unknown>;
}

async function verifiedAccountId(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1)
    ?.trim();

  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    if (payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.app !== "music") return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;

    const exp = Number(payload.exp || 0);
    if (!exp || Date.now() / 1000 >= exp) return null;

    const secret = process.env.SALVIAN_MUSIC_SSO_SHARED_SECRET;
    if (!secret || secret.length < 32) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
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

    return valid ? payload.sub : null;
  } catch {
    return null;
  }
}

function clientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (forwarded) return forwarded;

  return "unknown-ip";
}

function hashKey(prefix: string, value: string) {
  return `${prefix}:${createHash("sha256").update(value).digest("hex")}`;
}

async function quotaKey(request: Request) {
  const accountId = await verifiedAccountId(request);
  if (accountId) return hashKey("account", accountId);
  return hashKey("ip", `${clientIp(request)}|${request.headers.get("user-agent") || "unknown"}`);
}

async function ensureTables() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS public.salvian_music_assistant_daily_usage (
          quota_key TEXT NOT NULL,
          usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
          used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= ${DAILY_LIMIT}),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (quota_key, usage_date)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS public.salvian_music_assistant_burst_usage (
          burst_key TEXT PRIMARY KEY,
          window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= ${BURST_LIMIT}),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

async function reserveBurst(request: Request) {
  const sql = getSql();
  const key = hashKey("ip", clientIp(request));
  const rows = await sql`
    INSERT INTO public.salvian_music_assistant_burst_usage (burst_key, window_started_at, used_count, updated_at)
    VALUES (${key}, now(), 1, now())
    ON CONFLICT (burst_key)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.salvian_music_assistant_burst_usage.window_started_at <= now() - (${BURST_WINDOW_SECONDS} * INTERVAL '1 second') THEN now()
        ELSE public.salvian_music_assistant_burst_usage.window_started_at
      END,
      used_count = CASE
        WHEN public.salvian_music_assistant_burst_usage.window_started_at <= now() - (${BURST_WINDOW_SECONDS} * INTERVAL '1 second') THEN 1
        ELSE public.salvian_music_assistant_burst_usage.used_count + 1
      END,
      updated_at = now()
    WHERE public.salvian_music_assistant_burst_usage.window_started_at <= now() - (${BURST_WINDOW_SECONDS} * INTERVAL '1 second')
       OR public.salvian_music_assistant_burst_usage.used_count < ${BURST_LIMIT}
    RETURNING used_count
  `;

  if (!rows.length) return { allowed: false, key };
  return { allowed: true, key };
}

export async function reserveAssistantDailyRequest(request: Request) {
  await ensureTables();

  // Lapisan pertama: cegah burst global per alamat IP, termasuk akun yang berbeda-beda.
  const burst = await reserveBurst(request);
  if (!burst.allowed) {
    return { allowed: false, remaining: 0, key: null as string | null };
  }

  // Lapisan kedua: hard cap 15 chat/hari per akun SALVIAN AI yang tervalidasi.
  const key = await quotaKey(request);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO public.salvian_music_assistant_daily_usage (quota_key, usage_date, used_count, updated_at)
    VALUES (${key}, CURRENT_DATE, 1, now())
    ON CONFLICT (quota_key, usage_date)
    DO UPDATE SET used_count = public.salvian_music_assistant_daily_usage.used_count + 1, updated_at = now()
    WHERE public.salvian_music_assistant_daily_usage.used_count < ${DAILY_LIMIT}
    RETURNING used_count
  `;

  if (!rows.length) {
    return { allowed: false, remaining: 0, key };
  }

  const used = Number(rows[0]?.used_count || 1);
  return { allowed: true, remaining: Math.max(DAILY_LIMIT - used, 0), key };
}

export async function refundAssistantDailyRequest(quotaKeyValue: string) {
  const sql = getSql();
  await sql`
    UPDATE public.salvian_music_assistant_daily_usage
    SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
    WHERE quota_key = ${quotaKeyValue} AND usage_date = CURRENT_DATE
  `;
}

export const ASSISTANT_DAILY_LIMIT = DAILY_LIMIT;
