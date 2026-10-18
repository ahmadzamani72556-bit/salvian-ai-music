"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Bot, Check, ChevronDown, Download, Headphones, Library, MessageCircle, Mic2, Music2, Pause, Play, Send, Settings2, Sparkles, Upload, WandSparkles, X } from "lucide-react";

type Model = "Standard" | "Pro" | "Adroit";
type Project = { id: string; title: string; lyrics: string; style: string; model: string; status: string; audio?: string | null; task_id?: string | null; created_at?: string };
type Chat = { role: "user" | "assistant"; content: string };

const modelMap: Record<Model, string> = { Standard: "auto", Pro: "mureka-9", Adroit: "mureka-9.5" };
const presets = ["Dangdut Remix", "Slow Rock Melayu", "Sholawat", "Pop Ballad", "DJ Remix", "Timur NTT"];
const welcome: Chat = { role: "assistant", content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu ide lagu, lirik, genre, vokal, prompt, dan penggunaan Studio." };

function getWorkspaceId() {
  if (typeof window === "undefined") return "";
  const key = "salvian_music_workspace";
  let id = window.localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(key, id); }
  return id;
}

function headersFor(workspace: string, json = false) {
  return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace };
}

export default function PremiumMusicStudio() {
  const [workspace, setWorkspace] = useState("");
  const [model, setModel] = useState<Model>("Pro");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [gender, setGender] = useState("female");
  const [instrumental, setInstrumental] = useState(false);
  const [tempo, setTempo] = useState(100);
  const [language, setLanguage] = useState("Indonesia");
  const [active, setActive] = useState("studio");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [referenceId, setReferenceId] = useState("");
  const [vocalId, setVocalId] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [vocalName, setVocalName] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<Chat[]>([welcome]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [lyricBusy, setLyricBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const fileReference = useRef<HTMLInputElement>(null);
  const fileVocal = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadLibrary = async (id = workspace) => {
    if (!id) return;
    const res = await fetch("/api/projects", { headers: headersFor(id), cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setProjects(Array.isArray(data.projects) ? data.projects : []);
  };

  useEffect(() => { const id = getWorkspaceId(); setWorkspace(id); void loadLibrary(id); }, []);
  useEffect(() => { if (active === "library") void loadLibrary(); }, [active]);

  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!workspace) return;
    if (file.size > 10 * 1024 * 1024) { setNotice("Ukuran file maksimal 10 MB."); return; }
    const form = new FormData(); form.append("file", file); form.append("purpose", purpose); setBusy(true);
    setNotice(purpose === "reference" ? "Mengunggah audio referensi ke mesin musik…" : "Membuat karakter vokal AI…");
    try {
      const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload gagal.");
      if (purpose === "reference") { setReferenceId(String(data.id || "")); setReferenceName(file.name); } else { setVocalId(String(data.vocal_id || "")); setVocalName(file.name); }
      setNotice("Berhasil. File siap dipakai pada pembuatan musik.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); } finally { setBusy(false); }
  };

  const pollTask = async (taskId: string, endpoint = "/api/music") => {
    if (!workspace || !taskId) return;
    setPolling(true);
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 6000));
      try {
        const res = await fetch(endpoint, { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ action: "status", taskId }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Status generasi gagal dibaca.");
        if (data.finished) { setNotice(data.audio ? "Musik selesai dan tersimpan di Library." : data.failed ? "Generasi musik gagal." : "Generasi selesai."); await loadLibrary(); setPolling(false); return; }
        setNotice(`Musik sedang dibuat… ${data.status || "diproses"}`);
      } catch (e) { setNotice(e instanceof Error ? e.message : "Status generasi gagal dibaca."); }
    }
    setPolling(false); setNotice("Generasi masih berjalan. Library dapat diperiksa kembali nanti.");
  };

  const generate = async () => {
    if (!workspace) return;
    if (!lyrics.trim() && !instrumental) { setNotice("Masukkan lirik atau aktifkan mode instrumental."); return; }
    setBusy(true); setNotice("Mengirim karya ke mesin musik AI…");
    try {
      const title = (lyrics.split("\n").find(Boolean) || `${model} Music`).replace(/^\[.*?\]\s*/, "").slice(0, 70);
      const style = `${prompt.slice(0, 900)}${prompt ? ", " : ""}${language}, ${tempo} BPM, ${gender} vocal`;
      const endpoint = instrumental ? "/api/music/instrumental" : "/api/music";
      const body = instrumental ? { title, prompt: style, model: modelMap[model] } : { title, lyrics: lyrics.trim(), style, model: modelMap[model], n: 1, stream: true, gender, reference_id: referenceId || undefined, vocal_id: vocalId || undefined };
      const res = await fetch(endpoint, { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal membuat musik.");
      setNotice(data.audio ? "Musik berhasil dibuat." : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.`);
      await loadLibrary();
      if (data.taskId && !data.audio) void pollTask(String(data.taskId), endpoint);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal membuat musik."); } finally { setBusy(false); }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return;
    const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message, history }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); } finally { setChatBusy(false); }
  };

  const generateLyrics = async () => {
    if (!prompt.trim()) { setNotice("Isi deskripsi musik dulu agar Lirik Assistant punya konteks."); return; }
    setLyricBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message: `Buatkan lirik lagu original berbahasa ${language} berdasarkan konsep ini: ${prompt}. Gunakan struktur [Verse], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Chorus]. Jangan meniru artis tertentu. Hanya berikan lirik.`, history: [] }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Lirik Assistant gagal.");
      setLyrics(String(data.answer || "")); setNotice("Lirik berhasil dibuat oleh Lirik Assistant.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Lirik Assistant gagal."); } finally { setLyricBusy(false); }
  };

  const deleteProject = async (id: string) => {
    if (!workspace) return;
    const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: headersFor(workspace) });
    if (res.ok) { setProjects(prev => prev.filter(p => p.id !== id)); setNotice("Project dihapus dari Library Music."); }
  };
  const togglePlay = (url: string) => { if (playing === url) { audioRef.current?.pause(); setPlaying(null); return; } audioRef.current?.pause(); const audio = new Audio(url); audioRef.current = audio; setPlaying(url); audio.play().catch(() => setNotice("Audio tidak dapat diputar di perangkat ini.")); audio.onended = () => setPlaying(null); };
  const nav = [["studio", "Studio Musik", Music2], ["assistant", "Asisten AI", Bot], ["library", "Library", Library], ["models", "Model AI", Sparkles], ["style", "Style & Genre", AudioLines], ["voice", "Voice & Vocal", Mic2], ["reference", "Audio Referensi", Headphones]] as const;
  const modelCards: { id: Model; title: string; points: string[] }[] = [{ id: "Standard", title: "Cepat & Efisien", points: ["Kualitas baik", "Ide cepat", "Model auto"] }, { id: "Pro", title: "Kualitas Lebih Tinggi", points: ["Audio jernih", "Struktur detail", "Mureka 9"] }, { id: "Adroit", title: "Model Paling Elite", points: ["Aransemen kompleks", "Kualitas premium", "Mureka 9.5"] }];
  const statusLabel = useMemo(() => polling ? "Mesin musik sedang bekerja…" : notice, [polling, notice]);

  return <div className="min-h-screen bg-[#02030a] text-white" data-premium-studio>
    <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_5%,rgba(168,85,247,.16),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(37,99,235,.12),transparent_32%)]" />
    <div className="relative flex min-h-screen">
      <aside className="hidden w-[245px] shrink-0 border-r border-white/10 bg-[#050610]/95 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5"><img src="/salvian-ai-logo.svg" alt="SALVIAN AI" className="h-12 w-12 rounded-2xl"/><div><div className="text-xl font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[9px] tracking-[.32em] text-zinc-500">MUSIC STUDIO</div></div></div>
        <div className="flex-1 overflow-y-auto p-3">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active === id ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-500/50 text-white shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={19}/><span>{label}</span>{id === "assistant" && <span className="ml-auto rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-200">AI</span>}</button>)}</div>
        <div className="p-4"><div className="rounded-3xl border border-violet-400/15 bg-violet-500/5 p-4"><Sparkles size={17} className="text-violet-300"/><p className="mt-2 text-xs leading-5 text-zinc-500">Musik adalah bahasa jiwa. AI adalah alatnya.</p></div></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto pb-24">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#05050c]/85 px-4 py-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-2"><img src="/salvian-ai-logo.svg" alt="SALVIAN AI" className="h-9 w-9 rounded-xl"/><div><div className="font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[8px] tracking-[.3em] text-zinc-500">MUSIC STUDIO</div></div></div><button onClick={() => setChatOpen(true)} className="rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-100"><MessageCircle size={17} className="inline mr-2"/>Asisten AI</button></header>
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-7">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.3em] text-violet-300">Music Creator</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Studio Musik AI</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Buat lagu, instrumental, vokal AI, lirik, dan simpan hasilnya di Library Music.</p></div><div className="rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-zinc-500">Workspace Music lokal aktif</div></div>
          {statusLabel && <div className="mb-5 rounded-2xl border border-violet-400/15 bg-violet-500/5 px-4 py-3 text-sm text-violet-100">{statusLabel}</div>}
          {active === "studio" && <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Konsep Musik</h2><p className="text-xs text-zinc-500">Deskripsikan suasana, genre, instrumen, dan karakter lagu.</p></div><WandSparkles className="text-violet-300"/></div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} placeholder="Contoh: Dangdut remix Timur yang energik, gitar elektrik, bass tebal, nuansa pesta malam…" className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40"/><div className="mt-3 flex flex-wrap gap-2">{presets.map(p => <button key={p} onClick={() => setPrompt(p)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white">{p}</button>)}</div></div>
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Lirik</h2><p className="text-xs text-zinc-500">Tulis sendiri atau biarkan Lirik Assistant membuat draft original.</p></div><button disabled={lyricBusy} onClick={generateLyrics} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><WandSparkles size={14} className="inline mr-1"/>{lyricBusy ? "Membuat…" : "Buat Lirik AI"}</button></div><textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={12} placeholder={instrumental ? "Mode instrumental aktif — lirik tidak diperlukan." : "[Verse]\nTulis lirik lagu di sini…"} disabled={instrumental} className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-sm leading-6 text-white outline-none placeholder:text-zinc-600 disabled:opacity-40"/></div>
            </div>
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><h2 className="text-lg font-extrabold">Model AI</h2><div className="mt-3 space-y-2">{modelCards.map(card => <button key={card.id} onClick={() => setModel(card.id)} className={`w-full rounded-2xl border p-4 text-left ${model === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-black/10"}`}><div className="flex justify-between"><span className="font-bold">{card.id}</span>{model === card.id && <Check size={17} className="text-violet-300"/>}</div><p className="mt-1 text-xs text-zinc-500">{card.title}</p><p className="mt-2 text-[11px] text-zinc-600">{card.points.join(" • ")}</p></button>)}</div></div>
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Kontrol</h2><button onClick={() => setAdvancedOpen(v => !v)}><Settings2 size={18}/></button></div><label className="mt-4 flex items-center justify-between rounded-2xl bg-black/20 p-3 text-sm"><span>Instrumental</span><input type="checkbox" checked={instrumental} onChange={e => setInstrumental(e.target.checked)} /></label>{advancedOpen && <div className="mt-3 space-y-3"><label className="block text-xs text-zinc-500">Bahasa<select value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option>Indonesia</option><option>Melayu</option><option>English</option></select></label><label className="block text-xs text-zinc-500">Vokal<select value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option value="female">Female</option><option value="male">Male</option></select></label><label className="block text-xs text-zinc-500">Tempo: {tempo} BPM<input type="range" min="60" max="180" value={tempo} onChange={e => setTempo(Number(e.target.value))} className="mt-2 w-full"/></label></div>}</div>
              <button disabled={busy || polling} onClick={generate} className="w-full rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black shadow-2xl shadow-violet-950/30 disabled:opacity-40"><Music2 size={19} className="inline mr-2"/>{polling ? "Musik sedang dibuat…" : busy ? "Mengirim…" : "Buat Musik"}</button>
            </div>
          </section>}

          {active === "models" && <section><h2 className="mb-5 text-2xl font-black">Model AI</h2><div className="grid gap-4 md:grid-cols-3">{modelCards.map(card => <button key={card.id} onClick={() => { setModel(card.id); setActive("studio"); }} className={`rounded-3xl border p-6 text-left ${model === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-white/[.03]"}`}><Sparkles className="text-violet-300"/><h3 className="mt-4 text-xl font-black">{card.id}</h3><p className="mt-2 text-sm text-zinc-500">{card.title}</p><p className="mt-5 text-xs leading-6 text-zinc-600">{card.points.join("\n")}</p></button>)}</div></section>}
          {active === "style" && <section><h2 className="text-2xl font-black">Style & Genre</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{presets.map(p => <button key={p} onClick={() => { setPrompt(p); setActive("studio"); }} className="rounded-2xl border border-white/10 bg-white/[.03] p-5 text-left font-bold hover:border-violet-400/30">{p}<p className="mt-1 text-xs font-normal text-zinc-600">Gunakan sebagai konsep lagu</p></button>)}</div></section>}
          {active === "voice" && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-2xl font-black">Voice & Vocal</h2><p className="mt-2 text-sm text-zinc-500">Upload audio vokal untuk membuat karakter vokal AI.</p><input ref={fileVocal} type="file" accept=".mp3,.m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "voice"); }}/><button onClick={() => fileVocal.current?.click()} className="mt-6 rounded-2xl bg-violet-600 px-5 py-3 font-bold"><Upload size={17} className="inline mr-2"/>Upload Vocal</button>{vocalName && <p className="mt-4 text-sm text-zinc-400">{vocalName} {vocalId && "✓ siap"}</p>}</section>}
          {active === "reference" && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-2xl font-black">Audio Referensi</h2><p className="mt-2 text-sm text-zinc-500">Gunakan MP3/M4A sebagai referensi musik.</p><input ref={fileReference} type="file" accept=".mp3,.m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "reference"); }}/><button onClick={() => fileReference.current?.click()} className="mt-6 rounded-2xl bg-violet-600 px-5 py-3 font-bold"><Upload size={17} className="inline mr-2"/>Upload Referensi</button>{referenceName && <p className="mt-4 text-sm text-zinc-400">{referenceName} {referenceId && "✓ siap"}</p>}</section>}
          {active === "library" && <section><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Library Music</h2><p className="mt-1 text-sm text-zinc-500">Semua karya workspace Music ini.</p></div><button onClick={() => void loadLibrary()} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Refresh</button></div><div className="mt-5 space-y-3">{projects.length === 0 ? <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-600">Belum ada karya. Buat lagu pertama dari Studio Musik.</div> : projects.map(p => <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[.03] p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{p.title}</h3><p className="mt-1 text-xs text-zinc-500">{p.model} • {p.status}</p></div><div className="flex gap-2">{p.audio && <button onClick={() => togglePlay(String(p.audio))} className="rounded-xl bg-violet-600 p-2">{playing === p.audio ? <Pause size={17}/> : <Play size={17}/>}</button>}{p.audio && <a href={p.audio} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 p-2"><Download size={17}/></a>}<button onClick={() => void deleteProject(p.id)} className="rounded-xl border border-red-400/20 px-3 py-2 text-xs text-red-300">Hapus</button></div></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-600">{p.lyrics}</p></div>)}</div></section>}
        </div>
      </main>
      {chatOpen && <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,390px)] overflow-hidden rounded-3xl border border-white/10 bg-[#111116]/95 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between border-b border-white/10 p-4"><div className="flex items-center gap-2"><Bot size={18} className="text-violet-300"/><div><div className="font-extrabold">Asisten AI</div><div className="text-[10px] text-zinc-600">Khusus SALVIAN AI MUSIC</div></div></div><button onClick={() => setChatOpen(false)}><X size={18}/></button></div><div className="max-h-72 space-y-3 overflow-y-auto p-4">{messages.map((m,i)=><div key={i} className={m.role === "user" ? "ml-8 rounded-2xl bg-violet-500/15 p-3 text-xs leading-5" : "mr-4 rounded-2xl bg-white/5 p-3 text-xs leading-5 text-zinc-300"}>{m.content}</div>)}{chatBusy && <div className="text-xs text-zinc-600">Asisten sedang mengetik…</div>}</div><form onSubmit={ask} className="flex gap-2 border-t border-white/10 p-3"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Tanya tentang musik…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"/><button disabled={chatBusy || !chatInput.trim()} className="rounded-xl bg-white px-3 text-black disabled:opacity-30"><Send size={16}/></button></form></div>}
    </div>
  </div>;
}
