"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@neondatabase/neon-js";
import {
  AudioLines,
  Bot,
  Crown,
  Download,
  Gift,
  Headphones,
  Home,
  Library,
  Mic2,
  Music2,
  Plus,
  Settings2,
  Sparkles,
  UserRound,
  WalletCards,
  WandSparkles,
  Zap,
} from "lucide-react";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });

type Model = "Standard" | "Pro" | "Adroit";

const promptPresets = ["Dangdut Remix", "Slow Rock", "Sholawat", "Pop Ballad", "DJ Remix", "Timur NTT"];

export default function PremiumMusicStudio() {
  const [model, setModel] = useState<Model>("Pro");
  const [advanced, setAdvanced] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [active, setActive] = useState("studio");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await neon.auth.getSession();
        if (!session?.data?.user) return;
        const authWithJwt = neon.auth as unknown as { getJWTToken?: () => Promise<string | null> };
        if (!authWithJwt.getJWTToken) return;
        const jwt = await authWithJwt.getJWTToken();
        if (!jwt) return;
        const res = await fetch("/api/music", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ action: "balance" }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (mounted && res.ok && typeof data.credits === "number") setCredits(data.credits);
      } catch {
        // Visual studio shell must remain available even when account data is unavailable.
      }
    })();
    return () => { mounted = false; };
  }, []);

  const modelInfo = useMemo(() => ({
    Standard: { label: "Cepat & Efisien", detail: "Hemat kredit untuk ide cepat", badge: "STANDARD" },
    Pro: { label: "Kualitas Lebih Tinggi", detail: "Audio lebih jernih dan struktur musik lebih detail", badge: "RECOMMENDED" },
    Adroit: { label: "Model Paling Elite", detail: "Kualitas studio profesional untuk karya utama", badge: "ELITE" },
  }[model]), [model]);

  const nav = [
    { id: "studio", label: "Buat Musik", icon: Music2 },
    { id: "library", label: "Library", icon: Library },
    { id: "models", label: "Model AI", icon: Bot },
    { id: "style", label: "Style & Genre", icon: AudioLines },
    { id: "voice", label: "Voice & Vocal", icon: Mic2 },
    { id: "reference", label: "Audio Referensi", icon: Headphones },
    { id: "monetize", label: "Monetisasi", icon: WalletCards },
    { id: "account", label: "Akun", icon: UserRound },
  ];

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-[#03030a] text-white" data-premium-studio>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.22),transparent_32%),radial-gradient(circle_at_30%_70%,rgba(37,99,235,.12),transparent_35%)]" />
      <div className="relative flex h-full min-h-0">
        <aside className="hidden w-[248px] shrink-0 border-r border-white/10 bg-[#050611]/95 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-blue-500 shadow-[0_0_35px_rgba(139,92,246,.45)]">
              <Headphones size={27} strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-xl font-black tracking-tight">SALVIAN <span className="text-violet-300">AI</span></div>
              <div className="text-[9px] font-semibold tracking-[.34em] text-zinc-500">MUSIC STUDIO</div>
            </div>
          </div>

          <div className="px-3 py-5">
            {nav.map(item => {
              const Icon = item.icon;
              const selected = active === item.id || (item.id === "studio" && active === "studio");
              return (
                <button key={item.id} onClick={() => setActive(item.id)} className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${selected ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-500/60 text-white shadow-[0_8px_30px_rgba(124,58,237,.25)]" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {(item.id === "models" || item.id === "monetize") && <span className="ml-auto rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-200">{item.id === "models" ? "PRO" : "$"}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-auto p-5">
            <div className="rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4">
              <Sparkles size={18} className="mb-3 text-violet-300" />
              <p className="text-xs leading-5 text-zinc-400">Setiap nada adalah cerita, setiap lagu adalah kehidupan.</p>
              <div className="mt-4 text-[10px] font-bold tracking-[.22em] text-violet-300">SALVIAN AI</div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto pb-24">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-[#05050c]/85 px-4 py-4 backdrop-blur-xl sm:px-7">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500"><Headphones size={21}/></div>
              <div><div className="font-black">SALVIAN <span className="text-violet-300">AI</span></div><div className="text-[8px] tracking-[.3em] text-zinc-500">MUSIC STUDIO</div></div>
            </div>
            <div className="hidden lg:block"><p className="text-xs font-semibold uppercase tracking-[.28em] text-violet-300">AI Music Creation</p><h1 className="mt-1 text-xl font-black">Studio AI Musik Kelas Premium</h1></div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 sm:flex"><span className="text-amber-300">◆</span><span className="text-sm font-bold">{credits ?? 95} kredit</span><button className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"><Plus size={15}/></button></div>
              <div className="flex items-center gap-2 rounded-2xl border border-fuchsia-400/35 bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10 px-3 py-2.5"><Crown size={16} className="text-amber-300"/><div className="hidden sm:block"><div className="text-xs font-black">Premium</div><div className="text-[9px] text-zinc-500">Studio Elite</div></div></div>
              <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-700 to-zinc-950"><UserRound size={19}/></div>
            </div>
          </header>

          <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-7 lg:py-7">
            <div className="relative overflow-hidden rounded-[30px] border border-violet-400/20 bg-gradient-to-br from-[#15102b] via-[#0a0b18] to-[#080811] p-6 shadow-[0_25px_90px_rgba(67,30,130,.22)] sm:p-8">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
              <div className="absolute right-[18%] top-5 hidden h-28 w-28 rounded-full border border-violet-400/20 bg-violet-500/10 blur-sm sm:block" />
              <div className="relative max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-violet-200"><Zap size={13}/> Teknologi AI untuk musik masa depan</div>
                <h2 className="text-3xl font-black leading-tight sm:text-5xl">Studio <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">AI Musik</span><br/>kelas premium.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Ubah ide, lirik, karakter vokal, referensi audio dan gaya musik menjadi karya yang siap dikembangkan.</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-zinc-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ Kualitas Studio</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ AI Terkini</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">✦ Aman & Privat</span></div>
              </div>
              <div className="pointer-events-none absolute bottom-5 right-8 hidden text-right lg:block"><div className="text-6xl font-black tracking-tighter text-white/5">SALVIAN</div><div className="text-xs tracking-[.45em] text-violet-300/50">MUSIC STUDIO</div></div>
            </div>

            <section className="mt-5 rounded-[26px] border border-violet-400/15 bg-[#090a13]/90 p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between"><div><div className="flex items-center gap-2 text-lg font-black"><Music2 size={20} className="text-violet-300"/> Deskripsi Musik</div><p className="mt-1 text-xs text-zinc-500">Jelaskan musik yang ingin Anda ciptakan.</p></div><button onClick={() => setAdvanced(v => !v)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${advanced ? "border-violet-400/40 bg-violet-500/15 text-violet-200" : "border-white/10 bg-white/5 text-zinc-400"}`}><WandSparkles size={14}/> Advanced <span className={`h-4 w-7 rounded-full p-0.5 ${advanced ? "bg-violet-500" : "bg-zinc-700"}`}><span className={`block h-3 w-3 rounded-full bg-white transition ${advanced ? "translate-x-3" : ""}`} /></span></button></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><textarea value={prompt} onChange={e => setPrompt(e.target.value.slice(0,2000))} className="min-h-[150px] w-full resize-none bg-transparent text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600" placeholder="Jelaskan jenis musik, tema, suasana, instrumen, tempo, bahasa, dan karakter vokal dalam satu deskripsi…"/><div className="mt-2 text-right text-[10px] text-zinc-600">{prompt.length}/2000</div></div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{promptPresets.map(x => <button key={x} onClick={() => setPrompt(`${x}, kualitas studio premium, vokal emosional, aransemen modern, bass dan drum seimbang.`)} className="shrink-0 rounded-full border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/15">{x}</button>)}</div>
            </section>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <button className="group rounded-[24px] border border-white/10 bg-[#090a13]/90 p-5 text-left hover:border-violet-400/30"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Plus size={23}/></div><div className="font-black">Audio Referensi</div><p className="mt-1 text-xs leading-5 text-zinc-500">MP3, WAV, M4A · siapkan referensi suara.</p></button>
              <button className="group rounded-[24px] border border-white/10 bg-[#090a13]/90 p-5 text-left hover:border-violet-400/30"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-200"><Mic2 size={23}/></div><div className="font-black">Karakter Suara</div><p className="mt-1 text-xs leading-5 text-zinc-500">Pilih karakter vokal dan nuansa suara.</p></button>
              <button className="group rounded-[24px] border border-white/10 bg-[#090a13]/90 p-5 text-left hover:border-violet-400/30"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-200"><WandSparkles size={23}/></div><div className="font-black">Lirik Assistant</div><p className="mt-1 text-xs leading-5 text-zinc-500">Bantu susun lirik yang sesuai konsep musik.</p></button>
            </div>

            <section className="mt-5 rounded-[26px] border border-white/10 bg-[#090a13]/90 p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-lg font-black"><Bot size={20} className="text-violet-300"/> Pilih Model AI</div><p className="mt-1 text-xs text-zinc-500">Pilih tingkat kualitas sesuai kebutuhan karya.</p></div><span className="hidden text-xs font-bold text-violet-300 sm:block">Perbandingan Model</span></div>
              <div className="grid gap-3 md:grid-cols-3">
                {(["Standard", "Pro", "Adroit"] as Model[]).map(m => { const info = { Standard: { icon: Settings2, tone: "blue", title: "Cepat & Efisien", desc: "Hemat kredit untuk ide cepat" }, Pro: { icon: Crown, tone: "violet", title: "Kualitas Lebih Tinggi", desc: "Audio lebih jernih & detail" }, Adroit: { icon: Sparkles, tone: "amber", title: "Model Paling Elite", desc: "Kualitas studio profesional" } }[m]; const Icon = info.icon; const selected = model === m; return <button key={m} onClick={() => setModel(m)} className={`relative rounded-3xl border p-5 text-left transition ${selected ? "border-violet-400/70 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/5 shadow-[0_0_35px_rgba(124,58,237,.14)]" : "border-white/10 bg-black/15 hover:border-white/20"}`}><div className="flex items-start justify-between"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${m === "Adroit" ? "bg-amber-400/15 text-amber-300" : m === "Pro" ? "bg-violet-500/15 text-violet-200" : "bg-blue-500/15 text-blue-200"}`}><Icon size={22}/></div><span className={`h-5 w-5 rounded-full border-2 ${selected ? "border-violet-300 bg-violet-500 shadow-[0_0_14px_rgba(139,92,246,.7)]" : "border-zinc-600"}`} /></div><div className="mt-4 text-lg font-black">{m}{m === "Pro" && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-1 text-[8px] text-violet-200">RECOMMENDED</span>}{m === "Adroit" && <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-1 text-[8px] text-amber-300">ELITE</span>}</div><div className="mt-1 text-xs font-semibold text-zinc-300">{info.title}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{info.desc}</p><div className="mt-4 space-y-1 text-[11px] text-zinc-400"><div>✓ Kualitas audio {m === "Adroit" ? "studio" : "tinggi"}</div><div>✓ Struktur musik lebih detail</div><div>✓ Cocok untuk karya {m === "Standard" ? "cepat" : "profesional"}</div></div></button> })}
              </div>
            </section>

            <button className="mt-5 flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-[#090a13]/90 px-5 py-4 text-left hover:border-violet-400/25"><span className="flex items-center gap-3"><Settings2 size={20} className="text-violet-300"/><span><b className="block text-sm">Pengaturan Lanjutan</b><small className="text-zinc-500">Tempo, instrumen, bahasa, genre, struktur dan lainnya</small></span></span><span className="text-xs text-zinc-500">{modelInfo.badge}</span></button>

            <div className="mt-5 rounded-[28px] border border-violet-300/25 bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-500 p-[1px] shadow-[0_12px_60px_rgba(124,58,237,.25)]"><button className="flex w-full items-center justify-center gap-3 rounded-[27px] bg-gradient-to-r from-blue-500/95 via-violet-600/95 to-fuchsia-500/95 px-5 py-5 text-base font-black sm:text-lg"><Music2 size={22}/> Buat Musik Sekarang <span>→</span></button></div>
            <p className="mt-3 text-center text-[11px] text-zinc-600">Studio generation akan diaktifkan setelah tampilan premium selesai.</p>

            <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4 text-center"><Sparkles className="mx-auto mb-2 text-violet-300" size={20}/><div className="text-xs font-bold">Kreativitas Tanpa Batas</div></div><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4 text-center"><AudioLines className="mx-auto mb-2 text-blue-300" size={20}/><div className="text-xs font-bold">Kualitas Studio</div></div><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4 text-center"><Zap className="mx-auto mb-2 text-fuchsia-300" size={20}/><div className="text-xs font-bold">Cepat & Stabil</div></div><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4 text-center"><WalletCards className="mx-auto mb-2 text-amber-300" size={20}/><div className="text-xs font-bold">Siap Monetisasi</div></div></section>

            {active === "monetize" && <div className="mt-5 rounded-[26px] border border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-violet-500/10 p-6"><div className="flex items-center gap-3"><WalletCards className="text-amber-300"/><h3 className="text-xl font-black">Monetisasi</h3></div><p className="mt-2 text-sm text-zinc-400">Ruang untuk paket kredit, Pro, Adroit, penjualan karya dan fitur komersial. Pembelian kredit tetap dikelola melalui akun induk SALVIAN AI CREATOR.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-bold">Standard</div><div className="mt-1 text-xs text-zinc-500">Untuk eksplorasi</div></div><div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4"><div className="font-bold">Pro</div><div className="mt-1 text-xs text-zinc-500">Untuk creator aktif</div></div><div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4"><div className="font-bold text-amber-200">Adroit</div><div className="mt-1 text-xs text-zinc-500">Untuk karya premium</div></div></div></div>}
          </main>
        </section>
      </div>

      <nav className="absolute bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#05050c]/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1"><button onClick={() => setActive("studio")} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] ${active === "studio" ? "text-violet-200" : "text-zinc-500"}`}><Home size={18}/><span>Buat</span></button><button onClick={() => setActive("library")} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] text-zinc-500"><Library size={18}/><span>Library</span></button><button onClick={() => setActive("models")} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] text-zinc-500"><div className="-mt-6 grid h-12 w-12 place-items-center rounded-full border-4 border-[#05050c] bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(139,92,246,.5)]"><Music2 size={22}/></div><span>Studio</span></button><button onClick={() => setActive("monetize")} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] text-zinc-500"><WalletCards size={18}/><span>Monetisasi</span></button><button onClick={() => setActive("account")} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] text-zinc-500"><UserRound size={18}/><span>Akun</span></button></div>
      </nav>
    </div>
  );
}
