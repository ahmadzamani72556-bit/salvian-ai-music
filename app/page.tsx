"use client";

import { useState } from "react";
import { AudioLines, ChevronDown, Home, Library, Mic2, Music2, Plus, Settings2, Sparkles, UserRound, WandSparkles, X } from "lucide-react";

const examples = [
  "Slow Rock Melayu, sedih dan menyentuh hati, vokal pria dewasa, suara lembut dan emosional, gitar elektrik clean, piano, bass lembut, drum pelan, suasana malam, 70 BPM.",
  "Dangdut Timur NTT, vokal wanita dewasa, ceria dan manja, kendang dangdut kuat, gitar elektrik, bass, keyboard, suasana pesta, tempo 110 BPM.",
  "Duet pria dan wanita, saling bersahutan, romantis dan sedih, Slow Rock Melayu, gitar akustik, piano, string lembut, chorus besar.",
];

export default function HomePage() {
  const [advanced, setAdvanced] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("");
  const [showModels, setShowModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const helpLyrics = () => {
    setBusy(true);
    setNotice("");
    setTimeout(() => {
      setLyrics("[Verse 1]\nMalam turun membawa rindu\nNamamu masih tinggal di kalbu\nWalau langkah kita telah berbeda\nHatiku belum mampu melupa\n\n[Chorus]\nJika waktu dapat berputar kembali\nKan kujaga cinta ini sepenuh hati");
      setBusy(false);
    }, 650);
  };

  const createSong = () => {
    if (!lyrics.trim() && !style.trim()) {
      setNotice("Isi lirik atau gaya musik terlebih dahulu.");
      return;
    }
    setBusy(true);
    setNotice("Menyiapkan project lagu…");
    setTimeout(() => {
      setBusy(false);
      setNotice("Project siap. Mesin audio akan terhubung pada tahap generasi berikutnya.");
    }, 900);
  };

  return (
    <main className="min-h-screen pb-24">
      <header className="glass sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black"><Music2 size={21}/></div>
            <div><div className="text-sm font-extrabold tracking-tight">SALVIAN AI</div><div className="text-[11px] text-zinc-400">MUSIC</div></div>
          </div>
          <button onClick={() => setAdvanced(!advanced)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${advanced ? "border-violet-400/50 bg-violet-500/15 text-violet-200" : "border-white/10 bg-white/5 text-zinc-300"}`}>
            <Settings2 size={15}/>{advanced ? "Advanced ON" : "Advanced"}
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-7">
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.25em] text-violet-300">Create your sound</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Ubah ide menjadi <span className="gradient-text">lagu.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Tulis lirik, jelaskan gaya dan karakter vokal. Sisanya kami siapkan dalam satu alur yang sederhana.</p>
        </div>

        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/7 px-4 py-4">
              <div className="flex items-center gap-2"><Music2 size={18}/><span className="font-bold">Lirik</span></div>
              <button onClick={helpLyrics} disabled={busy} className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200 disabled:opacity-50"><WandSparkles size={14}/> Bantu AI</button>
            </div>
            <textarea value={lyrics} onChange={e=>setLyrics(e.target.value)} placeholder="Tulis lirik lagu Anda, atau tulis ide ceritanya…" className="min-h-[230px] w-full resize-y bg-transparent p-4 text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600" />
            <div className="flex items-center justify-between border-t border-white/7 px-4 py-3 text-[11px] text-zinc-500"><span>💡 Lirik yang dihasilkan AI tetap bisa Anda edit.</span><span>{lyrics.length} karakter</span></div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-white/7 px-4 py-4"><div className="flex items-center gap-2 font-bold"><AudioLines size={18}/> Gaya &amp; Vokal</div><p className="mt-1 text-xs text-zinc-500">Gabungkan genre, suasana, instrumen, tempo, dan karakter vokal dalam satu deskripsi.</p></div>
            <textarea value={style} onChange={e=>setStyle(e.target.value)} placeholder="Contoh: Slow Rock Melayu, sedih dan menyentuh hati, vokal pria dewasa, gitar elektrik clean, piano, drum pelan, suasana malam, 70 BPM…" className="min-h-[150px] w-full resize-y bg-transparent p-4 text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600" />
            <div className="flex gap-2 overflow-x-auto px-4 pb-4">
              {examples.map((item,i)=><button key={i} onClick={()=>setStyle(item)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-zinc-300">Contoh {i+1}</button>)}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button className="card flex items-center gap-3 px-4 py-4 text-left"><Plus size={18}/><span><b className="block text-sm">Audio</b><small className="text-zinc-500">Tambah audio</small></span></button>
            <button className="card flex items-center gap-3 px-4 py-4 text-left"><Mic2 size={18}/><span><b className="block text-sm">Voice</b><small className="text-zinc-500">Karakter suara</small></span></button>
            <button onClick={()=>setShowModels(true)} className="card flex items-center justify-between px-4 py-4 text-left sm:col-span-2"><span><b className="block text-sm">Model</b><small className="text-zinc-500">v5.5 Pro · pilihan model AI</small></span><ChevronDown size={17}/></button>
          </div>

          {advanced && <section className="card p-4">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Advanced</h2><p className="text-xs text-zinc-500">Kontrol tambahan untuk pengguna berpengalaman.</p></div><Settings2 size={18} className="text-violet-300"/></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Instrumental","Tanpa vokal"],["Variasi","2 hasil"],["Kreativitas","Balanced"]].map(([a,b])=><div key={a} className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="text-xs text-zinc-500">{a}</div><div className="mt-1 font-semibold">{b}</div></div>)}
            </div>
          </section>}

          {notice && <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{notice}</div>}

          <button onClick={createSong} disabled={busy} className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-extrabold text-black shadow-[0_12px_45px_rgba(255,255,255,.08)] transition hover:scale-[1.01] disabled:opacity-60"><Sparkles size={18} className="transition group-hover:rotate-12"/>{busy ? "Memproses…" : "Buat Lagu"}</button>
        </div>
      </section>

      {showModels && <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-3 sm:place-items-center">
        <div className="card w-full max-w-md p-4">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Pilih Model</h3><p className="text-xs text-zinc-500">Model dapat diperluas saat engine tersedia.</p></div><button onClick={()=>setShowModels(false)} className="rounded-full p-2 hover:bg-white/10"><X size={18}/></button></div>
          {['v5.5 Pro','v5 Pro','v4.5+','v4.5','v4.5-all','Lyrics Model Classic'].map((m,i)=><button key={m} onClick={()=>setShowModels(false)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm ${i===0?'bg-violet-500/15 text-violet-200':'hover:bg-white/5'}`}><span>{m}</span>{i===0&&<span className="text-[10px] font-bold">AKTIF</span>}</button>)}
        </div>
      </div>}

      <nav className="glass fixed bottom-0 left-0 right-0 z-40 border-t border-white/10">
        <div className="mx-auto grid max-w-5xl grid-cols-4 px-2 py-2">
          {[[Home,'Buat'],[Library,'Library'],[Music2,'Proyek'],[UserRound,'Profil']].map(([Icon,label],i)=><button key={label as string} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${i===0?'text-white':'text-zinc-500'}`}><Icon size={18}/><span>{label as string}</span></button>)}
        </div>
      </nav>
    </main>
  );
}
