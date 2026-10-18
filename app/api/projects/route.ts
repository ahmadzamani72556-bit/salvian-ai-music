import { NextRequest, NextResponse } from "next/server";
import { deleteMusicProjectServer, listMusicProjectsServer } from "../../../lib/server-music-projects";

export const runtime = "nodejs";

function workspace(request: NextRequest) {
  return request.headers.get("x-music-workspace")?.trim() || "";
}

export async function GET(request: NextRequest) {
  const userId = workspace(request);
  if (!userId) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  try {
    const projects = await listMusicProjectsServer(userId);
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error("MUSIC LIBRARY SERVER READ ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal mengambil Library." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = workspace(request);
  if (!userId) return NextResponse.json({ success: false, error: "Workspace Music belum siap." }, { status: 400 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "ID project belum dikirim." }, { status: 400 });
  try {
    const deleted = await deleteMusicProjectServer(userId, id);
    if (!deleted) return NextResponse.json({ success: false, error: "Project tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MUSIC LIBRARY SERVER DELETE ERROR", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghapus project." }, { status: 500 });
  }
}
