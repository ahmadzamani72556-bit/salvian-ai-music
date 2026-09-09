const fs = require("fs");
const path = require("path");

// SALVIAN AI MUSIC uses the real SALVIAN AI CREATOR parent account.
// This build-time patch only normalizes Music-side auth and central-credit setup.
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
  source = source.replace(/jwt = await auth\.getJWTToken\?\.\(false\);/g, "jwt = (await auth.getJWTToken?.(false)) ?? null;");
  fs.writeFileSync(file, source);
}

// Music must initialize the same central Creator profile before reading or
// consuming credits. Creator already uses salvian_ensure_profile() for this.
// Inject only if the production route has not already been hardened.
const musicRoute = path.join(process.cwd(), "app", "api", "music", "route.ts");
if (fs.existsSync(musicRoute)) {
  let source = fs.readFileSync(musicRoute, "utf8");
  if (!source.includes("MUSIC_CENTRAL_PROFILE_READY")) {
    source = source.replace(
      'if (action === "balance") {',
      'if (action === "balance") {\n      // MUSIC_CENTRAL_PROFILE_READY\n      const ensured = await rpc(auth, "salvian_ensure_profile");\n      if (!ensured.response.ok) return NextResponse.json({ success: false, error: "Akun pusat belum siap disinkronkan." }, { status: 503 });'
    );
    source = source.replace(
      '    const credit = await consume(auth);',
      '    const ensured = await rpc(auth, "salvian_ensure_profile");\n    if (!ensured.response.ok) return NextResponse.json({ success: false, error: "Akun pusat belum siap disinkronkan." }, { status: 503 });\n\n    const credit = await consume(auth);'
    );
    fs.writeFileSync(musicRoute, source);
  }
}

console.log("SALVIAN AI MUSIC JWT and central-credit build normalization applied");
