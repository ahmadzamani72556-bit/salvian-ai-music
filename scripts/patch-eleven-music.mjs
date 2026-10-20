import { readFileSync } from "node:fs";

// Build-time guard only. Music 2.5 hardening lives in app/api/music/route.ts.
// Keep this command intentionally side-effect free so Vercel cannot fail because
// of a brittle source-rewrite step.
const source = readFileSync("app/api/music/route.ts", "utf8");
if (!source.includes("music_v2_5") || !source.includes("buildPremiumMusicDirective")) {
  throw new Error("Music 2.5 route guard: required music engine code is missing.");
}
console.log("SALVIAN: Music 2.5 route guard OK");
