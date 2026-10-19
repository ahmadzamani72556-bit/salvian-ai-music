import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const file = fileURLToPath(new URL("../components/premium-music-studio.tsx", import.meta.url));
const source = readFileSync(file, "utf8");

const fixed = `function headersFor(workspace: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { "X-Music-Workspace": workspace };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}`;

if (source.includes(fixed)) process.exit(0);

const helperPattern = /function headersFor\(workspace: string, json = false\)\s*\{[\s\S]*?\n\}/;
if (!helperPattern.test(source)) {
  throw new Error("Music headers helper was not found; refusing to modify the source unexpectedly.");
}

writeFileSync(file, source.replace(helperPattern, fixed), "utf8");
console.log("Normalized Music fetch headers for strict TypeScript/DOM HeadersInit compatibility.");
