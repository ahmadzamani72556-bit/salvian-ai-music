import { readFileSync, writeFileSync } from "node:fs";

const file = "app/api/music/route.ts";
let source = readFileSync(file, "utf8");

// This script runs immediately before `next build` on Vercel. Keep it idempotent:
// never fail just because a previous deployment already contains the hardening.
const replaceOnce = (pattern, replacement) => {
  const next = source.replace(pattern, replacement);
  if (next !== source) source = next;
};

// Eleven Music v2/v2.5 composition plans are mutually exclusive with prompt and
// music_length_ms at /v1/music. Strip any provider-generated top-level metadata
// and defensively remove the same forbidden fields if a provider nests them.
replaceOnce(
  /function normalizeElevenCompositionPlan\(plan: any\) \{[\s\S]*?\n\}\n\nfunction enforceElevenPlan/,
  `function normalizeElevenCompositionPlan(plan: any) {
  const stripForbidden = (value: any): any => {
    if (Array.isArray(value)) return value.map(stripForbidden);
    if (!value || typeof value !== "object") return value;
    const output: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "music_length_ms" || key === "model_id" || key === "prompt") continue;
      output[key] = stripForbidden(child);
    }
    return output;
  };
  return stripForbidden(plan);
}

function enforceElevenPlan`
);

// With a composition_plan, only plan-compatible generation controls belong in
// the /v1/music body. In particular, force_instrumental and music_length_ms are
// prompt-mode controls and must not be sent with a plan.
replaceOnce(
  /const requestBody: Record<string, unknown> = \{ model_id: "music_v2_5", force_instrumental: body\.instrumental === true, store_for_inpainting: false \};/,
  `const requestBody: Record<string, unknown> = { model_id: "music_v2_5", store_for_inpainting: false };`
);

// If the generated plan is used, make the first chunk the strongest genre/style
// anchor. The provider docs state that the first chunk establishes the tone and
// genre for the rest of the song. Preserve section-specific styles only when
// they do not directly contradict the user's requested genre.
replaceOnce(
  /function enforceElevenPlan\(plan: any, body: Record<string, unknown>\) \{[\s\S]*?\n\}\n\nasync function elevenCompose/,
  `function enforceElevenPlan(plan: any, body: Record<string, unknown>) {
  if (!plan || !Array.isArray(plan.chunks) || !plan.chunks.length) return plan;
  const rawStyle = String(body.style || "").trim();
  const tempo = Number(body.tempo || 0);
  const instrumental = body.instrumental === true;
  const locks = requestedStyleTokens(rawStyle, tempo, instrumental);
  const lyrics = String(body.lyrics || "").trim();
  const hasArabicLyrics = /[\\u0600-\\u06FF]/.test(lyrics);
  const lines = instrumental ? [] : lyrics.split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
  const requested = rawStyle.toLowerCase();
  const genreFamilies: Array<[RegExp, RegExp]> = [
    [/dangdut/, /\\bdangdut\\b|kendang|cengkok/],
    [/qasidah|sholawat|selawat|religi|islami|islamic/, /qasidah|sholawat|selawat|islamic|devotional|rebana|frame.?drum/],
    [/pop/, /\\bpop\\b/],
    [/rock/, /\\brock\\b|guitar.?driven/],
    [/reggae/, /reggae/],
    [/minang/, /minang/],
    [/melayu/, /melayu/],
    [/ambon/, /ambon/],
    [/jazz/, /jazz/],
    [/country/, /country/],
    [/hip.?hop|rap/, /hip.?hop|rap/],
    [/metal/, /metal/],
    [/dj|edm|electronic/, /dj|edm|electronic|dance/],
    [/classical|orchestral/, /classical|orchestral/],
  ];
  const conflicts = genreFamilies
    .filter(([wanted]) => !wanted.test(requested))
    .map(([, family]) => family);
  const conflictsRequested = genreFamilies.filter(([wanted]) => wanted.test(requested)).map(([, family]) => family);
  const conflictsForText = (text: string) => conflicts.some(pattern => pattern.test(text)) && !conflictsRequested.some(pattern => pattern.test(text));
  const chunks = plan.chunks.map((chunk: any, index: number) => {
    const generatedPositive = Array.isArray(chunk.positive_styles) ? chunk.positive_styles.map(String) : [];
    const generatedNegative = Array.isArray(chunk.negative_styles) ? chunk.negative_styles.map(String) : [];
    const arabicPositive = hasArabicLyrics ? ["clear Arabic diction", "accurate Arabic makhraj", "distinct Arabic consonants and vowels", "audible Arabic word endings"] : [];
    const arabicNegative = hasArabicLyrics ? ["mumbled Arabic", "blurred Arabic syllables", "mispronounced Arabic", "foreign-language drift"] : [];
    const safeGeneratedPositive = generatedPositive.filter(value => !conflictsForText(value));
    const safeGeneratedNegative = generatedNegative.filter(value => !conflictsRequested.some(pattern => pattern.test(value)));
    const basePositive = index === 0 ? locks.positive : locks.positive.slice(0, 12);
    const mergedPositive = [...basePositive, ...arabicPositive, ...safeGeneratedPositive]
      .filter((value, i, all) => all.indexOf(value) === i)
      .slice(0, 50);
    const mergedNegative = [...locks.negative, ...arabicNegative, ...safeGeneratedNegative]
      .filter((value, i, all) => all.indexOf(value) === i)
      .slice(0, 50);
    const next: any = {
      ...chunk,
      positive_styles: mergedPositive,
      negative_styles: mergedNegative,
      context_adherence: "high",
    };
    if (lines.length) {
      const total = plan.chunks.length;
      const start = Math.floor(lines.length * index / total);
      const end = index === total - 1 ? lines.length : Math.max(start + 1, Math.floor(lines.length * (index + 1) / total));
      const section = typeof chunk.text === "string"
        ? (chunk.text.match(/^\\s*(\\[[^\\]]+\\])/)?.[1] || `[Section ${index + 1}]`)
        : `[Section ${index + 1}]`;
      next.text = `${section}\\n${lines.slice(start, end).join("\\n")}`;
    }
    return next;
  });
  return { chunks };
}

async function elevenCompose`
);

writeFileSync(file, source);
console.log("SALVIAN: Music 2.5 build hardening applied (idempotent, plan-safe, hard style lock)");
