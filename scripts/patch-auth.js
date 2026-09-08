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

// Add the dedicated AI helper for account and Music usage questions.
if (!s.includes("const askAssistant = async () =>")) {
  s = s.replace(
    'const [credits, setCredits] = useState<number | null>(null);',
    'const [credits, setCredits] = useState<number | null>(null);\n  const [assistantOpen, setAssistantOpen] = useState(false);\n  const [assistantInput, setAssistantInput] = useState("");\n  const [assistantBusy, setAssistantBusy] = useState(false);\n  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([{ role: "assistant", content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya bisa membantu soal daftar/login akun, kredit, Library, cara membuat lagu, atau masalah di aplikasi. Silakan tanyakan apa saja." }]);'
  );

  s = s.replace(
    'const authHeaders = (): HeadersInit => token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };',
    `const authHeaders = (): HeadersInit => token ? { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` } : { "Content-Type": "application/json" };

  const askAssistant = async () => {
    const message = assistantInput.trim();
    if (!message || assistantBusy) return;
    const history = assistantMessages.slice(-10);
    setAssistantInput("");
    setAssistantMessages(prev => [...prev, { role: "user", content: message }]);
    setAssistantBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setAssistantMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (error) {
      setAssistantMessages(prev => [...prev, { role: "assistant", content: error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." }]);
    } finally {
      setAssistantBusy(false);
    }
  };`
  );

  s = s.replace(
    'const renderProfile = () =>',
    `const renderAssistant = () => <section><div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[.25em] text-violet-300">SALVIAN AI</p><h1 className="mt-2 text-3xl font-extrabold">Asisten AI</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Bingung daftar akun, melihat kredit, membuat lagu, atau mengelola Library? Tanyakan langsung di sini.</p></div><div className="card overflow-hidden"><div className="max-h-[55vh] space-y-3 overflow-y-auto p-4 sm:p-6">{assistantMessages.map((item, index) => <div key={index} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}><div className={item.role === "user" ? "max-w-[88%] rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-3 text-sm leading-6 text-violet-50" : "max-w-[92%] rounded-2xl rounded-bl-md border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-200"}>{item.content}</div></div>)}{assistantBusy && <div className="text-sm text-zinc-500">Asisten sedang mengetik…</div>}</div><div className="border-t border-white/8 p-3"><div className="flex gap-2"><input value={assistantInput} onChange={e=>setAssistantInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();askAssistant()}}} placeholder="Contoh: bagaimana cara daftar akun?" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"/><button onClick={askAssistant} disabled={assistantBusy||!assistantInput.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-black disabled:opacity-40"><Sparkles size={18}/></button></div><p className="mt-2 px-1 text-[11px] text-zinc-600">Jangan kirim password, API key, token, atau data rahasia.</p></div></div></section>;

  const renderProfile = () =>`
  );

  s = s.replace(
    '{view === "profile" && renderProfile()}',
    '{view === "profile" && renderProfile()}{view === "assistant" && renderAssistant()}'
  );

  s = s.replace(
    'const [advanced, setAdvanced] = useState(false);',
    'const [advanced, setAdvanced] = useState(false);'
  );
  s = s.replace(
    'useState<"create" | "library" | "project" | "profile">',
    'useState<"create" | "library" | "project" | "profile" | "assistant">'
  );

  const creatorNav = /<button onClick=\{openCreator\} className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-\[11px\] text-zinc-500"><LogIn size=\{18\}\/><span>Creator<\/span><\/button>/;
  if (creatorNav.test(s)) {
    s = s.replace(creatorNav, '<button onClick={()=>{setView("assistant");setAssistantOpen(true)}} className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] ${view==="assistant"?"text-violet-200":"text-zinc-500"}`}><Sparkles size={18}/><span>Asisten AI</span></button>');
  }
}

fs.writeFileSync(file, s);
console.log("SALVIAN auth/account hub + AI assistant patch applied");
