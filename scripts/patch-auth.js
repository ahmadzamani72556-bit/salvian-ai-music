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

const oldLogin = /  const signInMusic = async \(\) => \{[\s\S]*?\n  \};\n\n  const helpLyrics/;
const newLogin = `  const signInMusic = async () => {
    if (!authName.trim() || !authEmail.trim() || !authPassword) {
      setNotice("Lengkapi nama, alamat Gmail, dan password akun SALVIAN AI CREATOR.");
      return;
    }
    setAuthBusy(true); setNotice("Memproses login akun SALVIAN AI…");
    try {
      const authClient = neon.auth as unknown as { signIn?: { email?: (input: { email: string; password: string }) => Promise<{ data?: unknown; error?: { message?: string } | null }> } };
      if (!authClient.signIn?.email) throw new Error("Metode login Neon Auth belum tersedia pada versi SDK ini.");
      const result = await authClient.signIn.email({ email: authEmail.trim(), password: authPassword });
      if (result?.error) throw new Error(result.error.message || "Login gagal. Periksa email dan password.");
      const ok = await syncSession();
      if (!ok) throw new Error("Login berhasil, tetapi sesi belum terbaca. Silakan muat ulang halaman sekali.");
      setAuthPassword("");
      setNotice("Login berhasil. Akun SALVIAN AI MUSIC sekarang terhubung ke akun Creator yang sama.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Login gagal."); }
    finally { setAuthBusy(false); }
  };

  const helpLyrics`;
if (!oldLogin.test(s)) throw new Error("signInMusic block not found");
s = s.replace(oldLogin, newLogin);

const oldProfile = /const renderProfile = \(\) => <section><div className="card p-6">[\s\S]*?Buka Akun SALVIAN AI CREATOR<\/button><\/div> :/;
const profileReplacement = `const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">{userName || "SALVIAN AI"}</h1><p className="text-sm text-zinc-500">{userEmail || "Belum login"}</p></div></div>{!token ? <div className="mt-6 space-y-3"><p className="text-sm text-zinc-400">Login di sini menggunakan akun yang sama dengan SALVIAN AI CREATOR. Masukkan nama, alamat Gmail, dan password akun Creator Anda.</p><label className="block text-xs font-semibold text-zinc-400">Nama</label><input value={authName} onChange={e=>setAuthName(e.target.value)} type="text" placeholder="Nama akun Creator" autoComplete="name" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><label className="block text-xs font-semibold text-zinc-400">Alamat Gmail</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} type="email" placeholder="Alamat Gmail akun Creator" autoComplete="email" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><label className="block text-xs font-semibold text-zinc-400">Password</label><input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} type="password" placeholder="Password akun Creator" autoComplete="current-password" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><button onClick={signInMusic} disabled={authBusy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black disabled:opacity-60"><LogIn size={17}/>{authBusy ? "Memproses…" : "Masuk ke SALVIAN AI MUSIC"}</button><button onClick={openCreator} className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200">Buka Akun SALVIAN AI CREATOR</button></div> :`;
if (!oldProfile.test(s)) throw new Error("renderProfile block not found");
s = s.replace(oldProfile, profileReplacement);

fs.writeFileSync(file, s);
console.log("SALVIAN auth patch applied");
