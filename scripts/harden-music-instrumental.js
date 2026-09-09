const fs = require("fs");
const path = require("path");

const routePath = path.join(process.cwd(), "app/api/music/instrumental/route.ts");
if (!fs.existsSync(routePath)) throw new Error("Required Music instrumental route not found.");

let route = fs.readFileSync(routePath, "utf8");

const patches = [
  [
    'import { refundMusicCreditsServer, updateMusicProjectServer } from "../../../../lib/server-credit-refund";',
    'import { createMusicProjectServer, refundMusicCreditsServer, updateMusicProjectServer } from "../../../../lib/server-credit-refund";',
  ],
  [
    'async function patchLibrary(auth: string, taskIdValue: string, statusValue: string, audioUrl: string | null, providerData: unknown) {',
    'async function ownsTask(auth: string, taskIdValue: string) {\n  const userId = subject(auth);\n  if (!userId) return false;\n  const response = await fetch(`${DATA_API}/salvian_music_projects?user_id=eq.${encodeURIComponent(userId)}&task_id=eq.${encodeURIComponent(taskIdValue)}&select=id&limit=1`, { method: "GET", headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });\n  if (!response.ok) return false;\n  const data = await response.json().catch(() => []);\n  return Array.isArray(data) && data.length > 0;\n}\n\nasync function patchLibrary(auth: string, taskIdValue: string, statusValue: string, audioUrl: string | null, providerData: unknown) {',
  ],
  [
    '  const fallback = await rpc(auth, "salvian_create_music_project", {',
    '  if (uid) {\n    try {\n      const recovered = await createMusicProjectServer(uid, {\n        title: String(body.title || "Instrumental SALVIAN AI"),\n        lyrics: String(body.lyrics || "[Instrumental]"),\n        style: String(body.style || ""),\n        model: String(body.model || "auto"),\n        taskId: body.taskId ? String(body.taskId) : null,\n        status: String(body.status || "preparing"),\n        audioUrl: body.audioUrl ? String(body.audioUrl) : null,\n        providerData: body.providerData ?? null,\n      });\n      if (recovered) return { ok: true, data: recovered, recovered: true };\n    } catch (error) {\n      console.error("INSTRUMENTAL LIBRARY SERVER RECOVERY ERROR", error);\n    }\n  }\n\n  const fallback = await rpc(auth, "salvian_create_music_project", {',
  ],
  [
    '      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);',
    '      const owned = await ownsTask(auth, id);\n      if (!owned) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 403 });\n      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);',
  ],
  [
    '      const result = NextResponse.json({ success: true, title: String(body?.title || "Instrumental SALVIAN AI"), taskId: id, status: s, audio: a, credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST, librarySaved: saved.ok, data: generated.data });',
    '      if (!saved.ok) {\n        try { await refund(auth); } catch (e) { console.error("INSTRUMENTAL ORPHAN TASK REFUND", e); }\n        return NextResponse.json({ success: false, error: "Task instrumental berhasil dibuat tetapi Library gagal menyimpan task. Kredit sudah dikembalikan.", taskId: id, librarySaved: false }, { status: 503 });\n      }\n\n      const result = NextResponse.json({ success: true, title: String(body?.title || "Instrumental SALVIAN AI"), taskId: id, status: s, audio: a, credits: Number(creditRow?.balance || 0), creditCost: MUSIC_CREDIT_COST, librarySaved: true, libraryRecovered: saved.recovered === true, data: generated.data });',
  ],
];

for (const [from, to] of patches) {
  if (!route.includes(from)) {
    if (route.includes(to)) continue;
    throw new Error("Required instrumental hardening pattern not found. Refusing to build with stale task ownership/recovery logic.");
  }
  route = route.replace(from, to);
}

fs.writeFileSync(routePath, route);
console.log("SALVIAN Music instrumental hardening applied: task ownership, server Library recovery, orphan-task refund");
