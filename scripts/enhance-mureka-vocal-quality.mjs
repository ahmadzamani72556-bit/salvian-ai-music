import fs from "node:fs";
import path from "node:path";

const file = path.resolve("app/api/music/route.ts");
const source = fs.readFileSync(file, "utf8");

const anchor = '    "Follow the user\'s requested genre, culture, era, rhythm, instruments, mood, vocal character and production details literally. If several styles are requested, preserve the requested blend instead of choosing a generic alternative. Do not copy protected lyrics or claim to reproduce an artist identity.",';

const enhanced = `    "Follow the user's requested genre, culture, era, rhythm, instruments, mood, vocal character and production details literally. If several styles are requested, preserve the requested blend instead of choosing a generic alternative. Do not copy protected lyrics or claim to reproduce an artist identity.",
    "VOCAL QUALITY — PRIORITY: when vocals are requested, produce a polished, clear, warm, natural and emotionally engaging lead vocal. Aim for a clean, transparent and present recording with controlled dynamics, natural breath, accurate pitch, smooth transitions, pleasant resonance and no muddy, harsh, metallic or robotic character.",
    "VOCAL EXPRESSION: make the singing expressive and human. Use natural phrasing, tasteful vibrato, controlled sustain, dynamic rises and falls, emotional emphasis and genre-appropriate ornamentation. Avoid flat, lifeless or mechanically repeated delivery.",
    "CENGKOK / ORNAMENTATION: when the requested genre or reference contains cengkok, lenggok, melisma, slides, grace notes or ornamental turns, follow that musical language naturally and beautifully. Keep ornaments synchronized with the melody and rhythm; do not add random vocal runs that conflict with the reference or the user's concept.",
    "REFERENCE VOCAL ADHERENCE: when an audio reference is active, preserve its vocal melody contour, phrasing, timing, cadence, expressive character and ornamentation as strongly as the model permits, while singing the user's supplied lyrics. Do not replace the reference-led vocal approach with a generic pop vocal.",
    "LYRIC DELIVERY: sing the supplied lyrics exactly as provided. Prioritize correct word order, pronunciation, syllable placement and natural lyric-to-melody alignment. Never substitute, invent, skip or paraphrase lyric lines merely to make the melody easier.",
    "VOCAL MIX: keep the lead vocal intelligible and forward without overpowering the requested instruments. Use tasteful room/reverb and delay only when appropriate to the user's style. Avoid excessive effects, clipping, audible pumping, distracting sibilance and artificial tuning artifacts.",`;

if (source.includes(enhanced)) {
  console.log("Mureka vocal quality directive already enhanced; no change needed.");
  process.exit(0);
}

if (!source.includes(anchor)) {
  throw new Error("Mureka directive anchor not found; refusing to modify route.ts blindly.");
}

fs.writeFileSync(file, source.replace(anchor, enhanced), "utf8");
console.log("Enhanced Mureka vocal quality directive applied.");
