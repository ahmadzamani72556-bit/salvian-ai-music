import { readFileSync, writeFileSync } from "node:fs";

const path = "components/fullscreen-ai-assistant.tsx";
const source = readFileSync(path, "utf8");
const oldClass = "text-sm font-extrabold uppercase tracking-[0.12em] text-violet-200";
const newClass = "text-base font-extrabold uppercase tracking-[0.12em] text-violet-800";

if (!source.includes(oldClass)) {
  throw new Error("Expected Music Assistant card heading style was not found");
}

writeFileSync(path, source.replace(oldClass, newClass), "utf8");
console.log("Improved Music Assistant card heading contrast.");
