import { NextRequest, NextResponse } from "next/server";
import { listMusicProjectsServer } from "../../../lib/server-credit-refund";

export const runtime = "nodejs";

function subject(auth: string): string | null {
  try {
    const token = auth.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!token) return null;
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    return typeof payload?.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch { return null; }
}

function authorized(request: NextRequest) {
  const auth = request.headers.get("authorization");
  return auth && /^Bearer\s+/i.test(auth) ? auth : null;
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (!auth) return NextResponse.json({ success: false, error: "Sesi login tidak ditemukan." }, { status: 401 });
  const userId = subject(auth);
  if (!userId) return NextResponse.json({ success: false, error: "Sesi akun tidak valid." }, { status: 401 });
  try {
    const projects = await listMusicProjectsServer(userId);
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error("MUSIC LIBRARY SERVER READ ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal mengambil Library." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = authorized(request);
  if (!auth) return NextResponse.json({ success: false, error: "Sesi login tidak ditemukan." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "ID project belum dikirim." }, { status: 400 });
  try {
    const response = await fetch(`${process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1"}/salvian_music_projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ success: false, error: "Project tidak dapat dihapus." }, { status: response.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghapus project." }, { status: 500 });
  }
}
