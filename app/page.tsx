"use client";

import { useEffect, useState } from "react";
import { createClient } from "@neondatabase/neon-js";
import { AudioLines, ChevronDown, Home, Library, Mic2, Music2, Plus, Settings2, Sparkles, UserRound, WandSparkles, X, Play, Trash2, ArrowLeft, LogIn } from "lucide-react";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });

type Project = { id: string; title: string; lyrics: string; style: string; model: string; createdAt: string; status: string; taskId?: string | null; audio?: string | null };

const examples = [
  "Slow Rock Melayu, sedih dan menyentuh hati, vokal pria dewasa, suara lembut dan emosional, gitar elektrik clean, piano, bass lembut, drum pelan, suasana malam, 70 BPM.",
  "Dangdut Timur NTT, vokal wanita dewasa, ceria dan manja, kendang dangdut kuat, gitar elektrik, bass, keyboard, suasana pesta, tempo 110 BPM.",
  "Duet pria dan wanita, saling bersahutan, romantis dan sedih, Slow Rock Melayu, gitar akustik, piano, string lembut, chorus besar.",
];

export default function HomePage() {
  const [advanced, setAdvanced] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("");
  const [model, setModel] = useState("v5.5 Pro");
  const [showModels, setShowModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"create" | "library" | "project" | "profile">("create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [plan, setPlan] = useState("FREE");
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    try { setProjects(JSON.parse(localStorage.getItem("salvian-ai-music-projects") || "[]")); } catch { setProjects([]); }
    (async () => {
      try {
        const session = await neon.auth.getSession();
        const user = session?.data?.user;
        if (!user) return;
        setUserEmail(user.email || "");
        const authWithJwt = neon.auth as unknown as { getJWTToken?: () => Promise<string | null> };
        if (typeof authWithJwt.getJWTToken !== "function") return;
        const jwt = await authWithJwt.getJWTToken();
        if (!jwt) return;
        setToken(jwt);
        const res = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "balance" }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { setPlan(data.plan || "FREE"); setCredits(Number(data.credits || 0)); }
      } catch (error) { console.error("SALVIAN AUTH INIT", error); }
    })();
  }, []);

  const persist = (items: Project[]) => { setProjects(items); localStorage.setItem("salvian-ai-music-projects", JSON.stringify(items)); };
  const login = () => { window.location.href = "https://salvian-ai-creator.vercel.app/akun.html"; };
  const authHeaders = (): HeadersInit => token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };

  const helpLyrics = async () => {
    const idea = lyrics.trim() || style.trim();
    if (!idea) { setNotice("Tulis ide lagu atau gaya musik dulu, lalu tekan Bantu AI."); return; }
    setBusy(true); setNotice("");
    try {
      const res = await fetch("/api/lyrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat lirik");
      setLyrics(data.lyrics || "");
      setNotice("Lirik berhasil dibuat oleh AI. Silakan edit sesuai selera.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Terjadi kesalahan."); }
    finally { setBusy(false); }
  };

  const createSong = async () => {
    if (!token) { setNotice("Silakan login melalui Akun SALVIAN AI CREATOR terlebih dahulu."); return; }
    if (!lyrics.trim() && !style.trim()) { setNotice("Isi lirik atau gaya musik terlebih dahulu."); return; }
    if (credits !== null && credits < 100) { setNotice(`Kredit tidak cukup. Saldo Anda ${credits.toLocaleString("id-ID")} kredit.`); return; }
    setBusy(true); setNotice("Memeriksa kredit dan mengirim lagu ke mesin musik…");
    try {
      const title = lyrics.split("\n").find(Boolean)?.replace(/^\[.*?\]\s*/, "").slice(0, 42) || "Project Lagu Baru";
      const res = await fetch("/api/music", { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, lyrics: lyrics.trim(), style: style.trim(), model, n: 2 }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat lagu");
      if (typeof data.credits === "number") setCredits(data.credits);
      const project: Project = { id: crypto.randomUUID(), title: data.title || title, lyrics: lyrics.trim(), style: style.trim(), model, createdAt: new Date().toISOString(), status: data.status || (data.audio ? "ready" : "processing"), taskId: data.taskId || null, audio: data.audio || null };
      persist([project, ...projects]);
      setSelectedProject(project); setView("project");
      setNotice(data.audio ? "Lagu berhasil dibuat." : "Permintaan lagu diterima. Hasil sedang diproses.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Terjadi kesalahan saat membuat lagu."); }
    finally { setBusy(false); }
  };

  const refreshProject = async (project: Project) => {
    if (!project.taskId) return;
    setBusy(true); setNotice("Memeriksa hasil lagu…");
    try {
      const res = await fetch("/api/music", { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "status", taskId: project.taskId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memeriksa hasil");
      const updated = { ...project, status: data.status || project.status, audio: data.audio || project.audio || null };
      persist(projects.map(p => p.id === project.id ? updated : p));
      setSelectedProject(updated);
      setNotice(updated.audio ? "Hasil lagu sudah tersedia." : `Status: ${updated.status}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal memeriksa hasil."); }
    finally { setBusy(false); }
  };

  const removeProject = (id: string) => persist(projects.filter(p => p.id !== id));

  const renderCreate = () => <>
    <div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[.25em] text-violet-300">Create your sound</p><h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Ubah ide menjadi <span className="gradient-text">lagu.</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Tulis lirik, jelaskan gaya dan karakter vokal. Sisanya kami siapkan dalam satu alur yang sederhana.</p></div>
    <div className="space-y-4">
      <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-white/7 px-4 py-4"><div className="flex items-center gap-2"><Music2 size={18}/><span className="font-bold">Lirik</span></div><button onClick={helpLyrics} disabled={busy} className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200 disabled:opacity-50"><WandSparkles size={14}/> Bantu AI</button></div><textarea value={lyrics} onChange={e=>setLyrics(e.target.value)} placeholder="Tulis lirik lagu Anda, atau tulis ide ceritanya…" className="min-h-[230px] w-full resize-y bg-transparent p-4 text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600"/><div className="flex items-center justify-between border-t border-white/7 px-4 py-3 text-[11px] text-zinc-500"><span>💡 Lirik yang dihasilkan AI tetap bisa Anda edit.</span><span>{lyrics.length} karakter</span></div></section>
      <section className="card overflow-hidden"><div className="border-b border-white/7 px-4 py-4"><div className="flex items-center gap-2 font-bold"><AudioLines size={18}/> Gaya &amp; Vokal</div><p className="mt-1 text-xs text-zinc-500">Gabungkan genre, suasana, instrumen, tempo, dan karakter vokal dalam satu deskripsi.</p></div><textarea value={style} onChange={e=>setStyle(e.target.value)} placeholder="Contoh: Slow Rock Melayu, sedih dan menyentuh hati, vokal pria dewasa, gitar elektrik clean, piano, drum pelan, suasana malam, 70 BPM…" className="min-h-[150px] w-full resize-y bg-transparent p-4 text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600"/><div className="flex gap-2 overflow-x-auto px-4 pb-4">{examples.map((item,i)=><button key={i} onClick={()=>setStyle(item)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-zinc-300">Contoh {i+1}</button>)}</div></section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><button className="card flex items-center gap-3 px-4 py-4 text-left"><Plus size={18}/><span><b className="block text-sm">Audio</b><small className="text-zinc-500">Tambah audio</small></span></button><button className="card flex items-center gap-3 px-4 py-4 text-left"><Mic2 size={18}/><span><b className="block text-sm">Voice</b><small className="text-zinc-500">Karakter suara</small></span></button><button onClick={()=>setShowModels(true)} className="card flex items-center justify-between px-4 py-4 text-left sm:col-span-2"><span><b className="block text-sm">Model</b><small className="text-zinc-500">{model} · pilihan model AI</small></span><ChevronDown size={17}/></button></div>
      {advanced && <section className="card p-4"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Advanced</h2><p className="text-xs text-zinc-500">Kontrol tambahan untuk pengguna berpengalaman.</p></div><Settings2 size={18} className="text-violet-300"/></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Instrumental</div><div className="mt-1 font-semibold">Tanpa vokal</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Variasi</div><div className="mt-1 font-semibold">2 hasil</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Kreativitas</div><div className="mt-1 font-semibold">Balanced</div></div></div></section>}
      {notice && <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{notice}</div>}
      {!token && <button onClick={login} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-100"><LogIn size={17}/> Login Akun SALVIAN AI CREATOR</button>}
      <button onClick={createSong} disabled={busy} className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-extrabold text-black shadow-[0_12px_45px_rgba(255,255,255,.08)] transition hover:scale-[1.01] disabled:opacity-60"><Sparkles size={18} className="transition group-hover:rotate-12"/>{busy ? "Memproses…" : "Buat Lagu"}</button>
    </div>
  </>;

  const renderLibrary = () => <section><div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[.25em] text-violet-300">Your music</p><h1 className="mt-2 text-3xl font-extrabold">Library</h1><p className="mt-2 text-sm text-zinc-500">Semua project lagu yang Anda buat tersimpan di perangkat ini.</p></div>{projects.length === 0 ? <div className="card p-8 text-center"><Music2 className="mx-auto mb-3 text-zinc-600"/><p className="font-semibold">Belum ada project</p><p className="mt-1 text-sm text-zinc-500">Buat lagu pertama Anda dari menu Buat.</p></div> : <div className="space-y-3">{projects.map(p=><button key={p.id} onClick={()=>{setSelectedProject(p);setView("project")}} className="card flex w-full items-center gap-4 p-4 text-left"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Music2 size={20}/></div><div className="min-w-0 flex-1"><div className="truncate font-bold">{p.title}</div><div className="mt-1 truncate text-xs text-zinc-500">{p.style || "Gaya belum ditentukan"}</div></div><span className={`text-xs ${p.audio ? "text-emerald-300" : "text-amber-300"}`}>{p.audio ? "Siap" : p.status}</span></button>)}</div>}</section>;

  const renderProject = () => selectedProject && <section><button onClick={()=>setView("library")} className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><ArrowLeft size={16}/> Kembali ke Library</button><div className="card overflow-hidden"><div className="bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent p-6"><div className="grid h-20 w-20 place-items-center rounded-3xl bg-black/30"><Music2 size={34}/></div><p className="mt-5 text-xs uppercase tracking-[.25em] text-violet-300">Project</p><h1 className="mt-2 text-2xl font-extrabold">{selectedProject.title}</h1><p className="mt-2 text-sm text-zinc-400">{selectedProject.style || "Gaya belum ditentukan"}</p></div><div className="space-y-4 p-6">{selectedProject.audio ? <audio controls className="w-full" src={selectedProject.audio}/> : <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Status: {selectedProject.status}. Hasil audio belum tersedia.</div>}{selectedProject.taskId && <button onClick={()=>refreshProject(selectedProject)} disabled={busy} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold disabled:opacity-50">{busy ? "Memeriksa…" : "Periksa hasil lagi"}</button>}<div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Lirik</div><pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-300">{selectedProject.lyrics}</pre></div><button onClick={()=>{removeProject(selectedProject.id);setSelectedProject(null);setView("library")}} className="flex items-center gap-2 text-sm text-red-300"><Trash2 size={15}/> Hapus project</button></div></div></section>;

  const renderProfile = () => <section><div className="card p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-violet-500/20"><UserRound size={30}/></div><div><h1 className="text-xl font-extrabold">SALVIAN AI</h1><p className="text-sm text-zinc-500">{userEmail || "Belum login"}</p></div></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Paket</div><div className="mt-1 font-bold">{plan}</div></div><div className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">Kredit</div><div className="mt-1 font-bold">{credits === null ? "—" : credits.toLocaleString("id-ID")}</div></div></div></div></section>;

  return <main className="min-h-screen pb-28"><header className="sticky top-0 z-20 border-b border-white/8 bg-[#08080b]/85 backdrop-blur-xl"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><div><div className="text-lg font-black tracking-tight">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[10px] uppercase tracking-[.25em] text-zinc-500">Music</div></div><div className="flex items-center gap-3"><div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold">{credits === null ? "—" : `${credits.toLocaleString("id-ID")} kredit`}</div><button onClick={()=>setAdvanced(v=>!v)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${advanced ? "border-violet-400/40 bg-violet-500/15 text-violet-200" : "border-white/10 bg-white/5 text-zinc-300"}`}>Advanced</button></div></div></header><div className="mx-auto max-w-6xl px-4 pt-7 sm:px-6">{view === "create" && renderCreate()}{view === "library" && renderLibrary()}{view === "project" && renderProject()}{view === "profile" && renderProfile()}</div>{showModels && <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 p-3 sm:place-items-center"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111116] p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold">Pilih model</h2><button onClick={()=>setShowModels(false)}><X size={19}/></button></div>{["v5.5 Pro","v5 Pro","v4.5+","v4.5","v4.5-all","Lyrics Model Classic"].map(item=><button key={item} onClick={()=>{setModel(item);setShowModels(false)}} className={`mb-2 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${model===item?"border-violet-400/40 bg-violet-500/10":"border-white/8 bg-white/5"}`}><span className="font-semibold">{item}</span>{model===item&&<span className="text-xs text-violet-300">Dipilih</span>}</button>)}</div></div>}<nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[#09090c]/90 backdrop-blur-xl"><div className="mx-auto grid max-w-xl grid-cols-4 px-2 py-2"><button onClick={()=>setView("create")} className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] ${view==="create"?"text-violet-200":"text-zinc-500"}`}><Home size={18}/><span>Buat</span></button><button onClick={()=>setView("library")} className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] ${view==="library"||view==="project"?"text-violet-200":"text-zinc-500"}`}><Library size={18}/><span>Library</span></button><button onClick={()=>setView("profile")} className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] ${view==="profile"?"text-violet-200":"text-zinc-500"}`}><UserRound size={18}/><span>Akun</span></button><button onClick={login} className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] text-zinc-500"><LogIn size={18}/><span>Creator</span></button></div></nav></main>;
}
