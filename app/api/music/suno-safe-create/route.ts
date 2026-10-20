import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_BASE_URL = (process.env.SUNO_API_BASE_URL || "https://www.suno-api.io").replace(/\/$/, "");

export async function POST(request: NextRequest) {
  if (!SUNO_API_KEY) {
    return NextResponse.json({ success: false, error: "SUNO_API_KEY belum tersedia di Vercel SALVIAN AI MUSIC." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ success: false, error: "Payload Suno tidak valid." }, { status: 400 });

  const styleTags = String(body.style_tags || "pop, modern, emotional").trim().slice(0, 1000);
  const payload: Record<string, unknown> = {
    ...body,
    style_tags: styleTags,
  };

  const upstream = await fetch(`${SUNO_API_BASE_URL}/api/music/create/custom`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await upstream.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return NextResponse.json(data, { status: upstream.status });
}
