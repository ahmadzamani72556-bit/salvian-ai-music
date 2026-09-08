const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
let s = fs.readFileSync(file, "utf8");

if (!s.includes("BetterAuthVanillaAdapter")) {
  s = s.replace(
    'import { createClient } from "@neondatabase/neon-js";',
    'import { createClient, BetterAuthVanillaAdapter } from "@neondatabase/neon-js";'
  );
}

s = s.replace(
  'const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });',
  'const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });'
);

// Neon Auth exposes getJwtToken() (lowercase wt), not getJWTToken().
s = s.replace(/getJWTToken/g, "getJwtToken");

// Creator is the single account hub. Always mark navigation from Music.
s = s.replace(
  'const openCreator = () => { window.location.href = "https://salvian-ai-creator.vercel.app/akun.html"; };',
  'const openCreator = () => { window.location.href = "https://salvian-ai-creator.vercel.app/akun.html?from=music"; };'
);

// Keep the same account/session in Music after returning from Creator via back/forward.
const oldEffect = /  useEffect\(\(\) => \{\n    \(async \(\) => \{\n      try \{ await syncSession\(\); \}\n      catch \(error\) \{ console\.error\("SALVIAN AUTH INIT", error\); \}\n    \}\)\(\);\n  \}, \[\]\);/;
const newEffect = `  useEffect(() => {
    (async () => {
      try { await syncSession(); }
      catch (error) { console.error("SALVIAN AUTH INIT", error); }
    })();
    const resync = () => { syncSession().catch(error => console.error("SALVIAN AUTH RESYNC", error)); };
    window.addEventListener("pageshow", resync);
    window.addEventListener("focus", resync);
    return () => {
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);`;
if (oldEffect.test(s)) s = s.replace(oldEffect, newEffect);

// Account UI in Music is status-only. Registration/login happens in the central Creator account hub.
const oldProfile = /const renderProfile = \(\) => <section><div className="card p-6">[\s\S]*?Buka Akun SALVIAN AI CREATOR<\/button><\/div> :/;
const profileReplacement = `const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">{userName || "Akun SALVIAN AI"}</h1><p className="text-sm text-zinc-500">{userEmail || "Akun belum aktif"}</p></div></div>{!token ? <div className="mt-6 space-y-3"><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Akun Music mengikuti akun induk SALVIAN AI CREATOR. Daftar atau masuk hanya dilakukan di akun induk.</div><button onClick={openCreator} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black">Daftar / Masuk Akun SALVIAN AI CREATOR</button></div> : <><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Status</div><div className="mt-1 font-bold text-emerald-300">✓ Aktif</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Paket</div><div className="mt-1 font-bold">{plan}</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Kredit</div><div className="mt-1 font-bold">{credits === null ? "—" : credits.toLocaleString("id-ID")}</div></div></div><button onClick={openCreator} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200">Kelola Akun Induk &amp; Kredit</button></>}</div>{notice && <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{notice}</div>}</section>`;
if (oldProfile.test(s)) s = s.replace(oldProfile, profileReplacement);

fs.writeFileSync(file, s);
console.log("SALVIAN auth/account hub patch applied");
