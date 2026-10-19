import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "components", "premium-music-studio.tsx");
const source = fs.readFileSync(filePath, "utf8");

const current = 'if (file.size > 10 * 1024 * 1024) { setNotice("Ukuran file maksimal 10 MB."); return; }';
const stage2Safe = 'if (purpose === "voice" && file.size > 10 * 1024 * 1024) { setNotice("Ukuran file Voice & Vocal maksimal 10 MB."); return; }';

if (source.includes(stage2Safe)) process.exit(0);
if (!source.includes(current)) {
  throw new Error("Stage-2 reference size guard pattern was not found; refusing to modify the Studio source.");
}

fs.writeFileSync(filePath, source.replace(current, stage2Safe), "utf8");
console.log("Prepared Stage-2 Mureka reference upload: no 10 MB client guard; Voice & Vocal remains 10 MB.");
