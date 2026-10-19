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
// Music-engine behavior is defined directly in app/api/music/route.ts so the
// build step must not inject a second copy of the v2.5/Suno directive logic.
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
