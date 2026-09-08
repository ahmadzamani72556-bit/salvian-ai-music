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

// Replace the session synchronizer with a robust JWT flow. Some Better Auth
// sessions expose the short-lived JWT through the set-auth-jwt response header
// while getJWTToken() can fail silently in browser cross-origin contexts.
const syncStart = s.indexOf("  const syncSession = async () => {");
const syncEnd = s.indexOf("\n\n  useEffect", syncStart);
if (syncStart !== -1 && syncEnd !== -1) {
  const syncSession = `  const syncSession = async () => {
    const session = await neon.auth.getSession();
    const user = session?.data?.user;
    if (!user) {
      setToken(null);
      setCredits(null);
      setUserName(\"\");
      setUserEmail(\"\");
      return false;
    }

    setUserName((user as { name?: string }).name || \"\");
    setUserEmail(user.email || \"\");

    let jwt: string | null = null;
    try {
      const authWithJwt = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
      if (typeof authWithJwt.getJWTToken === \"function\") {
        jwt = await authWithJwt.getJWTToken(false);
      }
    } catch (error) {
      console.warn(\"SALVIAN JWT SDK\", error);
    }

    // Fallback: Better Auth can return the service JWT in the session response.
    if (!jwt) {
      try {
        const sessionRes = await fetch(\`${AUTH}/get-session\`, { credentials: \"include\", cache: \"no-store\" });
        const headerJwt = sessionRes.headers.get(\"set-auth-jwt\");
        if (headerJwt) jwt = headerJwt;
      } catch (error) {
        console.warn(\"SALVIAN JWT HEADER\", error);
      }
    }

    if (!jwt) {
      setToken(null);
      setCredits(null);
      setNotice(\"Akun ditemukan, tetapi token layanan belum tersedia. Muat ulang halaman sekali.\");
      return false;
    }

    setToken(jwt);
    const [balanceRes] = await Promise.all([
      fetch(\"/api/music\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\", Authorization: \`Bearer \${jwt}\` }, body: JSON.stringify({ action: \"balance\" }) }),
      loadLibrary(jwt, true),
    ]);
    const data = await balanceRes.json().catch(() => ({}));
    if (balanceRes.ok) {
      setPlan(data.plan || \"FREE\");
      setCredits(Number(data.credits || 0));
    } else {
      setCredits(null);
      setNotice(data.error || \"Gagal membaca saldo kredit akun.\");
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
  const profile = `  const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">{userName || "Akun SALVIAN AI"}</h1><p className="text-sm text-zinc-500">{userEmail || "Akun belum aktif"}</p></div></div>{!token ? <div className="mt-6 space-y-3"><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Akun Music mengikuti akun induk SALVIAN AI CREATOR. Daftar atau masuk hanya dilakukan di akun induk.</div><button onClick={openCreator} className="flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black">Daftar / Masuk Akun SALVIAN AI CREATOR</button></div> : <><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Status</div><div className="mt-1 font-bold text-emerald-300">✓ Aktif</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Paket</div><div className="mt-1 font-bold">{plan}</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Kredit</div><div className="mt-1 font-bold">{credits === null ? "—" : credits.toLocaleString("id-ID")}</div></div></div><button onClick={openCreator} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200">Kelola Akun Induk &amp; Kredit</button></>}</div>{notice && <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{notice}</div>}</section>;`;
  s = s.slice(0, start) + profile + s.slice(end);
}

fs.writeFileSync(file, s);
console.log("SALVIAN central account patch applied");
