const fs = require("fs");
const path = require("path");

const root = process.cwd();

function patch(filePath, from, to) {
  const file = path.join(root, filePath);
  if (!fs.existsSync(file)) return;
  let source = fs.readFileSync(file, "utf8");
  if (!source.includes(from)) return;
  source = source.replace(from, to);
  fs.writeFileSync(file, source);
}

patch(
  "app/api/music/route.ts",
  `      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`, { method: "GET" });`,
  `      if (!taskId) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const ownership = await fetch(`${DATA_API}/salvian_music_projects?task_id=eq.${encodeURIComponent(taskId)}&select=id&limit=1`, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });\n      const ownershipRows = await ownership.json().catch(() => []);\n      if (!ownership.ok) return NextResponse.json({ success: false, error: "Gagal memverifikasi kepemilikan task." }, { status: 503 });\n      if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 404 });\n      const q = await provider(`/v1/song/query/${encodeURIComponent(taskId)}`, { method: "GET" });`
);

patch(
  "app/api/music/instrumental/route.ts",
  `      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);`,
  `      if (!id) return NextResponse.json({ success: false, error: "Task ID belum dikirim." }, { status: 400 });\n      const ownership = await fetch(`${DATA_API}/salvian_music_projects?task_id=eq.${encodeURIComponent(id)}&select=id&limit=1`, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store" });\n      const ownershipRows = await ownership.json().catch(() => []);\n      if (!ownership.ok) return NextResponse.json({ success: false, error: "Gagal memverifikasi kepemilikan task." }, { status: 503 });\n      if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) return NextResponse.json({ success: false, error: "Task tidak ditemukan pada Library akun ini." }, { status: 404 });\n      const q = await provider(`/v1/instrumental/query/${encodeURIComponent(id)}`);`
);

console.log("SALVIAN Music task ownership hardening applied");
