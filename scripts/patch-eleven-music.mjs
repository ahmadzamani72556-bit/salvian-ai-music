import { readFileSync, writeFileSync } from "node:fs";

const file = "app/api/music/route.ts";
let s = readFileSync(file, "utf8");

const replace = (oldText, newText, label) => {
  if (!s.includes(oldText)) throw new Error(`Music 2.5 patch anchor not found: ${label}`);
  s = s.replace(oldText, newText);
};

replace(`  if (/dj|edm|electronic/.test(s)) add("DJ/electronic rhythmic production");
  if (tempo > 0) add(\`${tempo} BPM\`);
  add("crystal-clear lead vocal", "bright warm full-bodied vocal", "clean controlled vibrato", "tasteful melisma and cengkok", "punchy clean low end", "clear separated mids", "open non-harsh highs", "modern polished commercial mix");`,
`  if (/dj|edm|electronic/.test(s)) add("DJ/electronic rhythmic production");
  if (/qasidah|sholawat|selawat|religi|islami|islamic/.test(s)) add("deep devotional qasidah", "sholawat melodic phrasing", "Arabic/Islamic melodic ornamentation", "rebana and frame-drum pulse", "reverent devotional cadence");
  if (/dangdut/.test(s)) add("authentic Indonesian dangdut groove", "kendang dangdut rhythm", "dangdut vocal cengkok", "ornamental dangdut melisma", "punchy kendang fills");
  if (tempo > 0) add(\`${tempo} BPM\`);
  add("crystal-clear lead vocal", "bright warm full-bodied vocal", "clean controlled vibrato", "tasteful melisma and cengkok", "punchy clean low end", "clear separated mids", "open non-harsh highs", "modern polished commercial mix");`, "style positives");

replace(`  if (!/dangdut/.test(s)) negative.add("dangdut");
  if (instrumental) negative.add("lead vocals and lyrics");`,
`  if (!/dangdut/.test(s)) negative.add("dangdut");
  if (!/qasidah|sholawat|selawat|religi|islami|islamic/.test(s)) {
    negative.add("qasidah devotional music");
    negative.add("Islamic devotional chant");
    negative.add("rebana/frame-drum ensemble");
  }
  if (!/dangdut/.test(s)) {
    negative.add("dangdut kendang groove");
    negative.add("dangdut cengkok vocals");
  }
  negative.add("generic band arrangement");
  negative.add("straight pop band");
  negative.add("rock band");
  negative.add("flat band-style vocals");
  if (instrumental) negative.add("lead vocals and lyrics");`, "style negatives");

replace(`  const vocalId = String(body.vocal_id || "").trim();
  const styleTokens = requestedStyleTokens(rawStyle, tempo, instrumental);`,
`  const vocalId = String(body.vocal_id || "").trim();
  const lyrics = String(body.lyrics || "");
  const hasArabicLyrics = /[\\u0600-\\u06FF]/.test(lyrics);
  const styleTokens = requestedStyleTokens(rawStyle, tempo, instrumental);`, "arabic detection");

replace(`    "VOCAL EXPRESSION: natural confident singing with beautiful melodic dangdut-style cengkok and tasteful melisma/vibrato where appropriate. Cengkok decorates sustained vowels and never obscures lyric words. Vocal is merdu, lantang, terang, emotional and controlled, never harsh.",
    "QASIDAH/SHOLAWAT LOCK: if qasidah, sholawat, religi or Islami is requested, the Islamic devotional identity must be obvious and deep in the melody, phrasing, ornamentation, cadence and atmosphere. Do not turn it into generic pop or unrelated dance music.",
    "DANGDUT SHOLAWAT LOCK: if dangdut + sholawat/religi is requested, keep strong dangdut groove, kendang-style accents, bass/kick drive, fills and melodic ornaments while the sholawat melodic identity stays prominent. If slow is requested, remain slow and devotional.",`,
`    "VOCAL EXPRESSION LOCK: do not sing with a flat band-style pop delivery. Use authentic dangdut vocal cengkok, ornamental turns, controlled melisma and expressive vibrato; phrases must rise and fall naturally, with strong sustained notes and tasteful vocal answers. Cengkok decorates vowels but never hides consonants or lyric words. Vocal is merdu, lantang, terang, emotional and controlled.",
    "QASIDAH/SHOLAWAT LOCK: when qasidah, sholawat, religi or Islami is requested, make the devotional identity unmistakable in melody, cadence, ornamentation and atmosphere: qasidah melodic movement, Arabic/Islamic phrasing, rebana/frame-drum colors and reverent call-and-response feeling. Never default to a generic pop/rock band.",
    "DANGDUT SHOLAWAT LOCK: when dangdut + sholawat/religi is requested, the rhythm must unmistakably sound dangdut: kendang-led groove, syncopated dangdut bass, punchy kick, fills and rhythmic breaks, with the sholawat/qasidah melody remaining the emotional center. If slow is requested, keep the dangdut-sholawat identity slow, deep and devotional rather than turning into a pop ballad.",
    hasArabicLyrics ? "ARABIC LYRIC DICTION LOCK: sing every supplied Arabic word exactly and in order. Preserve word boundaries and supplied spelling; use clear Arabic makhraj, distinct consonants, accurate vowels, clean syllable timing and audible word endings. Never transliterate, translate, replace, merge, invent or blur Arabic words into Indonesian-sounding phonemes." : "",`, "premium vocal locks");

replace(`function enforceElevenPlan(plan: any, body: Record<string, unknown>) {`,
`function normalizeElevenCompositionPlan(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const { music_length_ms: _musicLengthMs, model_id: _modelId, prompt: _prompt, ...cleanPlan } = plan;
  return cleanPlan;
}

function enforceElevenPlan(plan: any, body: Record<string, unknown>) {`, "plan sanitizer");

replace(`  const lyrics = String(body.lyrics || "").trim();
  const lines = instrumental ? [] : lyrics.split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
  const chunks = plan.chunks.map((chunk: any, index: number) => {`,
`  const lyrics = String(body.lyrics || "").trim();
  const hasArabicLyrics = /[\\u0600-\\u06FF]/.test(lyrics);
  const lines = instrumental ? [] : lyrics.split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
  const chunks = plan.chunks.map((chunk: any, index: number) => {`, "plan arabic detection");

replace(`    const mergedPositive = [...locks.positive.slice(0, index === 0 ? 16 : 10), ...positive].filter((v, i, a) => a.indexOf(v) === i).slice(0, 50);
    const mergedNegative = [...locks.negative, ...negative].filter((v, i, a) => a.indexOf(v) === i).slice(0, 50);`,
`    const arabicPositive = hasArabicLyrics ? ["clear Arabic diction", "accurate Arabic makhraj", "distinct Arabic consonants and vowels", "audible Arabic word endings"] : [];
    const arabicNegative = hasArabicLyrics ? ["mumbled Arabic", "blurred Arabic syllables", "mispronounced Arabic", "foreign-language drift"] : [];
    const mergedPositive = [...locks.positive.slice(0, index === 0 ? 16 : 10), ...arabicPositive, ...positive].filter((v, i, a) => a.indexOf(v) === i).slice(0, 50);
    const mergedNegative = [...locks.negative, ...arabicNegative, ...negative].filter((v, i, a) => a.indexOf(v) === i).slice(0, 50);`, "plan locks");

replace(`  const compositionPlan = planResponse.ok && Array.isArray(planData?.chunks) ? enforceElevenPlan(planData, body) : null;`,
`  const compositionPlan = planResponse.ok && Array.isArray(planData?.chunks) ? normalizeElevenCompositionPlan(enforceElevenPlan(planData, body)) : null;`, "compose plan");

writeFileSync(file, s);
console.log("SALVIAN: Eleven Music 2.5 style/vocal/Arabic locks patched before build");
