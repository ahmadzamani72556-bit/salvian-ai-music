const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
let s = fs.readFileSync(file, "utf8");

// NeonJS unified client + Better Auth adapter.
s = s.replace(
  'import { createClient } from "@neondatabase/neon-js";',
  'import { createClient, BetterAuthVanillaAdapter } from "@neondatabase/neon-js";'
);
s = s.replace(
  'const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });',
  'const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });'
);

// IMPORTANT: neon-js 0.7 exposes getJWTToken() on the auth client.
// Do not rename it to getJwtToken().

s = s.replace(
  'const openCreator = () => { window.location.href = "https://salvian-ai-creator.vercel.app/akun.html"; };',
  'const openCreator = () => { window.location.href = "https://salvian-ai-creator.vercel.app/akun.html?from=music"; };'
);

// Ignore stale concurrent auth/balance responses. pageshow + focus can fire close
// together on mobile browsers, and an older response must never overwrite a newer balance.
s = s.replace(
  'const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });',
  'const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });\nlet syncGeneration = 0;'
);

const syncStart = s.indexOf("  const syncSession = async () => {");
const syncEnd = s.indexOf("\n\n  useEffect", syncStart);
if (syncStart !== -1 && syncEnd !== -1) {
  const syncSession = `  const syncSession = async () => {
    const syncId = ++syncGeneration;
    const session = await neon.auth.getSession();
    const user = session?.data?.user;
    if (!user) {
      if (syncId !== syncGeneration) return false;
      setToken(null);
      setCredits(null);
      setUserName("");
      setUserEmail("");
      return false;
    }

    if (syncId !== syncGeneration) return false;
    setUserName((user as { name?: string }).name || "");
    setUserEmail(user.email || "");

    let jwt: string | null = null;
    try {
      const authWithJwt = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
      if (typeof authWithJwt.getJWTToken === "function") {
        jwt = await authWithJwt.getJWTToken(false);
      }
    } catch (error) {
      console.warn("SALVIAN JWT SDK", error);
    }

    if (!jwt) {
      try {
        const sessionRes = await fetch(AUTH + "/get-session", { credentials: "include", cache: "no-store" });
        const headerJwt = sessionRes.headers.get("set-auth-jwt");
        if (headerJwt) jwt = headerJwt;
      } catch (error) {
        console.warn("SALVIAN JWT HEADER", error);
      }
    }

    if (!jwt) {
      if (syncId !== syncGeneration) return false;
      setToken(null);
      setCredits(null);
      setNotice("Akun ditemukan, tetapi token layanan belum tersedia. Muat ulang halaman sekali.");
      return false;
    }

    if (syncId !== syncGeneration) return false;
    setToken(jwt);
    const [balanceRes] = await Promise.all([
      fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + jwt }, body: JSON.stringify({ action: "balance" }) }),
      loadLibrary(jwt, true),
    ]);
    const data = await balanceRes.json().catch(() => ({}));
    if (syncId !== syncGeneration) return false;
    if (balanceRes.ok) {
      setPlan(data.plan || "FREE");
      setCredits(Number(data.credits));
    } else {
      setCredits(null);
      setNotice(data.error || "Gagal membaca saldo kredit akun.");
    }
    return true;
  };`;
  s = s.slice(0, syncStart) + syncSession + s.slice(syncEnd);
}

const oldEffect = `  useEffect(() => {
    (async () => {
      try { await syncSession(); }
      catch (error) { console.error("SALVIAN AUTH INIT", error); }
    })();
  }, []);`;

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

s = s.replace(oldEffect, newEffect);

const start = s.indexOf("  const renderProfile = () =>");
const end = s.indexOf("\n\n  return <main", start);
if (start !== -1 && end !== -1) {
  const profile = `  const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">{userName || "Akun SALVIAN AI"}</h1><p className="text-sm text-zinc-500">{userEmail || "Akun belum aktif"}</p></div></div>{!token ? <div className="mt-6 space-y-3"><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Akun Music mengikuti akun induk SALVIAN AI CREATOR. Daftar atau masuk hanya dilakukan di akun induk.</div><button onClick={openCreator} className="flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black">Daftar / Masuk Akun SALVIAN AI CREATOR</button></div> : <><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Status</div><div className="mt-1 font-bold text-emerald-300">✓ Aktif</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Paket</div><div className="mt-1 font-bold">{plan}</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Kredit</div><div className="mt-1 font-bold">{credits === null ? "Memuat…" : credits.toLocaleString("id-ID")}</div></div></div><button onClick={openCreator} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200">Kelola Akun Induk &amp; Kredit</button></>}</div>{notice && <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{notice}</div>}</section>;`;
  s = s.slice(0, start) + profile + s.slice(end);
}

// The active Music Studio lives in components/premium-music-studio.tsx.
// Keep its parent-account JWT request in explicit authenticated mode when this
// build patch runs, so returning from Creator never falls back to an anonymous token.
const musicFile = path.join(process.cwd(), "components", "premium-music-studio.tsx");
if (fs.existsSync(musicFile)) {
  let music = fs.readFileSync(musicFile, "utf8");
  music = music.replace('jwt = await auth.getJWTToken?.();', 'jwt = await auth.getJWTToken?.(false);');
  fs.writeFileSync(musicFile, music);
}

fs.writeFileSync(file, s);
console.log("SALVIAN central account patch applied");
