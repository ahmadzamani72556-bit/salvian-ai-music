const fs = require("fs");
const path = require("path");

const root = process.cwd();

function patchIfNeeded(filePath, from, to, alreadyPatched) {
  const file = path.join(root, filePath);
  if (!fs.existsSync(file)) throw new Error(`Required Music route not found: ${filePath}`);
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(alreadyPatched)) return;
  if (!source.includes(from)) throw new Error(`Required status guard pattern not found in ${filePath}. Refusing to build without task ownership hardening.`);
  source = source.replace(from, to);
  fs.writeFileSync(file, source);
}

const songFrom = '      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`, { method: "GET" });';
const songTo = '      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const ownership = await fetch(`${DATA_API}/salvian_music_projects?user_id=eq.${encodeURIComponent(subject(auth) || "")}&task_id=eq.${encodeURIComponent(taskId)}&select=id&limit=1`, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });\n      const ownershipRows = await ownership.json().catch(() => []);\n      if (!ownership.ok) return NextResponse.json({ success: false, error: "Gagal memverifikasi kepemilikan task." }, { status: 503 });\n      if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 404 });\n      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`, { method: "GET" });';
patchIfNeeded("app/api/music/route.ts", songFrom, songTo, 'const owned = await ownsTask(auth, taskId);');

const instrumentalFrom = '      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);';
const instrumentalTo = '      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const ownership = await fetch(`${DATA_API}/salvian_music_projects?user_id=eq.${encodeURIComponent(subject(auth) || "")}&task_id=eq.${encodeURIComponent(id)}&select=id&limit=1`, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });\n      const ownershipRows = await ownership.json().catch(() => []);\n      if (!ownership.ok) return NextResponse.json({ success: false, error: "Gagal memverifikasi kepemilikan task." }, { status: 503 });\n      if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 404 });\n      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);';
patchIfNeeded("app/api/music/instrumental/route.ts", instrumentalFrom, instrumentalTo, 'const owned = await ownsTask(auth, id);');

console.log("SALVIAN Music task ownership hardening verified and applied");
