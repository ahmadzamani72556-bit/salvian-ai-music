"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Bot, Check, Download, Headphones, Library, MessageCircle, Mic2, Music2, Pause, Play, Send, Settings2, Sparkles, Upload, WandSparkles, X } from "lucide-react";

type Model = "Standard" | "Pro" | "Adroit";
type MusicEngine = "mureka" | "eleven_music_v2_5" | "suno_v6";
type Project = { id: string; title: string; lyrics: string; style: string; model: string; status: string; audio?: string | null; task_id?: string | null; created_at?: string };
type Chat = { role: "user" | "assistant"; content: string };

const modelMap: Record<Model, string> = { Standard: "auto", Pro: "mureka-9", Adroit: "mureka-9.5" };
const presets = ["Dangdut Remix", "Slow Rock Melayu", "Sholawat", "Pop Ballad", "DJ Remix", "Timur NTT"];
const welcome: Chat = { role: "assistant", content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu ide lagu, lirik, genre, vokal, prompt, dan penggunaan Studio." };
const engineCards: { id: MusicEngine; title: string; subtitle: string; points: string[] }[] = [
  { id: "mureka", title: "Mureka", subtitle: "PRO", points: ["Mesin yang sudah aktif", "Pilih model Mureka di bawah", "Billing: Mureka"] },
  { id: "eleven_music_v2_5", title: "Eleven Music", subtitle: "ELITE", points: ["Music v2.5", "Studio-grade generation", "Billing: Eleven Elite"] },
  { id: "suno_v6", title: "Suno", subtitle: "ULTIMATE", points: ["Suno v6", "Flagship music model", "Billing: Suno Ultimate"] },
];

function getWorkspaceId() {
  if (typeof window === "undefined") return "";
  const key = "salvian_music_workspace";
  let id = window.localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(key, id); }
  return id;
}
function headersFor(workspace: string, json = false) { return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace }; }
function emitMusicEvent(name: string, detail: unknown) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail })); }

export default function PremiumMusicStudio() {
  const [workspace, setWorkspace] = useState("");
  const [musicEngine, setMusicEngine] = useState<MusicEngine>("mureka");
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
  const [referenceEngine, setReferenceEngine] = useState<MusicEngine | "">("");
  const [vocalEngine, setVocalEngine] = useState<MusicEngine | "">("");
  const [chatOpen, setChatOpen] = useState(false);
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

  const loadLibrary = async (id = workspace) => { if (!id) return; const res = await fetch("/api/projects", { headers: headersFor(id), cache: "no-store" }); const data = await res.json().catch(() => ({})); if (res.ok) { const next = Array.isArray(data.projects) ? data.projects : []; setProjects(next); emitMusicEvent("salvian-music-results-update", { projects: next }); } };
  useEffect(() => { const id = getWorkspaceId(); setWorkspace(id); void loadLibrary(id); }, []);
  useEffect(() => { const openAssistant = () => setChatOpen(true); window.addEventListener("salvian-open-assistant", openAssistant); return () => window.removeEventListener("salvian-open-assistant", openAssistant); }, []);
  useEffect(() => { if (active === "library") void loadLibrary(); }, [active]);

  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!workspace) return; if (file.size > 10 * 1024 * 1024) { setNotice("Ukuran file maksimal 10 MB."); return; }
    const form = new FormData(); form.append("file", file); form.append("purpose", purpose); form.append("engine", musicEngine); setBusy(true); setNotice(purpose === "reference" ? "Mengunggah audio referensi ke mesin musik…" : "Membuat karakter vokal AI…");
    try { const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Upload gagal."); if (purpose === "reference") { setReferenceId(String(data.id || "")); setReferenceName(file.name); setReferenceEngine(musicEngine); } else { setVocalId(String(data.vocal_id || data.id || "")); setVocalName(file.name); setVocalEngine(musicEngine); } setNotice("Berhasil. File siap dipakai pada pembuatan musik."); } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); } finally { setBusy(false); }
  };

  const pollTask = async (taskId: string, endpoint = "/api/music", engine = musicEngine) => {
    if (!workspace || !taskId) return;
    setPolling(true);
    emitMusicEvent("salvian-music-generation-status", { generating: true, status: "Permintaan diterima. Mesin sedang menyiapkan lagu…" });
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 6000));
      try {
        const res = await fetch(endpoint, { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ action: "status", taskId, musicEngine: engine }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Status generasi gagal dibaca.");
        if (data.finished) {
          const finalStatus = data.audio ? `${data.musicEngine || "Musik"} selesai dan tersimpan di Library.` : data.failed ? "Generasi musik gagal." : "Generasi selesai.";
          setNotice(finalStatus);
          emitMusicEvent("salvian-music-generation-status", { generating: false, failed: Boolean(data.failed), status: finalStatus });
          await loadLibrary();
          setPolling(false);
          return;
        }
        const progressStatus = `Musik sedang dibuat… ${data.status || "diproses"}`;
        setNotice(progressStatus);
        emitMusicEvent("salvian-music-generation-status", { generating: true, status: progressStatus });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Status generasi gagal dibaca.";
        setNotice(message);
        emitMusicEvent("salvian-music-generation-status", { generating: true, status: message });
      }
    }
    const pendingStatus = "Proses masih berjalan. Buka Hasil Lagu & Proses untuk memeriksa status dan hasil terbaru.";
    setPolling(false);
    setNotice(pendingStatus);
    emitMusicEvent("salvian-music-generation-status", { generating: true, status: pendingStatus });
  };

  const generate = async () => {
    if (!workspace) return; if (!lyrics.trim() && !instrumental) { setNotice("Masukkan lirik atau aktifkan mode instrumental."); return; }
    if ((referenceId && referenceEngine !== musicEngine) || (vocalId && vocalEngine !== musicEngine)) { setNotice(`File referensi/vokal diunggah untuk mesin lain. Pilih ulang Audio Referensi dan Voice & Vocal saat mesin ${engineCards.find(e => e.id === musicEngine)?.title || musicEngine} aktif.`); return; }
    setBusy(true); const startStatus = `Mengirim karya ke ${engineCards.find(e => e.id === musicEngine)?.title || "mesin musik"}…`; setNotice(startStatus); emitMusicEvent("salvian-music-generation-status", { generating: true, status: startStatus });
    try {
      const title = (lyrics.split("\n").find(Boolean) || `${musicEngine} Music`).replace(/^\[.*?\]\s*/, "").slice(0, 70);
      const style = `${prompt.slice(0, 900)}${prompt ? ", " : ""}${language}, ${tempo} BPM, ${gender} vocal`;
      const endpoint = "/api/music";
      const body = { title, lyrics: lyrics.trim(), style, model: musicEngine === "mureka" ? modelMap[model] : musicEngine, musicEngine, n: 1, stream: true, gender, language, tempo, instrumental, reference_id: referenceId || undefined, vocal_id: vocalId || undefined };
      const res = await fetch(endpoint, { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify(body) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Gagal membuat musik.");
      setNotice(data.audio ? `${data.musicEngine || "Musik"} berhasil dibuat.` : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.`); emitMusicEvent("salvian-music-generation-status", { generating: Boolean(data.taskId && !data.audio), status: data.audio ? `${data.musicEngine || "Musik"} berhasil dibuat.` : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.` }); await loadLibrary(); if (data.audio) emitMusicEvent("salvian-music-generation-status", { generating: false, status: `${data.musicEngine || "Musik"} berhasil dibuat.` }); if (data.taskId && !data.audio) void pollTask(String(data.taskId), endpoint, musicEngine);
    } catch (e) { const message = e instanceof Error ? e.message : "Gagal membuat musik."; setNotice(message); emitMusicEvent("salvian-music-generation-status", { generating: false, failed: true, status: message }); } finally { setBusy(false); }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return; const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try { const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message, history }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia."); setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]); } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); } finally { setChatBusy(false); }
  };

  const generateLyrics = async () => {
    if (!prompt.trim()) { setNotice("Isi deskripsi musik dulu agar Lirik Assistant punya konteks."); return; } setLyricBusy(true);
    try { const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message: `Buatkan lirik lagu original berbahasa ${language} berdasarkan konsep ini: ${prompt}. Gunakan struktur [Verse], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Chorus]. Jangan meniru artis tertentu. Hanya berikan lirik.`, history: [] }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Lirik Assistant gagal."); setLyrics(String(data.answer || "")); setNotice("Lirik berhasil dibuat oleh Lirik Assistant."); } catch (e) { setNotice(e instanceof Error ? e.message : "Lirik Assistant gagal."); } finally { setLyricBusy(false); }
  };
  const deleteProject = async (id: string) => { if (!workspace) return; const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: headersFor(workspace) }); if (res.ok) { setProjects(prev => prev.filter(p => p.id !== id)); setNotice("Project dihapus dari Library Music."); } };
  const togglePlay = (url: string) => { if (playing === url) { audioRef.current?.pause(); setPlaying(null); return; } audioRef.current?.pause(); const audio = new Audio(url); audioRef.current = audio; setPlaying(url); audio.play().catch(() => setNotice("Audio tidak dapat diputar di perangkat ini.")); audio.onended = () => setPlaying(null); };
  const nav = [["studio", "Buat Lagu", Music2], ["assistant", "Asisten AI", Bot], ["library", "Library", Library], ["models", "Model AI", Sparkles], ["style", "Style & Genre", AudioLines], ["voice", "Voice & Vocal", Mic2], ["reference", "Audio Referensi", Headphones]] as const;
  const modelCards: { id: Model; title: string; points: string[] }[] = [{ id: "Standard", title: "Cepat & Efisien", points: ["Kualitas baik", "Ide cepat", "Mureka auto"] }, { id: "Pro", title: "Kualitas Lebih Tinggi", points: ["Audio jernih", "Struktur detail", "Mureka 9"] }, { id: "Adroit", title: "Model Paling Elite", points: ["Aransemen kompleks", "Kualitas premium", "Mureka 9.5"] }];
  const selectedEngine = engineCards.find(e => e.id === musicEngine)!;
  const statusLabel = useMemo(() => polling ? `Mesin ${selectedEngine.title} sedang bekerja…` : notice, [polling, notice, selectedEngine.title]);

  return <div className="min-h-screen bg-[#02030a] text-white" data-premium-studio>
    <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_5%,rgba(168,85,247,.16),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(37,99,235,.12),transparent_32%)]" />
    <div className="relative flex min-h-screen">
      <aside className="hidden w-[245px] shrink-0 border-r border-white/10 bg-[#050610]/95 lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5"><div className="text-xl font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[9px] tracking-[.32em] text-zinc-500">MUSIC STUDIO</div></div>
        <div className="flex-1 overflow-y-auto p-3">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active === id ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-500/50 text-white shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={19}/><span>{label}</span>{id === "assistant" && <span className="ml-auto rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-200">AI</span>}</button>)}</div>
        <div className="p-4"><div className="rounded-3xl border border-violet-400/15 bg-violet-500/5 p-4"><Sparkles size={17} className="text-violet-300"/><p className="mt-2 text-xs leading-5 text-zinc-500">Musik adalah bahasa jiwa. AI adalah alatnya.</p></div></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto pb-24">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#05050c]/85 px-4 py-4 backdrop-blur-xl sm:px-7"><div><div className="font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[8px] tracking-[.3em] text-zinc-500">MUSIC STUDIO</div></div><button onClick={() => setChatOpen(true)} className="rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-100"><MessageCircle size={17} className="inline mr-2"/>Asisten AI</button></header>
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-7">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.3em] text-violet-300">Music Creator</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Studio Musik AI</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Buat lagu, instrumental, vokal AI, lirik, dan simpan hasilnya di Library Music.</p></div><div className="rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-zinc-500">Mesin aktif: <span className="font-bold text-violet-200">{selectedEngine.title} {selectedEngine.subtitle}</span></div></div>
          {active === "studio" && <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2"><button type="button" onClick={() => setActive("reference")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-left transition hover:border-violet-300/60 hover:bg-violet-500/15"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200"><Headphones size={21}/></span><span className="min-w-0 flex-1"><span className="block font-bold">Audio Referensi</span><span className="mt-1 block text-xs text-zinc-400">{referenceName ? `Terpilih: ${referenceName}` : "Upload MP3/M4A sebagai acuan musik"}</span></span><Upload size={17} className="shrink-0 text-violet-200"/></button><button type="button" onClick={() => setActive("voice")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-left transition hover:border-fuchsia-300/60 hover:bg-fuchsia-500/15"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-200"><Mic2 size={21}/></span><span className="min-w-0 flex-1"><span className="block font-bold">Voice &amp; Vocal</span><span className="mt-1 block text-xs text-zinc-400">{vocalName ? `Terpilih: ${vocalName}` : "Upload audio vokal untuk karakter suara"}</span></span><Upload size={17} className="shrink-0 text-fuchsia-200"/></button></div>}
          {statusLabel && <div className="mb-5 rounded-2xl border border-violet-400/15 bg-violet-500/5 px-4 py-3 text-sm text-violet-100">{statusLabel}</div>}
          {active === "studio" && <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Konsep Musik</h2><p className="text-xs text-zinc-500">Deskripsikan suasana, genre, instrumen, dan karakter lagu.</p></div><WandSparkles className="text-violet-300"/></div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} placeholder="Contoh: Dangdut remix Timur yang energik, gitar elektrik, bass tebal, nuansa pesta malam…" className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40"/><div className="mt-3 flex flex-wrap gap-2">{presets.map(p => <button key={p} onClick={() => setPrompt(p)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white">{p}</button>)}</div></div>
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Lirik</h2><p className="text-xs text-zinc-500">Tulis sendiri atau biarkan Lirik Assistant membuat draft original.</p></div><button disabled={lyricBusy} onClick={generateLyrics} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><WandSparkles size={14} className="inline mr-1"/>{lyricBusy ? "Membuat…" : "Buat Lirik AI"}</button></div><textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={12} placeholder={instrumental ? "Mode instrumental aktif — lirik tidak diperlukan." : "[Verse]\nTulis lirik lagu di sini…"} disabled={instrumental} className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-sm leading-6 text-white outline-none placeholder:text-zinc-600 disabled:opacity-40"/></div>
            </div>
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Mesin Musik</h2><p className="text-xs text-zinc-500">Pilih mesin sebelum menekan Buat Musik.</p></div><Sparkles className="text-violet-300"/></div><div className="mt-3 space-y-2">{engineCards.map(card => <button key={card.id} onClick={() => setMusicEngine(card.id)} className={`w-full rounded-2xl border p-4 text-left ${musicEngine === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-black/10"}`}><div className="flex justify-between"><span className="font-bold">{card.title} <span className="ml-1 text-[10px] tracking-[.18em] text-violet-300">{card.subtitle}</span></span>{musicEngine === card.id && <Check size={17} className="text-violet-300"/>}</div><p className="mt-2 text-[11px] text-zinc-600">{card.points.join(" • ")}</p></button>)}</div></div>
              {musicEngine === "mureka" && <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><h2 className="text-lg font-extrabold">Model Mureka</h2><div className="mt-3 space-y-2">{modelCards.map(card => <button key={card.id} onClick={() => setModel(card.id)} className={`w-full rounded-2xl border p-4 text-left ${model === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-black/10"}`}><div className="flex justify-between"><span className="font-bold">{card.id}</span>{model === card.id && <Check size={17} className="text-violet-300"/>}</div><p className="mt-1 text-xs text-zinc-500">{card.title}</p><p className="mt-2 text-[11px] text-zinc-600">{card.points.join(" • ")}</p></button>)}</div></div>}
              <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Kontrol</h2><button onClick={() => setAdvancedOpen(v => !v)}><Settings2 size={18}/></button></div><label className="mt-4 flex items-center justify-between rounded-2xl bg-black/20 p-3 text-sm"><span>Instrumental</span><input type="checkbox" checked={instrumental} onChange={e => setInstrumental(e.target.checked)} /></label>{advancedOpen && <div className="mt-3 space-y-3"><label className="block text-xs text-zinc-500">Bahasa<select value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option>Indonesia</option><option>Melayu</option><option>English</option></select></label><label className="block text-xs text-zinc-500">Vokal<select value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option value="female">Female</option><option value="male">Male</option></select></label><label className="block text-xs text-zinc-500">Tempo: {tempo} BPM<input type="range" min="60" max="180" value={tempo} onChange={e => setTempo(Number(e.target.value))} className="mt-2 w-full"/></label></div>}</div>
              <button disabled={busy || polling} onClick={generate} className="w-full rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black shadow-2xl shadow-violet-950/30 disabled:opacity-40"><Music2 size={19} className="inline mr-2"/>{polling ? `Musik ${selectedEngine.title} sedang dibuat…` : busy ? "Mengirim…" : `Buat Musik · ${selectedEngine.title}`}</button>
            </div>
          </section>}
          {active === "models" && <section><h2 className="mb-5 text-2xl font-black">Mesin Musik</h2><div className="grid gap-4 md:grid-cols-3">{engineCards.map(card => <button key={card.id} onClick={() => { setMusicEngine(card.id); setActive("studio"); }} className={`rounded-3xl border p-6 text-left ${musicEngine === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-white/[.03]"}`}><Sparkles className="text-violet-300"/><h3 className="mt-4 text-xl font-black">{card.title} <span className="text-xs tracking-[.18em] text-violet-300">{card.subtitle}</span></h3><p className="mt-2 text-sm text-zinc-500">{card.points.join(" • ")}</p></button>)}</div></section>}
          {active === "style" && <section><h2 className="text-2xl font-black">Style & Genre</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{presets.map(p => <button key={p} onClick={() => { setPrompt(p); setActive("studio"); }} className="rounded-2xl border border-white/10 bg-white/[.03] p-5 text-left font-bold hover:border-violet-400/30">{p}<p className="mt-1 text-xs font-normal text-zinc-600">Gunakan sebagai konsep lagu</p></button>)}</div></section>}
          {active === "voice" && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-2xl font-black">Voice & Vocal</h2><p className="mt-2 text-sm text-zinc-500">Upload audio vokal untuk membuat karakter vokal AI.</p><input ref={fileVocal} type="file" accept=".mp3,.m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "voice"); }}/><button onClick={() => fileVocal.current?.click()} className="mt-6 rounded-2xl bg-violet-600 px-5 py-3 font-bold"><Upload size={17} className="inline mr-2"/>Upload Vocal</button>{vocalName && <p className="mt-4 text-sm text-zinc-400">{vocalName} {vocalId && "✓ siap"}</p>}</section>}
          {active === "reference" && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-2xl font-black">Audio Referensi</h2><p className="mt-2 text-sm text-zinc-500">Gunakan MP3/M4A sebagai referensi musik.</p><input ref={fileReference} type="file" accept=".mp3,.m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "reference"); }}/><button onClick={() => fileReference.current?.click()} className="mt-6 rounded-2xl bg-violet-600 px-5 py-3 font-bold"><Upload size={17} className="inline mr-2"/>Upload Referensi</button>{referenceName && <p className="mt-4 text-sm text-zinc-400">{referenceName} {referenceId && "✓ siap"}</p>}</section>}
          {active === "library" && <section><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Library Music</h2><p className="mt-1 text-sm text-zinc-500">Semua karya workspace Music ini.</p></div><button onClick={() => void loadLibrary()} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Refresh</button></div><div className="mt-5 space-y-3">{projects.length === 0 ? <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-600">Belum ada karya. Buat lagu pertama dari Studio Musik.</div> : projects.map(p => <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[.03] p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{p.title}</h3><p className="mt-1 text-xs text-zinc-500">{p.model} • {p.status}</p></div><div className="flex gap-2">{p.audio && <button onClick={() => togglePlay(String(p.audio))} className="rounded-xl bg-violet-600 p-2">{playing === p.audio ? <Pause size={17}/> : <Play size={17}/>}</button>}{p.audio && <a href={p.audio} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 p-2"><Download size={17}/></a>}<button onClick={() => void deleteProject(p.id)} className="rounded-xl border border-red-400/20 px-3 py-2 text-xs text-red-300">Hapus</button></div></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-600">{p.lyrics}</p></div>)}</div></section>}
        </div>
      </main>
      <nav aria-label="Navigasi Studio Musik" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#05050c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="flex w-full items-stretch gap-1 overflow-x-auto px-2 py-2">
          {nav.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} aria-current={active === id ? "page" : undefined} className={`flex min-w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${active === id ? "bg-violet-500/15 text-violet-200" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={19}/><span>{label}</span></button>)}
        </div>
      </nav>
      {chatOpen && <section className="fixed inset-0 z-[200] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-[#05050c] text-white" role="dialog" aria-modal="true" aria-label="Asisten AI">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#080811] px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3"><Bot size={22} className="text-violet-300"/><div><div className="text-base font-extrabold">Asisten AI</div><div className="text-[10px] text-zinc-500">Khusus SALVIAN AI MUSIC</div></div></div>
          <button type="button" onClick={() => setChatOpen(false)} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10"><X size={17}/> Kembali</button>
        </header>
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 py-3 sm:px-6 sm:py-5">
          <div className="mb-3 shrink-0"><h1 className="text-xl font-black sm:text-2xl">Asisten AI Musik</h1><p className="mt-1 text-sm text-zinc-500">Tulis ide, minta bantuan lirik, atau diskusikan konsep lagu.</p></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-white/[.025] p-3 sm:p-5">
            {messages.map((m,i)=><div key={i} className={m.role === "user" ? "ml-5 rounded-2xl bg-violet-500/15 p-4 text-sm leading-6 sm:ml-16" : "mr-3 rounded-2xl bg-white/[.06] p-4 text-sm leading-6 text-zinc-200 sm:mr-12"}>{m.content}</div>)}
            {chatBusy && <div className="text-sm text-zinc-500">Asisten sedang mengetik…</div>}
          </div>
          <form onSubmit={ask} className="mt-3 flex shrink-0 flex-col gap-3 border-t border-white/10 pt-3">
            <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} rows={4} placeholder="Tulis lirik, ide lagu, genre, suasana, atau pertanyaan apa pun…" className="min-h-28 w-full resize-y rounded-2xl border border-white/15 bg-black/30 p-4 text-base leading-7 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/50 sm:min-h-36" />
            <div className="flex items-center justify-between gap-3"><p className="text-xs text-zinc-600">Asisten membantu ide dan proses kreatif musik.</p><button disabled={chatBusy || !chatInput.trim()} className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold disabled:opacity-30"><Send size={16}/> Kirim</button></div>
          </form>
        </div>
      </section>}
    </div>
  </div>;
}
