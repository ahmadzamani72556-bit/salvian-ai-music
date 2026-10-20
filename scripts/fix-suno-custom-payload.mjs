import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "api", "music", "route.ts");
let source = fs.readFileSync(file, "utf8");

// These are build-time edits to the existing Music route. Layer 1 upload/reference
// routing is deliberately not changed here; only Suno generation payloads are normalized.
const tokenAnchors = [
  {
    old: '  if (/qasidah|sholawat|selawat|religi|islami|islamic/.test(s)) add("deep devotional qasidah", "sholawat melodic phrasing", "Islamic devotional melody", "spiritual Middle Eastern melodic ornamentation", "reverent expressive vocal delivery", "warm frame-drum and hand-percussion colors");',
    new: '  if (/qasidah|sholawat|selawat|religi|islami|islamic/.test(s)) add("deep devotional qasidah", "sholawat melodic phrasing", "Islamic devotional melody", "spiritual Middle Eastern melodic ornamentation", "reverent expressive vocal delivery", "warm frame-drum and hand-percussion colors");\n  if (/nasyid|nasheed/.test(s)) add("nasyid vocal harmony", "devotional ensemble phrasing", "warm spiritual chorus texture", "clean expressive lead vocal");',
  },
  {
    old: '  if (/dangdut/.test(s)) add("strong Indonesian dangdut groove", "kendang-style rhythmic accents", "syncopated dangdut bass", "punchy kick and percussion", "ornamental dangdut melodic phrasing", "lively rhythmic fills");',
    new: '  if (/dangdut/.test(s)) add("strong Indonesian dangdut groove", "kendang-style rhythmic accents", "syncopated dangdut bass", "punchy kick and percussion", "ornamental dangdut melodic phrasing", "lively rhythmic fills");\n  if (/pesta|party|meriah|goyang/.test(s)) add("festive Indonesian party energy", "danceable crowd-ready groove", "celebratory rhythmic fills", "high-energy arrangement");\n  if (/koplo/.test(s)) add("dangdut koplo groove", "fast kendang patterns", "energetic percussive fills");',
  },
  {
    old: '  if (/dj|edm|electronic/.test(s)) add("DJ/electronic rhythmic production");',
    new: '  if (/dj|edm|electronic/.test(s)) add("DJ/electronic rhythmic production", "tight electronic drums", "controlled sub bass", "clean dance drop and transition");\n  if (/remix|rework|remixed/.test(s)) add("professional remix arrangement", "strong beat-driven transitions", "DJ-style intro and outro", "clean drops and fills", "seamless loop-aware structure");\n  if (/gambus|arabic|arab/.test(s)) add("gambus and Arabic melodic ornamentation", "oud-like plucked textures", "Middle Eastern rhythmic color");\n  if (/keroncong/.test(s)) add("Indonesian keroncong character", "warm plucked string texture");\n  if (/tarling/.test(s)) add("tarling guitar character", "West Java melodic phrasing");',
  },
  {
    old: '  add("crystal-clear lead vocal", "bright warm full-bodied vocal", "clean controlled vibrato", "tasteful melisma and cengkok", "punchy clean low end", "clear separated mids", "open non-harsh highs", "modern polished commercial mix");',
    new: '  add("crystal-clear lead vocal", "bright warm full-bodied vocal", "rounded full vocal tone", "beautiful controlled cengkok", "rounded melodic ornamentation", "clean controlled vibrato", "tasteful melisma and cengkok", "clear Indonesian diction", "natural expressive phrasing", "punchy clean low end", "full rounded bass", "clear separated mids", "open non-harsh highs", "wide balanced polished mix", "modern polished commercial mix");',
  },
];

for (const { old, new: replacement } of tokenAnchors) {
  const count = source.split(old).length - 1;
  if (count === 1) source = source.replace(old, replacement);
  else if (count !== 1) throw new Error(`Expected exactly one instruction anchor, found ${count}: ${old.slice(0, 80)}`);
}

// Suno custom mode has strict provider limits. Never send the long internal
// premium directive as style_tags; convert it into compact native style tags.
const oldBlock = `      } else {\n        const payload: ProviderData = { model: "suno-v6", lyrics: lyrics.slice(0, 3000), style_tags: premiumDirective || "pop, modern, emotional", song_title: title, instrumental: body.instrumental === true };\n        if (!body.instrumental && ["male", "female", "m", "f"].includes(gender)) payload.vocal_gender = gender;\n        if (typeof body.styleWeight === "number") payload.style_weight = Math.min(Math.max(body.styleWeight, 0), 1);\n        if (typeof body.weirdness === "number") payload.weirdness_constraint = Math.min(Math.max(body.weirdness, 0), 1);\n        if (Number.isInteger(body.variety)) payload.variety = Math.min(Math.max(Number(body.variety), 0), 4);\n        generated = await sunoRequest(SUNO_GENERATE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });\n      }`;

const newBlock = `      } else {\n        const sunoLocks = requestedStyleTokens(String(body.style || "").trim(), Number(body.tempo || 0), body.instrumental === true);\n        const sunoStyleTags = [String(body.style || "").trim(), ...sunoLocks.positive]\n          .filter(Boolean).join(", ").slice(0, 1000);\n        const sunoNegativeTags = sunoLocks.negative.join(", ").slice(0, 1000);\n        const payload: ProviderData = {\n          model: "suno-v6",\n          lyrics: lyrics.slice(0, 3000),\n          style_tags: sunoStyleTags || "modern polished music, clear warm rounded vocal",\n          negative_tags: sunoNegativeTags || undefined,\n          song_title: title,\n          instrumental: body.instrumental === true,\n        };\n        if (!body.instrumental && ["male", "female", "m", "f"].includes(gender)) payload.vocal_gender = gender;\n        if (typeof body.styleWeight === "number") payload.style_weight = Math.min(Math.max(body.styleWeight, 0), 1);\n        if (typeof body.weirdness === "number") payload.weirdness_constraint = Math.min(Math.max(body.weirdness, 0), 1);\n        if (Number.isInteger(body.variety)) payload.variety = Math.min(Math.max(Number(body.variety), 0), 4);\n        generated = await sunoRequest(SUNO_GENERATE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });\n      }`;

if (!source.includes(oldBlock)) {
  // If a previous production build already transformed the source, do not fail.
  if (!source.includes("const sunoStyleTags = [String(body.style || \"\").trim()")) {
    throw new Error("Suno custom payload anchor not found; refusing to patch an unknown route shape.");
  }
} else {
  const occurrences = source.split(oldBlock).length - 1;
  if (occurrences !== 1) throw new Error(`Expected exactly one Suno custom payload anchor, found ${occurrences}.`);
  source = source.replace(oldBlock, newBlock);
}

// Reference/voice generation also has strict text ceilings. Keep the actual user
// lyrics usable while preventing the internal quality directive from becoming an
// oversized provider field. This does not touch the Layer 1 upload routes.
source = source.replaceAll(
  'lyrics: lyrics.slice(0, 3000), style_requirements: premiumDirective,',
  'lyrics: lyrics.slice(0, 1100), style_requirements: premiumDirective.slice(0, 1800),',
);

source = source.replace(
  'prompt: `${premiumDirective}\\n\\nLYRICS:\\n${lyrics.slice(0, 3000)}`, customMode: true, style: premiumDirective,',
  'prompt: `${premiumDirective.slice(0, 1800)}\\n\\nLYRICS:\\n${lyrics.slice(0, 1100)}`.slice(0, 2950), customMode: true, style: premiumDirective.slice(0, 1000),',
);

// Belt-and-suspenders guards for any other Suno style field that still receives
// the internal directive. These are compile-time replacements, so the provider
// can never receive the 1700+ character directive as style_tags/style.
source = source.replace(/style_tags:\s*premiumDirective(?:\.slice\(0,\s*1000\))?/g, 'style_tags: premiumDirective.slice(0, 1000)');
source = source.replace(/style:\s*premiumDirective(?:\.slice\(0,\s*1000\))?/g, 'style: premiumDirective.slice(0, 1000)');

// Hard invariant: if the route still contains the unsafe custom-generation form,
// fail the build instead of silently shipping another broken deployment.
if (source.includes('style_tags: premiumDirective ||')) {
  throw new Error("Suno safety invariant failed: unsafe premiumDirective style_tags remains.");
}
if (source.includes('style_tags: premiumDirective,')) {
  throw new Error("Suno safety invariant failed: unbounded premiumDirective style_tags remains.");
}

fs.writeFileSync(file, source, "utf8");
console.log("Suno Layer 2 payload guard applied: custom style_tags <= 1000, negative_tags <= 1000, lyrics <= 3000, reference/source prompts bounded, and unsafe premiumDirective style fields rejected at build time.");
