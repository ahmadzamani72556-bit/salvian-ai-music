import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "api", "music", "route.ts");
const source = fs.readFileSync(file, "utf8");

const oldBlock = `      } else {\n        const payload: ProviderData = { model: "suno-v6", lyrics: lyrics.slice(0, 3000), style_tags: premiumDirective || "pop, modern, emotional", song_title: title, instrumental: body.instrumental === true };\n        if (!body.instrumental && ["male", "female", "m", "f"].includes(gender)) payload.vocal_gender = gender;\n        if (typeof body.styleWeight === "number") payload.style_weight = Math.min(Math.max(body.styleWeight, 0), 1);\n        if (typeof body.weirdness === "number") payload.weirdness_constraint = Math.min(Math.max(body.weirdness, 0), 1);\n        if (Number.isInteger(body.variety)) payload.variety = Math.min(Math.max(Number(body.variety), 0), 4);\n        generated = await sunoRequest(SUNO_GENERATE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });\n      }`;

const newBlock = `      } else {\n        // Suno custom mode has a strict 1000-character style_tags limit.\n        // Keep the proven Salvian directive intact for engines that support long prompts,\n        // but map its musical requirements into Suno's native style/negative fields here.\n        const sunoLocks = requestedStyleTokens(String(body.style || "").trim(), Number(body.tempo || 0), body.instrumental === true);\n        const sunoStyleTags = [\n          String(body.style || "").trim(),\n          ...sunoLocks.positive,\n        ].filter(Boolean).join(", ").slice(0, 1000);\n        const sunoNegativeTags = sunoLocks.negative.join(", ").slice(0, 1000);\n        const payload: ProviderData = {\n          model: "suno-v6",\n          lyrics: lyrics.slice(0, 3000),\n          style_tags: sunoStyleTags || "modern polished music, clear warm vocal",\n          negative_tags: sunoNegativeTags || undefined,\n          song_title: title,\n          instrumental: body.instrumental === true,\n        };\n        if (!body.instrumental && ["male", "female", "m", "f"].includes(gender)) payload.vocal_gender = gender;\n        if (typeof body.styleWeight === "number") payload.style_weight = Math.min(Math.max(body.styleWeight, 0), 1);\n        if (typeof body.weirdness === "number") payload.weirdness_constraint = Math.min(Math.max(body.weirdness, 0), 1);\n        if (Number.isInteger(body.variety)) payload.variety = Math.min(Math.max(Number(body.variety), 0), 4);\n        generated = await sunoRequest(SUNO_GENERATE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });\n      }`;

if (!source.includes(oldBlock)) {
  throw new Error("Suno custom payload anchor not found; refusing to patch an unknown route shape.");
}

const occurrences = source.split(oldBlock).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one Suno custom payload anchor, found ${occurrences}.`);
}

fs.writeFileSync(file, source.replace(oldBlock, newBlock), "utf8");
console.log("Suno custom payload guard applied: style_tags <= 1000, lyrics <= 3000, negative_tags <= 1000.");
