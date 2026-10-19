"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Download, Headphones, Library, MessageCircle, Mic2, Music2, Pause, Play, Send, Settings2, Sparkles, Upload, WandSparkles, X } from "lucide-react";

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

  const loadLibrary = async (id = workspace): Promise<Project[]> => {
    if (!id) return [];
    const res = await fetch("/api/projects", { headers: headersFor(id), cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    const next = Array.isArray(data.projects) ? data.projects as Project[] : [];
    setProjects(next);
    emitMusicEvent("salvian-music-results-update", { projects: next });
    return next;
  };

  useEffect(() => {
    const id = getWorkspaceId();
    setWorkspace(id);
    try {
      const draft = JSON.parse(window.localStorage.getItem("salvian_music_stage2_draft") || "null");
      if (draft) {
        setPrompt(String(draft.prompt || "")); setLyrics(String(draft.lyrics || "")); setGender(String(draft.gender || "female"));
        setInstrumental(Boolean(draft.instrumental)); setTempo(Number(draft.tempo || 100)); setLanguage(String(draft.language || "Indonesia"));
        setMusicEngine((draft.musicEngine || "mureka") as MusicEngine); setModel((draft.model || "Pro") as Model);
        setReferenceId(String(draft.referenceId || "")); setReferenceName(String(draft.referenceName || "")); setReferenceEngine((draft.referenceEngine || "") as MusicEngine | "");
        setVocalId(String(draft.vocalId || "")); setVocalName(String(draft.vocalName || "")); setVocalEngine((draft.vocalEngine || "") as MusicEngine | "");
      }
    } catch {}
    void loadLibrary(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = { prompt, lyrics, gender, instrumental, tempo, language, musicEngine, model, referenceId, referenceName, referenceEngine, vocalId, vocalName, vocalEngine };
    window.localStorage.setItem("salvian_music_stage2_draft", JSON.stringify(draft));
  }, [prompt, lyrics, gender, instrumental, tempo, language, musicEngine, model, referenceId, referenceName, referenceEngine, vocalId, vocalName, vocalEngine]);

  useEffect(() => {
    const openAssistant = () => setChatOpen(true);
    window.addEventListener("salvian-open-assistant", openAssistant);
    return () => window.removeEventListener("salvian-open-assistant", openAssistant);
  }, []);
  useEffect(() => { if (active === "library" || active === "results") void loadLibrary(); }, [active]);
  useEffect(() => {
    const refresh = () => void loadLibrary();
    window.addEventListener("salvian-music-refresh-library", refresh);
    return () => window.removeEventListener("salvian-music-refresh-library", refresh);
  }, [workspace]);

  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!workspace) return;
    if (!/^audio\/(mpeg|mp4|x-m4a|aac|wav)$/i.test(file.type) && !/\.(mp3|m4a|wav|aac)$/i.test(file.name)) {
      setNotice("Format audio tidak didukung. Gunakan MP3 atau M4A."); return;
    }
    if (purpose === "voice" && file.size > 10 * 1024 * 1024) {
      setNotice("Ukuran file Voice & Vocal maksimal 10 MB."); return;
    }
    setBusy(true);
    setNotice(purpose === "reference" ? "Mengunggah Audio Referensi…" : "Mengunggah Voice & Vocal…");
    try {
      const form = new FormData(); form.append("file", file); form.append("purpose", purpose); form.append("engine", musicEngine);
      const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload gagal.");
      if (purpose === "reference") {
        setReferenceId(String(data.id || data.url || "")); setReferenceName(file.name); setReferenceEngine(musicEngine);
        setNotice("Audio Referensi berhasil disimpan. Tetap di halaman pembuatan musik.");
      } else {
        setVocalId(String(data.vocal_id || data.id || "")); setVocalName(file.name); setVocalEngine(musicEngine);
        setNotice("Voice & Vocal berhasil disimpan. Tetap di halaman pembuatan musik.");
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); }
    finally { setBusy(false); }
  };

  const pollTask = async (taskId: string, endpoint = "/api/music", engine = musicEngine) => {
    if (!workspace || !taskId) return;
    let activeTaskId = taskId; let missingTaskCount = 0; setPolling(true);
    emitMusicEvent("salvian-music-generation-status", { generating: true, status: "Permintaan diterima. Mesin sedang menyiapkan lagu…" });
    for (let i = 0; i < 120; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2500));
      try {
        const res = await fetch(endpoint, { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ action: "status", taskId: activeTaskId, musicEngine: engine }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) {
            const library = await loadLibrary();
            const recovered = library.find(p => p.task_id === activeTaskId) || library.find(p => p.task_id && !p.audio && ["preparing", "queued", "running", "streaming", "finalizing_audio"].includes(String(p.status || "").toLowerCase()));
            if (recovered?.task_id) { activeTaskId = recovered.task_id; missingTaskCount = 0; continue; }
            missingTaskCount += 1;
            if (missingTaskCount >= 2) { setPolling(false); setNotice("Task musik tidak tersambung ke Library workspace."); emitMusicEvent("salvian-music-generation-status", { generating: false, failed: true, status: "Task musik tidak tersambung ke Library workspace." }); return; }
            continue;
          }
          throw new Error(data.error || "Status generasi gagal dibaca.");
        }
        missingTaskCount = 0;
        if (data.finished) {
          const finalStatus = data.audio ? `${data.musicEngine || "Musik"} selesai dan tersimpan di Library.` : data.failed ? "Generasi musik gagal." : "Generasi selesai.";
          setNotice(finalStatus); await loadLibrary(); setPolling(false);
          emitMusicEvent("salvian-music-generation-status", { generating: false, failed: Boolean(data.failed), status: finalStatus }); return;
        }
        setNotice(`Musik sedang dibuat… ${data.status || "diproses"}`);
      } catch (e) { setNotice(e instanceof Error ? e.message : "Status generasi gagal dibaca."); }
    }
    setPolling(false); setNotice("Proses masih berjalan. Buka Hasil Lagu & Proses untuk memeriksa status terbaru.");
  };

  const generate = async () => {
    if (!workspace) return;
    if (!lyrics.trim() && !instrumental) { setNotice("Masukkan lirik atau aktifkan mode instrumental."); return; }
    if ((referenceId && referenceEngine !== musicEngine) || (vocalId && vocalEngine !== musicEngine)) { setNotice("Audio Referensi/Voice & Vocal harus dibuat saat mesin yang sama aktif."); return; }
    setBusy(true); setNotice(`Mengirim karya ke ${engineCards.find(e => e.id === musicEngine)?.title || "mesin musik"}…`);
    try {
      const title = (lyrics.split("\n").find(Boolean) || `${musicEngine} Music`).replace(/^\[.*?\]\s*/, "").slice(0, 70);
      const style = `${prompt.slice(0, 900)}${prompt ? ", " : ""}${language}, ${tempo} BPM, ${gender} vocal`;
      const body = { title, lyrics: lyrics.trim(), style, model: musicEngine === "mureka" ? modelMap[model] : musicEngine, musicEngine, n: 1, stream: true, gender, language, tempo, instrumental, reference_id: referenceId || undefined, vocal_id: vocalId || undefined };
      const res = await fetch("/api/music", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Gagal membuat musik.");
      setNotice(data.audio ? `${data.musicEngine || "Musik"} berhasil dibuat.` : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.`);
      const library = await loadLibrary();
      if (data.taskId && !data.audio) void pollTask(String(library.find(p => p.task_id === String(data.taskId))?.task_id || data.taskId));
      emitMusicEvent("salvian-music-generation-status", { generating: Boolean(data.taskId && !data.audio), status: data.audio ? `${data.musicEngine || "Musik"} berhasil dibuat.` : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.` });
    } catch (e) { const message = e instanceof Error ? e.message : "Gagal membuat musik."; setNotice(message); emitMusicEvent("salvian-music-generation-status", { generating: false, failed: true, status: message }); }
    finally { setBusy(false); }
  };

  const generateLyrics = async () => {
    if (!prompt.trim()) { setNotice("Isi konsep musik dulu agar Lirik Assistant punya konteks."); return; }
    setLyricBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message: `Buatkan lirik lagu original berbahasa ${language} berdasarkan konsep ini: ${prompt}. Gunakan struktur [Verse], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Chorus]. Jangan meniru artis tertentu. Hanya berikan lirik.`, history: [] }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Lirik Assistant gagal.");
      setLyrics(String(data.answer || "")); setNotice("Lirik berhasil dibuat oleh Lirik Assistant.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Lirik Assistant gagal."); }
    finally { setLyricBusy(false); }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return;
    const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try { const res = await fetch("/api/assistant", { method: "POST", headers: headersFor(workspace, true), body: JSON.stringify({ message, history }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia."); setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]); }
    catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); }
    finally { setChatBusy(false); }
  };

  const deleteProject = async (id: string) => { if (!workspace) return; const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: headersFor(workspace) }); if (res.ok) { setProjects(prev => prev.filter(p => p.id !== id)); setNotice("Project dihapus dari Library Music."); } };
  const togglePlay = (url: string) => { if (playing === url) { audioRef.current?.pause(); setPlaying(null); return; } audioRef.current?.pause(); const audio = new Audio(url); audioRef.current = audio; setPlaying(url); audio.play().catch(() => setNotice("Audio tidak dapat diputar di perangkat ini.")); audio.onended = () => setPlaying(null); };
  const selectedEngine = engineCards.find(e => e.id === musicEngine)!;
  const statusLabel = useMemo(() => polling ? `Mesin ${selectedEngine.title} sedang bekerja…` : notice, [polling, notice, selectedEngine.title]);
  const nav = [["results", "Hasil Lagu & Proses", Headphones], ["assistant", "Asisten AI", Bot], ["library", "Library", Library], ["models", "Model AI", Sparkles]] as const;
  const modelCards: { id: Model; title: string; points: string[] }[] = [{ id: "Standard", title: "Cepat & Efisien", points: ["Kualitas baik", "Ide cepat", "Mureka auto"] }, { id: "Pro", title: "Kualitas Lebih Tinggi", points: ["Audio jernih", "Struktur detail", "Mureka 9"] }, { id: "Adroit", title: "Model Paling Elite", points: ["Aransemen kompleks", "Kualitas premium", "Mureka 9.5"] }];

  return <div className="min-h-screen bg-[#02030a] text-white" data-premium-studio>
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_75%_5%,rgba(168,85,247,.16),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(37,99,235,.12),transparent_32%)]" />
    <div className="relative min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[245px] border-r border-white/10 bg-[#050610]/95 lg:flex lg:flex-col"><div className="border-b border-white/10 px-5 py-5"><div className="text-xl font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[9px] tracking-[.32em] text-zinc-500">MUSIC STUDIO</div></div><div className="flex-1 overflow-y-auto p-3">{nav.map(([id,label,Icon]) => <button key={id} onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${active === id ? "bg-violet-600/30 text-white" : "text-zinc-400 hover:bg-white/5"}`}><Icon size={19}/><span>{label}</span></button>)}</div></aside>
      <main className="min-w-0 pb-24 lg:pl-[245px]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#05050c]/90 px-4 py-4 backdrop-blur-xl sm:px-7"><div><div className="font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[8px] tracking-[.3em] text-zinc-500">MUSIC STUDIO</div></div><button onClick={() => setChatOpen(true)} className="rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-100"><MessageCircle size={17} className="mr-2 inline"/>Asisten AI</button></header>
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-7">
          <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.3em] text-violet-300">Music Creator</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Studio Musik AI</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Buat lagu, instrumental, vokal AI, lirik, dan simpan hasilnya di Library Music.</p><div className="mt-5 inline-block rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-zinc-500">Mesin aktif: <span className="font-bold text-violet-200">{selectedEngine.title} {selectedEngine.subtitle}</span></div></div>
          {statusLabel && <div className="mb-5 rounded-2xl border border-violet-400/15 bg-violet-500/5 px-4 py-3 text-sm text-violet-100">{statusLabel}</div>}

          {active === "studio" && <>
            <input ref={fileReference} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void uploadFile(f, "reference"); }} />
            <input ref={fileVocal} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void uploadFile(f, "voice"); }} />
            <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={busy} onClick={() => fileReference.current?.click()} className="flex min-h-20 items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-left hover:bg-violet-500/15 disabled:opacity-50"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200"><Headphones size={22}/></span><span className="min-w-0 flex-1"><span className="block font-bold">Audio Referensi</span><span className="mt-1 block truncate text-xs text-zinc-400">{referenceName ? `${referenceName} ✓ siap` : "Upload MP3/M4A sebagai acuan musik"}</span></span><Upload size={18}/></button>
                  <button type="button" disabled={busy} onClick={() => fileVocal.current?.click()} className="flex min-h-20 items-center gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-left hover:bg-fuchsia-500/15 disabled:opacity-50"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-200"><Mic2 size={22}/></span><span className="min-w-0 flex-1"><span className="block font-bold">Voice &amp; Vocal</span><span className="mt-1 block truncate text-xs text-zinc-400">{vocalName ? `${vocalName} ✓ siap` : "Upload audio vokal untuk karakter suara"}</span></span><Upload size={18}/></button>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Konsep Musik</h2><p className="text-xs text-zinc-500">Isi konsep musik setelah atau sebelum referensi. Semua tetap di halaman ini.</p></div><WandSparkles className="text-violet-300"/></div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} placeholder="Contoh: Dangdut remix Timur yang energik, gitar elektrik, bass tebal, nuansa pesta malam, tempo 130 BPM…" className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40"/><div className="mt-3 flex flex-wrap gap-2">{presets.map(p => <button key={p} onClick={() => setPrompt(p)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white">{p}</button>)}</div></div>
                <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Lirik</h2><p className="text-xs text-zinc-500">Tulis sendiri atau buat dengan Lirik Assistant.</p></div><button disabled={lyricBusy} onClick={generateLyrics} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><WandSparkles size={14} className="mr-1 inline"/>{lyricBusy ? "Membuat…" : "Buat Lirik AI"}</button></div><textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={14} placeholder={instrumental ? "Mode instrumental aktif — lirik tidak diperlukan." : "[Verse]\nTulis lirik lagu di sini…"} disabled={instrumental} className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-sm leading-6 text-white outline-none placeholder:text-zinc-600 disabled:opacity-40"/></div>
              </div>
              <div className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Mesin Musik</h2><p className="text-xs text-zinc-500">Pilih mesin sebelum Buat Musik.</p></div><Sparkles className="text-violet-300"/></div><div className="mt-3 space-y-2">{engineCards.map(card => <button key={card.id} onClick={() => setMusicEngine(card.id)} className={`w-full rounded-2xl border p-4 text-left ${musicEngine === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-black/10"}`}><div className="flex justify-between"><span className="font-bold">{card.title} <span className="ml-1 text-[10px] tracking-[.18em] text-violet-300">{card.subtitle}</span></span>{musicEngine === card.id && <Check size={17}/>}</div><p className="mt-2 text-[11px] text-zinc-600">{card.points.join(" • ")}</p></button>)}</div></div>
                {musicEngine === "mureka" && <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><h2 className="text-lg font-extrabold">Modul Salvian AI Music</h2><div className="mt-3 space-y-2">{modelCards.map(card => <button key={card.id} onClick={() => setModel(card.id)} className={`w-full rounded-2xl border p-4 text-left ${model === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-black/10"}`}><div className="flex justify-between"><span className="font-bold">{card.id}</span>{model === card.id && <Check size={17}/>}</div><p className="mt-1 text-xs text-zinc-500">{card.title}</p><p className="mt-2 text-[11px] text-zinc-600">{card.points.join(" • ")}</p></button>)}</div></div>}
                <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Kontrol</h2><button onClick={() => setAdvancedOpen(v => !v)}><Settings2 size={18}/></button></div><label className="mt-4 flex items-center justify-between rounded-2xl bg-black/20 p-3 text-sm"><span>Instrumental</span><input type="checkbox" checked={instrumental} onChange={e => setInstrumental(e.target.checked)}/></label>{advancedOpen && <div className="mt-3 space-y-3"><label className="block text-xs text-zinc-500">Bahasa<select value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option>Indonesia</option><option>Melayu</option><option>English</option></select></label><label className="block text-xs text-zinc-500">Vokal<select value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option value="female">Female</option><option value="male">Male</option></select></label><label className="block text-xs text-zinc-500">Tempo: {tempo} BPM<input type="range" min="60" max="180" value={tempo} onChange={e => setTempo(Number(e.target.value))} className="mt-2 w-full"/></label></div>}</div>
                <button disabled={busy || polling} onClick={generate} className="w-full rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black shadow-2xl disabled:opacity-40"><Music2 size={19} className="mr-2 inline"/>{polling ? `Musik ${selectedEngine.title} sedang dibuat…` : busy ? "Mengirim…" : `Buat Musik · ${selectedEngine.title}`}</button>
              </div>
            </section>
          </>}

          {active === "models" && <section><h2 className="mb-5 text-2xl font-black">Mesin Musik</h2><div className="grid gap-4 md:grid-cols-3">{engineCards.map(card => <button key={card.id} onClick={() => { setMusicEngine(card.id); setActive("studio"); }} className={`rounded-3xl border p-6 text-left ${musicEngine === card.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 bg-white/[.03]"}`}><Sparkles className="text-violet-300"/><h3 className="mt-4 text-xl font-black">{card.title} <span className="text-xs tracking-[.18em] text-violet-300">{card.subtitle}</span></h3><p className="mt-2 text-sm text-zinc-500">{card.points.join(" • ")}</p></button>)}</div></section>}

          {active === "results" && <section className="mx-auto w-full max-w-5xl"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.24em] text-violet-300">Music Creator · Layar 2</p><h2 className="mt-2 text-2xl font-black">Hasil Lagu &amp; Proses</h2><p className="mt-2 text-sm text-zinc-400">Pantau proses dan hasil lagu.</p></div><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black">Karya dan hasil lagu</h3><button onClick={() => void loadLibrary()} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Refresh</button></div>{projects.length === 0 ? <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Belum ada hasil lagu di Library.</div> : <div className="space-y-3">{projects.map(p => <article key={p.id} className="rounded-3xl border border-white/10 bg-black/20 p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600/15"><Music2 size={20}/></div><div className="min-w-0 flex-1"><h3 className="break-words font-bold">{p.title || "Hasil Musik AI"}</h3><p className="mt-1 text-xs text-zinc-500">{p.model} · {p.status}</p></div>{p.audio && <a href={p.audio} download className="rounded-xl border border-white/10 px-3 py-2 text-xs"><Download size={14} className="mr-1 inline"/>Simpan</a>}</div>{p.audio ? <div className="mt-4 flex gap-3"><audio controls preload="none" src={p.audio} className="min-w-0 flex-1"/><button onClick={() => togglePlay(String(p.audio))} className="rounded-xl bg-violet-600 px-3 py-2 text-xs">{playing === p.audio ? <Pause size={14}/> : <Play size={14}/>}</button></div> : <p className="mt-3 text-xs text-zinc-500">Task menunggu hasil audio.</p>}<p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-500">{p.lyrics}</p></article>)}</div>}</section>}

          {active === "library" && <section><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Library Music</h2><p className="mt-1 text-sm text-zinc-500">Semua karya workspace Music.</p></div><button onClick={() => void loadLibrary()} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Refresh</button></div><div className="mt-5 space-y-3">{projects.length === 0 ? <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-600">Belum ada karya.</div> : projects.map(p => <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{p.title}</h3><p className="mt-1 text-xs text-zinc-500">{p.model} • {p.status}</p></div><div className="flex gap-2">{p.audio && <button onClick={() => togglePlay(String(p.audio))} className="rounded-xl bg-violet-600 p-2">{playing === p.audio ? <Pause size={17}/> : <Play size={17}/>}</button>}{p.audio && <a href={p.audio} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 p-2"><Download size={17}/></a>}<button onClick={() => void deleteProject(p.id)} className="rounded-xl border border-red-400/20 px-3 py-2 text-xs text-red-300">Hapus</button></div></div><p className="mt-3 line-clamp-2 text-xs text-zinc-600">{p.lyrics}</p></div>)}</div></section>}
        </div>
      </main>

      <nav aria-label="Navigasi Studio Musik" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#05050c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"><div className="flex w-full items-stretch gap-1 overflow-x-auto px-2 py-2">{nav.map(([id,label,Icon]) => <button key={id} type="button" onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} className={`flex min-w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${active === id ? "bg-violet-500/15 text-violet-200" : "text-zinc-400"}`}><Icon size={19}/><span>{label}</span></button>)}</div></nav>

      {chatOpen && <section className="fixed inset-0 z-[200] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#05050c] text-white" role="dialog" aria-modal="true" aria-label="Asisten AI"><header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#080811] px-4 py-4"><div className="flex items-center gap-3"><Bot size={22} className="text-violet-300"/><div><div className="font-extrabold">Asisten AI</div><div className="text-[10px] text-zinc-500">Khusus SALVIAN AI MUSIC</div></div></div><button onClick={() => setChatOpen(false)} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold"><X size={17}/> Kembali</button></header><div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 py-3"><h2 className="mb-3 shrink-0 text-xl font-black">Asisten AI Musik</h2><div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-white/[.025] p-3">{messages.map((m,i)=><div key={i} className={m.role === "user" ? "ml-5 rounded-2xl bg-violet-500/15 p-4 text-sm leading-6" : "mr-3 rounded-2xl bg-white/[.06] p-4 text-sm leading-6 text-zinc-200"}>{m.content}</div>)}{chatBusy && <div className="text-sm text-zinc-500">Asisten sedang mengetik…</div>}</div><form onSubmit={ask} className="mt-3 shrink-0 border-t border-white/10 pt-3"><textarea value={chatInput} onChange={e => setChatInput(e.target.value)} rows={4} placeholder="Tulis lirik, ide lagu, genre, suasana, atau pertanyaan…" className="min-h-28 w-full resize-y rounded-2xl border border-white/15 bg-black/30 p-4 text-base leading-7 outline-none"/><div className="mt-2 flex justify-end"><button disabled={chatBusy || !chatInput.trim()} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold disabled:opacity-30"><Send size={16}/> Kirim</button></div></form></div></section>}
    </div>
  </div>;
}
