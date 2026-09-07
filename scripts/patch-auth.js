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

if (!s.includes("const [authName, setAuthName]")) {
  s = s.replace(
    'const [authEmail, setAuthEmail] = useState("");\n  const [authPassword, setAuthPassword] = useState("");',
    'const [authName, setAuthName] = useState("");\n  const [authEmail, setAuthEmail] = useState("");\n  const [authPassword, setAuthPassword] = useState("");'
  );
}

s = s.replace(
  'setUserName((user as { name?: string }).name || "");\n    setUserEmail(user.email || "");',
  'setUserName((user as { name?: string }).name || "");\n    setUserEmail(user.email || "");\n    setAuthName((user as { name?: string }).name || "");\n    setAuthEmail(user.email || "");'
);

// Keep signInMusic from app/page.tsx unchanged. It uses the same direct
// Neon Auth /sign-in/email endpoint already used successfully by Creator.
// The previous SDK signIn.email replacement caused HTTP 404 on Music.

const oldProfile = /const renderProfile = \(\) => <section><div className="card p-6">[\s\S]*?Buka Akun SALVIAN AI CREATOR<\/button><\/div> :/;
const profileReplacement = `const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">{userName || "SALVIAN AI"}</h1><p className="text-sm text-zinc-500">{userEmail || "Belum login"}</p></div></div>{!token ? <div className="mt-6 space-y-3"><p className="text-sm text-zinc-400">Login di sini menggunakan akun yang sama dengan SALVIAN AI CREATOR. Masukkan nama, alamat Gmail, dan password akun Creator Anda.</p><label className="block text-xs font-semibold text-zinc-400">Nama</label><input value={authName} onChange={e=>setAuthName(e.target.value)} type="text" placeholder="Nama akun Creator" autoComplete="name" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><label className="block text-xs font-semibold text-zinc-400">Alamat Gmail</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} type="email" placeholder="Alamat Gmail akun Creator" autoComplete="email" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><label className="block text-xs font-semibold text-zinc-400">Password</label><input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} type="password" placeholder="Password akun Creator" autoComplete="current-password" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><button onClick={signInMusic} disabled={authBusy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black disabled:opacity-60"><LogIn size={17}/>{authBusy ? "Memproses…" : "Masuk ke SALVIAN AI MUSIC"}</button><button onClick={openCreator} className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200">Buka Akun SALVIAN AI CREATOR</button></div> :`;
if (!oldProfile.test(s)) throw new Error("renderProfile block not found");
s = s.replace(oldProfile, profileReplacement);

fs.writeFileSync(file, s);
console.log("SALVIAN auth patch applied");
