const fs = require("fs");
const path = require("path");

// SALVIAN AI MUSIC uses the real SALVIAN AI CREATOR parent account.
// This build-time patch only normalizes Music-side JWT calls.
// Creator and Video are separate applications and are never modified here.
const targets = [
  path.join(process.cwd(), "components", "premium-music-studio.tsx"),
  path.join(process.cwd(), "components", "generation-monitor-v3.tsx"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, "utf8");
  source = source.replace(/getJWTToken\?\.\(\)/g, "getJWTToken?.(false)");
  source = source.replace(/getJWTToken\(\)/g, "getJWTToken(false)");
  fs.writeFileSync(file, source);
}

console.log("SALVIAN AI MUSIC JWT build normalization applied");
