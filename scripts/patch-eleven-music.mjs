import { readFileSync, writeFileSync } from "node:fs";

const file = "app/api/music/route.ts";
let source = readFileSync(file, "utf8");

// This runs before next build. It is deliberately idempotent and syntax-safe.
// The route already contains the main style/vocal hardening; this build guard only
// fixes Eleven Music v2.5 plan-mode request compatibility.
const oldRequest = 'const requestBody: Record<string, unknown> = { model_id: "music_v2_5", force_instrumental: body.instrumental === true, store_for_inpainting: false };';
const newRequest = 'const requestBody: Record<string, unknown> = { model_id: "music_v2_5", store_for_inpainting: false };';
if (source.includes(oldRequest)) source = source.replace(oldRequest, newRequest);

const oldNormalize = `function normalizeElevenCompositionPlan(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const { music_length_ms: _musicLengthMs, model_id: _modelId, prompt: _prompt, ...cleanPlan } = plan;
  return cleanPlan;
}`;
const newNormalize = `function normalizeElevenCompositionPlan(plan: any) {
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
}`;
if (source.includes(oldNormalize)) source = source.replace(oldNormalize, newNormalize);

writeFileSync(file, source);
console.log("SALVIAN: Music 2.5 build guard applied");
