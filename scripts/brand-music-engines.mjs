import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function patch(file, replacements) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return;
  let source = fs.readFileSync(target, "utf8");
  for (const [from, to] of replacements) {
    source = source.split(from).join(to);
  }
  fs.writeFileSync(target, source, "utf8");
}

// Keep provider IDs and routing untouched; only replace customer-facing names.
patch("components/premium-music-studio.tsx", [
  ["title: \"Mureka\", subtitle: \"PRO\"", "title: \"Salvian AI\", subtitle: \"PRO\""],
  ["title: \"Eleven Music\", subtitle: \"ELITE\"", "title: \"Salvian AI\", subtitle: \"ELITE\""],
  ["title: \"Suno\", subtitle: \"ULTIMATE\"", "title: \"Salvian AI\", subtitle: \"ULTIMATE\""],
  ["Mesin yang sudah aktif", "Mesin Salvian AI Pro aktif"],
  ["Pilih model Mureka di bawah", "Pilih model musik di bawah"],
  ["Billing: Mureka", "Paket Salvian AI Pro"],
  ["Billing: Eleven Elite", "Paket Salvian AI Elite"],
  ["Billing: Suno Ultimate", "Paket Salvian AI Ultimate"],
  ["\"Music v2.5\"", "\"Model musik Elite\""],
  ["\"Suno v6\"", "\"Model musik Ultimate\""],
  ["\"Mureka auto\"", "\"Mode Standard\""],
  ["\"Mureka 9\"", "\"Mode Pro\""],
  ["\"Mureka 9.5\"", "\"Mode Adroit\""],
  ["${musicEngine} Music", "Salvian AI Music"],
  ["${data.musicEngine || \"Musik\"} selesai dan tersimpan di Library.", "Salvian AI Music selesai dan tersimpan di Library."],
  ["${data.musicEngine || \"Musik\"} berhasil dibuat.", "Salvian AI Music berhasil dibuat."],
]);

patch("components/music-generation-shell.tsx", [
  ["title: \"Mureka\", tier: \"PRO\", defaultModel: \"Mureka\"", "title: \"Salvian AI\", tier: \"PRO\", defaultModel: \"Standard\""],
  ["title: \"Eleven Music\", tier: \"ELITE\", defaultModel: \"Music v2.5\"", "title: \"Salvian AI\", tier: \"ELITE\", defaultModel: \"Elite\""],
  ["title: \"Suno\", tier: \"ULTIMATE\", defaultModel: \"Suno v6\"", "title: \"Salvian AI\", tier: \"ULTIMATE\", defaultModel: \"Ultimate\""],
  ["Model: ${fallback.modelLabel} • ", "Mode: ${fallback.modelLabel} • "],
  ["engineLabel: song.engineLabel || \"Mesin Musik\"", "engineLabel: \"Salvian AI\""],
  ["Mesin musik", "Salvian AI Music"],
]);

// v2.5/Suno need a structured style lock, not only a natural-language reminder.
// Eleven's composition-plan docs explicitly make positive_styles/negative_styles
// the main genre controls, with the first chunk setting the overall genre.
patch("app/api/music/route.ts", [
  [
    "function buildPremiumMusicDirective(body: Record<string, unknown>) {",
    `function buildHardStyleConstraints(rawStyle: string) {
  const s = rawStyle.toLowerCase();
  const has = (...terms: string[]) => terms.some(term => s.includes(term));
  const qasidah = has("qasidah", "qosidah", "sholawat", "shalawat", "religi", "islami", "islamic", "nasheed", "nasyid");
  const dangdut = has("dangdut", "dangdut remix", "dangdut koplo", "koplo");
  const dj = has("dj", "edm", "electronic dance", "house", "techno", "trance");
  const pop = has("pop", "pop ballad", "pop melayu");
  const rock = has("rock", "slow rock");
  const reggae = has("reggae");
  const slow = has("slow", "lambat", "ballad");

  const positive: string[] = [];
  const negative: string[] = [];
  if (qasidah) positive.push("deep devotional Islamic qasidah melody", "sholawat religious melodic phrasing", "reverent spiritual atmosphere", "Arabic-influenced melodic ornaments", "expressive sustained vocal melisma");
  if (dangdut) positive.push("Indonesian dangdut groove", "kendang-style percussion accents", "dangdut bass groove", "melodic dangdut vocal cengkok");
  if (dj) positive.push("DJ/electronic dance production", "driving electronic rhythm");
  if (pop) positive.push("pop song structure and melodic polish");
  if (rock) positive.push("rock instrumentation and rhythmic drive");
  if (reggae) positive.push("reggae offbeat groove and bass feel");
  if (slow) positive.push("slow devotional pacing", "restrained tempo", "smooth spacious phrasing");
  if (!qasidah && !dangdut && !dj && !pop && !rock && !reggae) positive.push("follow the user's exact requested genre and musical concept");

  if (qasidah && !pop) negative.push("generic pop", "mainstream pop", "EDM", "DJ", "house", "techno", "trance", "generic electronic music");
  if (dangdut && !dj) negative.push("DJ remix", "EDM", "house", "techno", "trance");
  if (!dangdut && !rock) negative.push("dangdut", "koplo");
  if (!dj) negative.push("electronic dance music", "EDM", "DJ club beat");
  if (!rock) negative.push("rock");
  if (!reggae) negative.push("reggae");
  if (!pop && !qasidah) negative.push("generic pop");
  if (slow) negative.push("fast tempo", "high-speed dance beat");

  const prompt = [
    `HARD STYLE TARGET: ${rawStyle || "follow the user's exact concept"}.`,
    positive.length ? `MANDATORY POSITIVE STYLE: ${positive.join("; ")}.` : "",
    negative.length ? `MANDATORY NEGATIVE STYLE: ${Array.from(new Set(negative)).join("; ")}.` : "",
    "Never silently replace the requested dominant genre with another genre.",
  ].filter(Boolean).join(" ");
  return { positive: Array.from(new Set(positive)), negative: Array.from(new Set(negative)), prompt };
}

function buildPremiumMusicDirective(body: Record<string, unknown>) {`,
  ],
  [
    "  const vocalId = String(body.vocal_id || \"\").trim();",
    "  const vocalId = String(body.vocal_id || \"\").trim();\n  const hardStyle = buildHardStyleConstraints(rawStyle);",
  ],
  [
    "    \"STYLE LOCK: every explicit genre, rhythm, mood, cultural/religious character, remix type and production term requested by the user is mandatory. Never substitute a different dominant genre.\",",
    "    \"STYLE LOCK: every explicit genre, rhythm, mood, cultural/religious character, remix type and production term requested by the user is mandatory. Never substitute a different dominant genre.\",\n    hardStyle.prompt,",
  ],
  [
    "    compositionPlan.chunks = compositionPlan.chunks.map((chunk: any) => ({ ...chunk, context_adherence: \"high\" }));",
    `    const hardStyle = buildHardStyleConstraints(String(body.style || ""));
    compositionPlan.chunks = compositionPlan.chunks.map((chunk: any, index: number) => {
      const existingPositive = Array.isArray(chunk.positive_styles) ? chunk.positive_styles : [];
      const existingNegative = Array.isArray(chunk.negative_styles) ? chunk.negative_styles : [];
      const filteredPositive = existingPositive.filter((item: unknown) => {
        const text = String(item).toLowerCase();
        return !hardStyle.negative.some((bad: string) => text.includes(bad.toLowerCase()));
      });
      const positive = Array.from(new Set([...hardStyle.positive, ...filteredPositive])).slice(0, 50);
      const negative = Array.from(new Set([...existingNegative, ...hardStyle.negative])).slice(0, 50);
      return { ...chunk, positive_styles: positive, negative_styles: negative, context_adherence: "high" };
    });
    // The first chunk establishes the overall genre for Music v2.5, so make its lock strongest.
    if (compositionPlan.chunks.length) {
      const first = compositionPlan.chunks[0];
      compositionPlan.chunks[0] = { ...first, positive_styles: Array.from(new Set([...(first.positive_styles || []), ...hardStyle.positive, "strict genre adherence", "clear bright vocal presence"])).slice(0, 50), negative_styles: Array.from(new Set([...(first.negative_styles || []), ...hardStyle.negative])).slice(0, 50), condition_strength: first.conditioning_ref ? "xhigh" : first.condition_strength };
    }`,
  ],
  [
    "    const conditioningIds = [body.reference_id, body.vocal_id].filter((value): value is string => typeof value === \"string\" && Boolean(value.trim()));",
    "    const conditioningIds = [body.reference_id].filter((value): value is string => typeof value === \"string\" && Boolean(value.trim()));",
  ],
  [
    "      compositionPlan.chunks[0] = { ...compositionPlan.chunks[0], conditioning_ref: { song_id: String(conditioningIds[0]), range: { start_ms: 0, end_ms: 30000 } }, condition_strength: \"high\" };",
    "      compositionPlan.chunks[0] = { ...compositionPlan.chunks[0], conditioning_ref: { song_id: String(conditioningIds[0]), range: { start_ms: 0, end_ms: 30000 } }, condition_strength: \"xhigh\" };",
  ],
]);
