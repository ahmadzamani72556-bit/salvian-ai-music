import fs from "node:fs";
import path from "node:path";

const file = path.resolve("app/api/music/route.ts");
const source = fs.readFileSync(file, "utf8");

const anchor = '    "Follow the user\'s requested genre, culture, era, rhythm, instruments, mood, vocal character and production details literally. If several styles are requested, preserve the requested blend instead of choosing a generic alternative. Do not copy protected lyrics or claim to reproduce an artist identity.",';

const enhanced = `    "Follow the user's requested genre, culture, era, rhythm, instruments, mood, vocal character and production details literally. If several styles are requested, preserve the requested blend instead of choosing a generic alternative. Do not copy protected lyrics or claim to reproduce an artist identity.",
    "REFERENCE MUSIC — HIGHEST MUSICAL PRIORITY: when an audio reference is active, first lock onto its rhythmic feel, groove, beat pattern, tempo relationship, melodic contour, harmonic movement, section flow, instrumental roles, fills, transitions, dynamics and overall musical character. The reference determines HOW the music moves; do not replace it with a generic genre template.",
    "GENRE + CONCEPT — SECOND LAYER: use the user's typed music concept to strengthen and clarify the reference. If the user says dangdut, make the dangdut character unmistakable; if remix, make the remix arrangement and transitions purposeful; if slow, preserve the intended slow emotional pacing; if Melayu, Timur, Minang or another style is requested, use its appropriate musical language. Never force dangdut, remix, slow or any other genre when the user did not request it or the reference does not support it.",
    "DANGDUT RHYTHM: when dangdut is requested or clearly present in the reference, make the groove authentic and musical with tight rhythmic interplay, characteristic drum/kendang patterns, bass movement, syncopation, fills, accents and section transitions. Keep the beat danceable and coherent instead of using a generic four-on-the-floor pattern.",
    "REMIX QUALITY: when remix is requested, preserve the reference's musical identity while adding intentional remix energy: clean intro/outro, rhythmic builds, tasteful fills, drops or lifts where musically appropriate, transitions that land on the beat, variation between sections and a memorable hook. Do not turn every song into the same EDM pattern.",
    "MELODY & ARRANGEMENT: preserve the reference melody contour and musical phrasing where possible while building an original arrangement around the user's lyrics. Develop a memorable hook, supporting harmony, counter-melody and instrumental responses only when they fit the requested concept. Avoid clutter that masks the vocal.",
    "TREND-QUALITY PRODUCTION: aim for a polished contemporary commercial result with a strong opening hook, clear rhythmic identity, memorable chorus, satisfying section contrast, controlled low end, clean transients, balanced instruments and a professional stereo image. Use current popular-production qualities as a quality target, not as a reason to overwrite the user's requested style or reference.",
    "NO STYLE DRIFT: never silently reinterpret the request as generic pop, generic remix, generic dangdut or another preset. The audio reference supplies the musical behavior and the user's written concept supplies the desired style/details; combine both instead of choosing one and discarding the other.",
    "VOCAL QUALITY — PRIORITY: when vocals are requested, produce a polished, clear, warm, natural and emotionally engaging lead vocal. Aim for a clean, transparent and present recording with controlled dynamics, natural breath, accurate pitch, smooth transitions, pleasant resonance and no muddy, harsh, metallic or robotic character.",
    "VOCAL EXPRESSION: make the singing expressive and human. Use natural phrasing, tasteful vibrato, controlled sustain, dynamic rises and falls, emotional emphasis and genre-appropriate ornamentation. Avoid flat, lifeless or mechanically repeated delivery.",
    "CENGKOK / ORNAMENTATION: when the requested genre or reference contains cengkok, lenggok, melisma, slides, grace notes or ornamental turns, follow that musical language naturally and beautifully. Keep ornaments synchronized with the melody and rhythm; do not add random vocal runs that conflict with the reference or the user's concept.",
    "REFERENCE VOCAL ADHERENCE: when an audio reference is active, preserve its vocal melody contour, phrasing, timing, cadence, expressive character and ornamentation as strongly as the model permits, while singing the user's supplied lyrics. Do not replace the reference-led vocal approach with a generic pop vocal.",
    "LYRIC DELIVERY: sing the supplied lyrics exactly as provided. Prioritize correct word order, pronunciation, syllable placement and natural lyric-to-melody alignment. Never substitute, invent, skip or paraphrase lyric lines merely to make the melody easier.",
    "VOCAL MIX: keep the lead vocal intelligible and forward without overpowering the requested instruments. Use tasteful room/reverb and delay only when appropriate to the user's style. Avoid excessive effects, clipping, audible pumping, distracting sibilance and artificial tuning artifacts.",`;

const marker = '    "REFERENCE MUSIC — HIGHEST MUSICAL PRIORITY:';
if (source.includes(marker)) {
  console.log("Mureka music-reference and vocal directives already enhanced; no change needed.");
  process.exit(0);
}

if (!source.includes(anchor)) {
  throw new Error("Mureka directive anchor not found; refusing to modify route.ts blindly.");
}

fs.writeFileSync(file, source.replace(anchor, enhanced), "utf8");
console.log("Enhanced Mureka music-reference, rhythm, genre, melody and vocal directives applied.");
