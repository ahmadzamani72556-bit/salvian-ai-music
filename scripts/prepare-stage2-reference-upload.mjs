import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "components", "premium-music-studio.tsx");
let source = fs.readFileSync(filePath, "utf8");

const guarded = 'if (file.size > 10 * 1024 * 1024) { setNotice("Ukuran file maksimal 10 MB."); return; }';
const safe = 'if (purpose === "voice" && file.size > 10 * 1024 * 1024) { setNotice("Ukuran file Voice & Vocal maksimal 10 MB."); return; }';

if (source.includes(guarded)) {
  source = source.replace(guarded, safe);
  fs.writeFileSync(filePath, source, "utf8");
  console.log("Stage-2 Mureka reference size guard removed; Voice & Vocal guard retained.");
} else if (!source.includes(safe)) {
  throw new Error("Expected upload size guard was not found. Build stopped to avoid modifying an unknown Studio source.");
}
