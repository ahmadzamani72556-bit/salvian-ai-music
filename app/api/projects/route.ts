import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DATA_API = process.env.NEON_DATA_API_URL || "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

function authorized(request: NextRequest) {
  const auth = request.headers.get("authorization");
  return auth && /^Bearer\s+/i.test(auth) ? auth : null;
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (!auth) return NextResponse.json({ success: false, error: "Sesi login tidak ditemukan." }, { status: 401 });
  try {
    const response = await fetch(`${DATA_API}/salvian_music_projects?select=id,title,lyrics,style,model,task_id,status,audio_url,created_at,updated_at&order=created_at.desc`, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });
    const data = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ success: false, error: "Gagal mengambil Library." }, { status: response.status });
    return NextResponse.json({ success: true, projects: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal mengambil Library." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = authorized(request);
  if (!auth) return NextResponse.json({ success: false, error: "Sesi login tidak ditemukan." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "ID project belum dikirim." }, { status: 400 });
  try {
    const response = await fetch(`${DATA_API}/salvian_music_projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ success: false, error: "Project tidak dapat dihapus." }, { status: response.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Gagal menghapus project." }, { status: 500 });
  }
}
