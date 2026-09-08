const fs = require("fs");
const path = require("path");

// SALVIAN AI MUSIC uses the real SALVIAN AI CREATOR parent account.
// This build-time patch only touches Music-side client files; Creator and Video
// are separate applications and are never modified here.
const targets = [
  path.join(process.cwd(), "components", "premium-music-studio.tsx"),
  path.join(process.cwd(), "components", "generation-monitor-v3.tsx"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, "utf8");

  // neon-js supports an allowAnonymous argument. Music must explicitly request
  // an authenticated parent-account JWT so an anonymous token can never be
  // selected after returning from the Creator account page.
  source = source.replace(/getJWTToken\?\.\(\)/g, "getJWTToken?.(false)");
  source = source.replace(/getJWTToken\(\)/g, "getJWTToken(false)");

  fs.writeFileSync(file, source);
}

console.log("SALVIAN AI MUSIC parent-account JWT patch applied");
