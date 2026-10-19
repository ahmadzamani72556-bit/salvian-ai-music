import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../components/premium-music-studio.tsx", import.meta.url));
const source = readFileSync(file, "utf8");

const fixed = `function headersFor(workspace: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { "X-Music-Workspace": workspace };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}`;

if (source.includes(fixed)) process.exit(0);

const oneLineLegacy = `function headersFor(workspace: string, json = false) { return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace }; }`;
const multilineLegacy = `function headersFor(workspace: string, json = false) {
  return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace };
}`;

if (source.includes(oneLineLegacy)) {
  writeFileSync(file, source.replace(oneLineLegacy, fixed), "utf8");
  console.log("Normalized Music fetch headers from legacy one-line helper.");
  process.exit(0);
}

if (source.includes(multilineLegacy)) {
  writeFileSync(file, source.replace(multilineLegacy, fixed), "utf8");
  console.log("Normalized Music fetch headers from legacy helper.");
  process.exit(0);
}

throw new Error("Music headers helper was not found; refusing to modify the source unexpectedly.");
