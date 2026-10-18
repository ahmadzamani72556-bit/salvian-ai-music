const fs = require("fs");
const path = require("path");

// SALVIAN AI MUSIC is a feature workspace, not a separate login application.
// Authentication remains silent so the future SALVIAN AI parent can provide the
// account session and central credit identity. The Music workspace itself must
// never expose a login/account-entry flow.
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

const musicStudio = path.join(process.cwd(), "components", "premium-music-studio.tsx");
if (fs.existsSync(musicStudio)) {
  let source = fs.readFileSync(musicStudio, "utf8");

  // MUSIC_NO_LOGIN_FLOW: remove the old Music-side login/account UI permanently
  // at build time while retaining silent parent-session authentication for the
  // central credit/library APIs.
  if (!source.includes("MUSIC_NO_LOGIN_FLOW")) {
    source = source.replace(/\n\s*LogIn,?/g, "");
    source = source.replace(/\n\s*UserRound,?/g, "");
    source = source.replace(/\n\s*const \[userName, setUserName\] = useState\(""\);/g, "");
    source = source.replace(/\n\s*setUserName\(\(user as \{ name\?: string \}\)\.name \|\| user\.email \|\| "Creator"\);/g, "");

    source = source.replace(/, \["account", "Akun", UserRound\]/g, "");
    source = source.replace(/\s*<button onClick=\{\(\) => setActive\("account"\)\} className="grid h-10 w-10[^]*?<\/button>/, "");

    source = source.replace(/setNotice\("Silakan login melalui Akun SALVIAN AI terlebih dahulu\."\);/g, "setNotice(\"Sesi akun induk SALVIAN AI belum tersedia. Workspace Musik tidak memiliki login sendiri.\");");
    source = source.replace(/setNotice\("Akun belum tersinkron\. Silakan tunggu sebentar atau buka Akun\."\);/g, "setNotice(\"Sesi akun induk SALVIAN AI belum tersedia. Workspace Musik tidak memiliki login sendiri.\");");
    source = source.replace(/setActive\("account"\); return;/g, "return;");
    source = source.replace(/\{active === "account" && <section[\s\S]*?<\/section>\}/, "");

    source = source.replace(/<button onClick=\{\(\) => setActive\("account"\)\} className="p-2 text-zinc-400"><UserRound size=\{20\} \/><span className="block text-\[9px\]">Akun<\/span><\/button>/, "");

    source = source.replace(/\n\s*\/\/ MUSIC_NO_LOGIN_FLOW:LOGIN_UI_REMOVED/g, "");
    source = source.replace(/(export default function PremiumMusicStudio\(\) \{)/, "$1\n  // MUSIC_NO_LOGIN_FLOW");
    fs.writeFileSync(musicStudio, source);
}

// Remove the obsolete Music-side account bridge if an older checkout still has it.
const layout = path.join(process.cwd(), "app", "layout.tsx");
if (fs.existsSync(layout)) {
  let source = fs.readFileSync(layout, "utf8");
  source = source.replace(/import AccountEntryBridge from "\.\.\/components\/account-entry-bridge";\n?/g, "");
  source = source.replace(/\n\s*<AccountEntryBridge \/>/g, "");
  fs.writeFileSync(layout, source);
}

// Music central credit/profile setup remains server-side and silent.
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

console.log("SALVIAN AI MUSIC: silent parent-session auth retained; Music-side login/account flow removed");
