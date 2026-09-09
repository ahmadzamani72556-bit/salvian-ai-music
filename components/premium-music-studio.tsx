"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { createClient, BetterAuthVanillaAdapter } from "@neondatabase/neon-js";
import {
  AudioLines, Bot, Check, ChevronDown, Crown, Download, Headphones, Library, LogIn,
  MessageCircle, Mic2, Music2, Plus, Send, Settings2, Sparkles, Upload, UserRound,
  WalletCards, WandSparkles, Zap, X, Play, Pause
} from "lucide-react";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });

type Model = "Standard" | "Pro" | "Adroit";
type Project = { id: string; title: string; lyrics: string; style: string; model: string; status: string; audio?: string | null; taskId?: string | null; createdAt?: string };
type Chat = { role: "user" | "assistant"; content: string };

const modelMap: Record<Model, string> = { Standard: "auto", Pro: "mureka-9", Adroit: "mureka-9.5" };
const presets = ["Dangdut Remix", "Slow Rock Melayu", "Sholawat", "Pop Ballad", "DJ Remix", "Timur NTT"];
const welcome: Chat = { role: "assistant", content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu membuat ide lagu, lirik, genre, vokal, prompt, kredit, Library, dan penggunaan Studio." };

function projectFromRow(row: Record<string, unknown>): Project {
  return { id: String(row.id), title: String(row.title || "Project Lagu"), lyrics: String(row.lyrics || ""), style: String(row.style || ""), model: String(row.model || "auto"), status: String(row.status || "preparing"), audio: row.audio_url ? String(row.audio_url) : null, taskId: row.task_id ? String(row.task_id) : null, createdAt: String(row.created_at || "") };
}

export default function PremiumMusicStudio() {
  const [model, setModel] = useState<Model>("Pro");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [advanced, setAdvanced] = useState(true);
  const [gender, setGender] = useState("female");
  const [instrumental, setInstrumental] = useState(false);
  const [tempo, setTempo] = useState(100);
  const [language, setLanguage] = useState("Indonesia");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState("FREE");
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
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
  const fileReference = useRef<HTMLInputElement>(null);
  const fileVocal = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncGeneration = useRef(0);

  const syncSession = async () => {
    const generation = ++syncGeneration.current;
    try {
      const session = await neon.auth.getSession();
      const user = session?.data?.user;
      if (!user) {
        if (generation === syncGeneration.current) {
          setToken(null); setCredits(null); setUserName("");
        }
        return false;
      }
      if (generation !== syncGeneration.current) return false;
      setUserName((user as { name?: string }).name || user.email || "Creator");

      const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
      let jwt: string | null = null;
      try { jwt = await auth.getJWTToken?.(); } catch {}
      if (!jwt) {
        try {
          const sessionRes = await fetch(`${AUTH}/get-session`, { credentials: "include", cache: "no-store" });
          jwt = sessionRes.headers.get("set-auth-jwt");
        } catch {}
      }
      if (!jwt) {
        if (generation === syncGeneration.current) {
          setToken(null); setCredits(null);
          setNotice("Akun sudah ditemukan, tetapi token akun belum siap. Sedang mencoba sinkronisasi ulang…");
        }
        return false;
      }
      if (generation !== syncGeneration.current) return false;
      setToken(jwt);
      const [balanceRes, libraryRes] = await Promise.all([
        fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "balance" }), cache: "no-store" }),
        fetch("/api/projects", { headers: { Authorization: `Bearer ${jwt}` }, cache: "no-store" }),
      ]);
      const data = await balanceRes.json().catch(() => ({}));
      const libraryData = await libraryRes.json().catch(() => ({}));
      if (generation !== syncGeneration.current) return false;
      if (balanceRes.ok) {
        setCredits(Number(data.credits));
        setPlan(String(data.plan || "FREE"));
        setNotice("");
      } else {
        setCredits(null);
        setNotice(String(data.error || "Gagal membaca saldo kredit akun induk."));
      }
      if (libraryRes.ok) setProjects(Array.isArray(libraryData.projects) ? libraryData.projects.map(projectFromRow) : []);
      return balanceRes.ok;
    } catch (error) {
      if (generation === syncGeneration.current) setNotice(error instanceof Error ? error.message : "Sinkronisasi akun gagal.");
      return false;
    }
  };

  const loadLibrary = async () => {
    if (!token) return;
    const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setProjects(Array.isArray(data.projects) ? data.projects.map(projectFromRow) : []);
  };

  useEffect(() => {
    void syncSession();
    const resync = () => { void syncSession(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void syncSession(); };
    window.addEventListener("pageshow", resync);
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => { if (active === "library" && token) void loadLibrary(); }, [active, token]);

  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!token) { setNotice("Silakan login melalui Akun SALVIAN AI terlebih dahulu."); return; }
    if (file.size > 10 * 1024 * 1024) { setNotice("Ukuran file maksimal 10 MB."); return; }
    const form = new FormData(); form.append("file", file); form.append("purpose", purpose); setBusy(true);
    setNotice(purpose === "reference" ? "Mengunggah audio referensi ke mesin musik…" : "Membuat karakter vokal AI…");
    try {
      const res = await fetch("/api/music/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload gagal.");
      if (purpose === "reference") { setReferenceId(String(data.id)); setReferenceName(file.name); } else { setVocalId(String(data.vocal_id)); setVocalName(file.name); }
      setNotice("Berhasil. File siap dipakai pada pembuatan musik.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); } finally { setBusy(false); }
  };

  const generate = async () => {
    if (!token) { setNotice("Silakan login melalui Akun SALVIAN AI terlebih dahulu."); setActive("account"); return; }
    if (!lyrics.trim() && !instrumental) { setNotice("Masukkan lirik atau aktifkan mode instrumental."); return; }
    if (credits !== null && credits < 100) { setNotice("Kredit tidak cukup. Pembuatan musik membutuhkan 100 kredit."); setActive("monetize"); return; }
    setBusy(true); setNotice("Mengirim karya ke mesin musik AI… monitor generasi akan muncul otomatis.");
    try {
      const title = (lyrics.split("\n").find(Boolean) || `${model} Music`).replace(/^\[.*?\]\s*/, "").slice(0, 70);
      const style = `${prompt.slice(0, 900)}${prompt ? ", " : ""}${language}, ${tempo} BPM, ${gender} vocal`;
      const res = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, lyrics: lyrics.trim(), style, model: modelMap[model], n: 1, stream: true, instrumental, gender, reference_id: referenceId || undefined, vocal_id: vocalId || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal membuat musik.");
      if (typeof data.credits === "number") setCredits(data.credits);
      setNotice(data.audio ? "Musik berhasil dibuat dan tersimpan di Library." : `Permintaan diterima. Task ID: ${data.taskId || "diproses"}.`);
      await loadLibrary(); setActive("library");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal membuat musik."); } finally { setBusy(false); }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return;
    if (!token) { setNotice("Akun belum tersinkron. Silakan tunggu sebentar atau buka Akun."); void syncSession(); return; }
    const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message, history }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); } finally { setChatBusy(false); }
  };

  const generateLyrics = async () => {
    if (!prompt.trim()) { setNotice("Isi deskripsi musik dulu agar Lirik Assistant punya konteks."); return; }
    if (!token) { setNotice("Akun belum tersinkron. Silakan tunggu sebentar atau buka Akun."); void syncSession(); return; }
    setLyricBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: `Buatkan lirik lagu original berbahasa ${language} berdasarkan konsep ini: ${prompt}. Gunakan struktur [Verse], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Chorus]. Jangan meniru artis tertentu. Hanya berikan lirik.`, history: [] }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Lirik Assistant gagal.");
      setLyrics(String(data.answer || "")); setNotice("Lirik berhasil dibuat oleh Lirik Assistant.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Lirik Assistant gagal."); } finally { setLyricBusy(false); }
  };

  const togglePlay = (url: string) => {
    if (playing === url) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause(); const audio = new Audio(url); audioRef.current = audio; setPlaying(url); audio.play().catch(() => setNotice("Audio tidak dapat diputar di perangkat ini.")); audio.onended = () => setPlaying(null);
  };

  const nav = [
    ["studio", "Studio Musik", Music2], ["assistant", "Asisten AI", Bot], ["library", "Library", Library], ["models", "Model AI", Sparkles], ["style", "Style & Genre", AudioLines], ["voice", "Voice & Vocal", Mic2], ["reference", "Audio Referensi", Headphones], ["monetize", "Monetisasi", WalletCards], ["account", "Akun", UserRound]
  ] as const;

  const modelCards: { id: Model; title: string; desc: string; points: string[] }[] = [
    { id: "Standard", title: "Cepat & Efisien", desc: "Hemat kredit", points: ["Kualitas baik", "Cocok untuk ide cepat", "Model auto"] },
    { id: "Pro", title: "Kualitas Lebih Tinggi", desc: "Direkomendasikan", points: ["Audio lebih jernih", "Struktur lebih detail", "Mureka 9"] },
    { id: "Adroit", title: "Model Paling Elite", desc: "Studio profesional", points: ["Aransemen kompleks", "Kualitas premium", "Mureka 9.5"] },
  ];

  return (
    <div className="min-h-screen bg-[#02030a] text-white" data-premium-studio>
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_5%,rgba(168,85,247,.16),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(37,99,235,.12),transparent_32%)]" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[245px] shrink-0 border-r border-white/10 bg-[#050610]/95 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5"><img src="/salvian-ai-logo.svg" alt="SALVIAN AI" className="h-12 w-12 rounded-2xl"/><div><div className="text-xl font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[9px] tracking-[.32em] text-zinc-500">MUSIC STUDIO</div></div></div>
          <div className="flex-1 overflow-y-auto p-3">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => id === "assistant" ? setChatOpen(true) : setActive(id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active === id ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-500/50 text-white shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={19}/><span>{label}</span>{id === "assistant" && <span className="ml-auto rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-200">PRO</span>}</button>)}</div>
          <div className="p-4"><div className="rounded-3xl border border-violet-400/15 bg-violet-500/5 p-4"><Sparkles size={17} className="text-violet-300"/><p className="mt-2 text-xs leading-5 text-zinc-500">Musik adalah bahasa jiwa. AI adalah alatnya.</p></div></div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-24">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#05050c]/85 px-4 py-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-2 lg:hidden"><img src="/salvian-ai-logo.svg" alt="SALVIAN AI" className="h-9 w-9 rounded-xl"/><div><div className="font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[8px] tracking-[.3em] text-zinc-500">MUSIC STUDIO</div></div></div><div className="hidden lg:block"><div className="text-[10px] font-bold uppercase tracking-[.3em] text-violet-300">AI Music Creation</div><div className="text-xl font-black">Studio AI Musik Kelas Premium</div></div><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-500/5 px-3 py-2 sm:flex"><span className="text-amber-300">◆</span><b>{credits === null ? "…" : credits}</b><span className="text-xs text-zinc-500">kredit</span><button onClick={() => setActive("monetize")} className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"><Plus size={15}/></button></div><div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2"><div className="flex items-center gap-1 text-xs font-black"><Crown size={14} className="text-amber-300"/> {plan === "FREE" ? "Premium" : plan}</div><div className="text-[9px] text-zinc-500">Studio Elite</div></div><button onClick={() => setActive("account")} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-zinc-900"><UserRound size={18}/></button></div></header>

          <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-7 lg:py-7">
            {notice && <div className="mb-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-xs text-violet-100">{notice}</div>}
            {active === "studio" && <>
              <section className="relative overflow-hidden rounded-[30px] border border-violet-400/20 bg-gradient-to-br from-[#17102f] via-[#0a0b18] to-[#080811] p-6 shadow-[0_25px_90px_rgba(67,30,130,.25)] sm:p-8"><div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl"/><div className="relative max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-violet-200"><Zap size={13}/> Teknologi AI untuk musik masa depan</div><h1 className="text-3xl font-black leading-tight sm:text-5xl">Studio <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">AI Musik</span><br/>kelas premium.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Ubah ide, lirik, karakter vokal, audio referensi dan gaya musik menjadi karya yang siap dikembangkan.</p><div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-zinc-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ Kualitas Studio</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ AI Terkini</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ Aman & Privat</span></div></div></section>
              <section className="mt-5 rounded-[26px] border border-violet-400/15 bg-[#090a13]/95 p-4 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-lg font-black"><Music2 size={20} className="text-violet-300"/> Deskripsi Musik</div><button onClick={() => setAdvanced(v => !v)} className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200"><WandSparkles size={14}/> Mode Advanced <span className={`h-4 w-7 rounded-full p-0.5 ${advanced ? "bg-violet-500" : "bg-zinc-700"}`}><span className={`block h-3 w-3 rounded-full bg-white ${advanced ? "translate-x-3" : ""}`}/></span></button></div><textarea value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 2000))} className="min-h-[130px] w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-7 outline-none placeholder:text-zinc-600" placeholder="Jelaskan genre, tema, suasana, instrumen, tempo, bahasa, dan karakter vokal…"/><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{presets.map(x => <button key={x} onClick={() => setPrompt(`${x}, kualitas studio premium, aransemen modern, vokal emosional, bass dan drum seimbang.`)} className="shrink-0 rounded-full border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-[11px] font-semibold text-violet-200">{x}</button>)}</div></section>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-[#090a13]/95 p-5"><div className="flex items-center justify-between"><div className="font-black">Audio Referensi</div><Headphones size={20} className="text-violet-300"/></div><p className="mt-2 text-xs text-zinc-500">MP3/M4A · referensi 30 detik · max 10 MB</p><input ref={fileReference} type="file" accept="audio/mp3,audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && void uploadFile(e.target.files[0], "reference")}/><button onClick={() => fileReference.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 py-3 text-xs font-bold"><Upload size={15}/> {referenceName || "Upload Referensi"}</button>{referenceId && <div className="mt-2 text-[10px] text-emerald-300">✓ Referensi siap digunakan</div>}</div>
                <div className="rounded-[24px] border border-white/10 bg-[#090a13]/95 p-5"><div className="flex items-center justify-between"><div className="font-black">Lirik Assistant <span className="ml-1 rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-200">PRO</span></div><WandSparkles size={20} className="text-fuchsia-300"/></div><p className="mt-2 text-xs text-zinc-500">Buat lirik original dari konsep musik.</p><button onClick={() => void generateLyrics()} disabled={lyricBusy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 py-3 text-xs font-bold disabled:opacity-50">{lyricBusy ? "Menulis…" : "Tulis dengan AI"}</button><button onClick={() => document.getElementById("lyrics-box")?.scrollIntoView({ behavior: "smooth" })} className="mt-2 w-full rounded-xl border border-white/10 py-3 text-xs">Tempel / Edit Lirik</button></div>
                <div className="rounded-[24px] border border-white/10 bg-[#090a13]/95 p-5"><div className="flex items-center justify-between"><div className="font-black">Voice & Vocal</div><Mic2 size={20} className="text-fuchsia-300"/></div><p className="mt-2 text-xs text-zinc-500">Buat karakter vokal dari sample 15–30 detik.</p><input ref={fileVocal} type="file" accept="audio/mp3,audio/m4a,.mp3,.m4a" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && void uploadFile(e.target.files[0], "voice")}/><button onClick={() => fileVocal.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 py-3 text-xs font-bold"><Upload size={15}/> {vocalName || "Upload Vocal"}</button>{vocalId && <div className="mt-2 text-[10px] text-emerald-300">✓ Karakter vokal siap digunakan</div>}</div>
              </div>
              <section className="mt-5 rounded-[26px] border border-white/10 bg-[#090a13]/95 p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-lg font-black"><Bot size={20} className="text-violet-300"/> Pilih Model AI</div><p className="mt-1 text-xs text-zinc-500">Standard, Pro, dan Adroit sudah terhubung ke model Mureka.</p></div></div><div className="grid gap-3 md:grid-cols-3">{modelCards.map(card => <button key={card.id} onClick={() => setModel(card.id)} className={`rounded-2xl border p-4 text-left transition ${model === card.id ? "border-violet-400 bg-violet-500/10 shadow-[0_0_35px_rgba(139,92,246,.18)]" : "border-white/10 bg-black/10"}`}><div className="flex items-center justify-between"><div className="font-black">{card.id}</div>{card.id === "Pro" && <span className="rounded-full bg-fuchsia-500 px-2 py-1 text-[8px] font-black">REKOMENDASI</span>}</div><div className="mt-1 text-xs text-zinc-400">{card.title}</div><ul className="mt-3 space-y-1 text-[11px] text-zinc-300">{card.points.map(p => <li key={p} className="flex gap-2"><Check size={13} className="mt-0.5 text-emerald-400"/>{p}</li>)}</ul></button>)}</div></section>
              <section id="lyrics-box" className="mt-5 rounded-[26px] border border-white/10 bg-[#090a13]/95 p-4 sm:p-6"><div className="mb-3 flex items-center gap-2 text-lg font-black"><Library size={20} className="text-fuchsia-300"/> Lirik Lagu</div><textarea value={lyrics} onChange={e => setLyrics(e.target.value.slice(0, 5000))} className="min-h-[210px] w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-7 outline-none placeholder:text-zinc-600" placeholder="Tulis atau buat lirik dengan Lirik Assistant…"/><div className="mt-2 text-right text-[10px] text-zinc-600">{lyrics.length}/5000</div></section>
              {advanced && <section className="mt-5 rounded-[26px] border border-white/10 bg-[#090a13]/95 p-4 sm:p-6"><button onClick={() => setAdvancedOpen(v => !v)} className="flex w-full items-center justify-between"><div><div className="flex items-center gap-2 text-lg font-black"><Settings2 size={20} className="text-violet-300"/> Pengaturan Lanjutan</div><div className="mt-1 text-xs text-zinc-500">Tempo, bahasa, gender, instrumental dan kontrol kreatif</div></div><ChevronDown size={20} className={`transition ${advancedOpen ? "rotate-180" : ""}`}/></button>{advancedOpen && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-zinc-400">Tempo <input type="range" min="60" max="180" value={tempo} onChange={e => setTempo(Number(e.target.value))} className="mt-3 w-full"/><span className="block mt-1 text-white">{tempo} BPM</span></label><label className="text-xs text-zinc-400">Bahasa<select value={language} onChange={e => setLanguage(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option>Indonesia</option><option>English</option><option>Melayu</option><option>Timur/NTT</option></select></label><label className="text-xs text-zinc-400">Karakter Vokal<select value={gender} onChange={e => setGender(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"><option value="female">Wanita</option><option value="male">Pria</option></select></label><button onClick={() => setInstrumental(v => !v)} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left text-xs"><b>Instrumental</b><span className={`ml-3 inline-block h-4 w-7 rounded-full p-0.5 ${instrumental ? "bg-violet-500" : "bg-zinc-700"}`}><span className={`block h-3 w-3 rounded-full bg-white ${instrumental ? "translate-x-3" : ""}`}/></span><span className="mt-2 block text-zinc-500">Tanpa vokal</span></button></div>}</section>}
              <button onClick={() => void generate()} disabled={busy} className="mt-6 flex w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 py-5 text-lg font-black shadow-[0_15px_55px_rgba(168,85,247,.32)] transition hover:scale-[1.005] disabled:cursor-wait disabled:opacity-50"><Music2 size={24}/>{busy ? "Mengirim ke Studio AI…" : "Buat Musik Sekarang"}<span>→</span></button>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["∞","Kreativitas"],["HD","Kualitas Studio"],["ϟ","Proses Cepat"],["◈","Aman & Privat"],["$","Siap Monetisasi"]].map(([a,b]) => <div key={b} className="rounded-2xl border border-white/10 bg-[#070810] p-3 text-center"><div className="text-xl font-black text-violet-300">{a}</div><div className="mt-1 text-[10px] text-zinc-500">{b}</div></div>)}</div>
            </>}
            {active === "assistant" && <section className="rounded-[30px] border border-violet-400/20 bg-[#090a13]/95 p-5 sm:p-8"><div className="flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Bot size={28}/></div><div><h2 className="text-3xl font-black">Asisten AI SALVIAN</h2><p className="text-sm text-zinc-500">Partner kreatif Anda di dalam studio.</p></div></div><div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5"><p className="text-sm leading-7 text-zinc-300">Klik "Mulai Chat" di panel Asisten AI untuk bertanya tentang ide musik, lirik, genre, vokal, kredit, Library, atau cara menggunakan aplikasi.</p><button onClick={() => setChatOpen(true)} className="mt-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-black"><MessageCircle size={16} className="mr-2 inline"/>Mulai Chat</button></div></section>}
            {active === "library" && <section className="rounded-[30px] border border-white/10 bg-[#090a13]/95 p-5 sm:p-8"><div className="flex items-center justify-between"><div><h2 className="text-3xl font-black">Library Musik</h2><p className="mt-1 text-sm text-zinc-500">Semua karya dari akun Anda.</p></div><button onClick={() => void loadLibrary()} className="rounded-xl border border-white/10 px-4 py-2 text-xs">Refresh</button></div><div className="mt-6 space-y-3">{projects.length ? projects.map(p => <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-500/10"><Music2 size={21} className="text-violet-300"/></div><div className="min-w-0 flex-1"><div className="truncate font-bold">{p.title}</div><div className="mt-1 text-[11px] text-zinc-500">{p.model} · {p.status}</div></div>{p.audio && <button onClick={() => togglePlay(p.audio!)} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold">{playing === p.audio ? <Pause size={15}/> : <Play size={15}/>}</button>}{p.audio && <a href={p.audio} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 p-2"><Download size={16}/></a>}</div>) : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">Belum ada project. Buat musik pertama Anda dari Studio.</div>}</div></section>}
            {(active === "models" || active === "style" || active === "voice" || active === "reference") && <section className="rounded-[30px] border border-white/10 bg-[#090a13]/95 p-5 sm:p-8"><h2 className="text-3xl font-black">{nav.find(x => x[0] === active)?.[1]}</h2><p className="mt-2 text-sm text-zinc-500">Semua kontrol utama sudah tersedia di Studio. Gunakan panel ini untuk kembali ke workspace utama.</p><button onClick={() => setActive("studio")} className="mt-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-black">Buka Studio</button></section>}
            {active === "monetize" && <section className="rounded-[30px] border border-fuchsia-400/20 bg-gradient-to-br from-[#170d25] to-[#080811] p-5 sm:p-8"><div className="flex items-center gap-3"><Crown className="text-amber-300"/><div><h2 className="text-3xl font-black">Monetisasi & Kredit</h2><p className="text-sm text-zinc-500">Akun induk SALVIAN AI CREATOR mengelola saldo dan pembelian kredit.</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="text-xs text-zinc-500">Saldo saat ini</div><div className="mt-2 text-4xl font-black text-violet-300">{credits === null ? "…" : credits}</div><div className="text-xs text-zinc-500">kredit pusat</div></div><div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5"><div className="font-black">Pro</div><p className="mt-2 text-xs text-zinc-400">Kualitas tinggi untuk creator aktif.</p></div><div className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-5"><div className="font-black">Adroit</div><p className="mt-2 text-xs text-zinc-400">Model paling elite untuk karya utama.</p></div></div><div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-5 text-sm text-zinc-300"><b>Catatan penting:</b> pembelian/top-up kredit tetap dilakukan melalui SALVIAN AI CREATOR sebagai akun induk. SALVIAN AI MUSIC hanya memakai saldo pusat yang sama.</div></section>}
            {active === "account" && <section className="rounded-[30px] border border-white/10 bg-[#090a13]/95 p-5 sm:p-8"><div className="flex items-center gap-4"><img src="/salvian-ai-logo.svg" alt="SALVIAN AI" className="h-16 w-16 rounded-2xl"/><div><h2 className="text-2xl font-black">{userName || "Akun SALVIAN AI"}</h2><p className="text-sm text-zinc-500">Akun induk · {plan} · {credits === null ? "…" : credits} kredit</p></div></div>{!token && <button onClick={() => { void syncSession(); }} className="mt-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-black"><LogIn size={16} className="mr-2 inline"/>Cek / Masuk Akun</button>}{token && <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">✓ Akun induk aktif dan saldo kredit tersambung.</div>}<div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-400">Gunakan akun SALVIAN AI CREATOR sebagai akun induk. Kredit, paket, dan Library terhubung ke akun yang sama.</div></section>}
          </div>
        </main>

        <aside className={`fixed right-3 top-20 z-50 w-[min(360px,calc(100vw-24px))] transition lg:sticky lg:top-[80px] lg:z-20 lg:mr-5 lg:mt-[80px] lg:h-[calc(100vh-110px)] lg:w-[330px] ${chatOpen ? "" : "pointer-events-none opacity-0 lg:pointer-events-auto lg:opacity-100"}`}><div className="flex h-[calc(100vh-110px)] max-h-[760px] flex-col overflow-hidden rounded-[26px] border border-violet-400/20 bg-[#080912]/95 shadow-[0_20px_80px_rgba(0,0,0,.55)] backdrop-blur-xl"><div className="flex items-center justify-between border-b border-white/10 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Bot size={23}/></div><div><div className="font-black">Asisten AI</div><div className="text-[10px] text-violet-300">Partner Kreatif Anda</div></div></div><button onClick={() => setChatOpen(false)} className="rounded-xl p-2 text-zinc-500 hover:bg-white/5 lg:hidden"><X size={17}/></button></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((m,i) => <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}><div className={m.role === "user" ? "max-w-[90%] rounded-2xl rounded-br-md bg-violet-600/30 px-3 py-2 text-xs leading-5" : "max-w-[95%] rounded-2xl rounded-bl-md border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-300"}>{m.content}</div></div>)}{chatBusy && <div className="text-xs text-zinc-500">Asisten sedang mengetik…</div>}</div><div className="border-t border-white/10 p-3"><div className="mb-2 grid gap-2">{["Buatkan ide lagu dangdut", "Tulis lirik tentang cinta", "Rekomendasi genre viral", "Buat prompt musik pesta"].map(q => <button key={q} onClick={() => setChatInput(q)} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-left text-[10px] text-zinc-400">{q}</button>)}</div><form onSubmit={ask} className="flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Tanya apa saja ke Asisten AI…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs outline-none"/><button disabled={!chatInput.trim() || chatBusy} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 disabled:opacity-40"><Send size={16}/></button></form></div></div></aside>
      </div>
      <button onClick={() => setChatOpen(true)} className="fixed bottom-20 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 shadow-xl lg:hidden" aria-label="Buka Asisten AI"><MessageCircle size={20}/></button>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 bg-[#05060d]/95 px-2 py-2 backdrop-blur-xl lg:hidden"><button onClick={() => setActive("studio")} className="p-2 text-violet-300"><Music2 size={20}/><span className="block text-[9px]">Studio</span></button><button onClick={() => setActive("library")} className="p-2 text-zinc-400"><Library size={20}/><span className="block text-[9px]">Library</span></button><button onClick={() => setActive("studio")} className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-[#02030a] bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(168,85,247,.5)]"><Music2 size={25}/></button><button onClick={() => setActive("monetize")} className="p-2 text-zinc-400"><WalletCards size={20}/><span className="block text-[9px]">Monetisasi</span></button><button onClick={() => setActive("account")} className="p-2 text-zinc-400"><UserRound size={20}/><span className="block text-[9px]">Akun</span></button></nav>
    </div>
  );
}
