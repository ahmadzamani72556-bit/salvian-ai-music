import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Build guard only. Do not rewrite source during `next build`.
// The Music Studio component may already contain an equivalent headersFor helper
// in a different formatting shape after provider/branding changes.
const file = fileURLToPath(new URL("../components/premium-music-studio.tsx", import.meta.url));
const source = readFileSync(file, "utf8");

if (!source.includes("function headersFor(")) {
  throw new Error("Music headers helper is missing from premium-music-studio.tsx.");
}

console.log("SALVIAN: Music headers helper verified; no build-time source rewrite needed.");
