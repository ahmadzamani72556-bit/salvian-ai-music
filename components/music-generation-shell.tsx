"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Download, Music2, Play, RotateCcw, Trash2 } from "lucide-react";

type Phase = "idle" | "loading" | "result" | "error";
type GeneratedSong = { id: string; title: string; audio: string; createdAt: number };

const STORAGE_KEY = "salvian-ai-music-results-v1";

export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Menyiapkan musik…");
  const [title, setTitle] = useState("Hasil Musik AI");
  const [error, setError] = useState("");
  const [songs, setSongs] = useState<GeneratedSong[]>([]);
  const generationRef = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        const restored = saved.filter(item => item?.audio && item?.title);
        setSongs(restored);
        if (restored.length > 0) setPhase("result");
      }
    } catch {
      // Ignore malformed local history and keep the studio usable.
    }
  }, []);

  const persistSongs = (next: GeneratedSong[]) => {
    setSongs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The visible result remains available even if storage is unavailable.
    }
  };

  const addSong = (audio: string, songTitle: string) => {
    if (!audio) return;
    const song: GeneratedSong = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: songTitle || "Hasil Musik AI",
      audio,
      createdAt: Date.now(),
    };
    setSongs(previous => {
      const next = [song, ...previous];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the in-memory history when persistent storage is unavailable.
      }
      return next;
    });
  };

  const deleteSong = (id: string) => {
    setSongs(previous => {
      const next = previous.filter(song => song.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the UI deletion even if storage is unavailable.
      }
      return next;
    });
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const monitorGeneration = async (response: Response, endpoint: string, headers: HeadersInit) => {
      const data = await response.clone().json().catch(() => ({}));
      if (!response.ok) {
        const message = String(data?.error || "Pembuatan musik gagal.");
        setError(message);
        setStatus(message);
        setPhase("error");
        return;
      }

      const songTitle = title || "Hasil Musik AI";
      if (data?.audio) {
        addSong(String(data.audio), songTitle);
        setStatus("Musik selesai.");
        setPhase("result");
        return;
      }

      const taskId = String(data?.taskId || "");
      if (!taskId) {
        setStatus("Permintaan musik diterima.");
        return;
      }

      setStatus("Mesin sedang menyusun musik…");
      const run = generationRef.current;
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 6000));
        if (generationRef.current !== run) return;
        try {
          const statusResponse = await originalFetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "status", taskId }),
          });
          const statusData = await statusResponse.json().catch(() => ({}));
          if (!statusResponse.ok) throw new Error(String(statusData?.error || "Status musik gagal dibaca."));
          if (statusData?.finished) {
            if (statusData?.audio) {
              addSong(String(statusData.audio), songTitle);
              setStatus("Musik selesai.");
              setPhase("result");
            } else if (statusData?.failed) {
              const message = String(statusData?.error || "Mesin musik gagal membuat lagu.");
              setError(message);
              setStatus(message);
              setPhase("error");
            } else {
              setStatus("Proses musik selesai.");
            }
            return;
          }
          setStatus(`Musik sedang dibuat… ${String(statusData?.status || "diproses")}`);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Memeriksa proses musik…");
        }
      }
      setStatus("Proses masih berjalan. Silakan tunggu atau kembali ke Studio.");
    };

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const body = typeof init?.body === "string" ? init.body : "";
      const isMusicRequest = method === "POST" && (url.includes("/api/music") || url.includes("/api/music/instrumental")) && !body.includes('"action":"status"');
      const response = await originalFetch(input, init);

      if (isMusicRequest && generationRef.current > 0) {
        const endpoint = url.includes("/api/music/instrumental") ? "/api/music/instrumental" : "/api/music";
        const headers = init?.headers || {};
        void monitorGeneration(response, endpoint, headers);
      }
      return response;
    };

    window.fetch = wrappedFetch;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button || button.disabled) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      if (!label.includes("Buat Musik")) return;

      const textareas = Array.from(document.querySelectorAll("textarea"));
      const lyricValue = (textareas[1] as HTMLTextAreaElement | undefined)?.value?.trim() || "";
      const instrumental = Array.from(document.querySelectorAll('input[type="checkbox"]')).some(input => (input as HTMLInputElement).checked);
      if (!lyricValue && !instrumental) return;

      generationRef.current += 1;
      setError("");
      setTitle((lyricValue.split("\n").find(Boolean) || "Hasil Musik AI").replace(/^\[.*?\]\s*/, "").slice(0, 70));
      setStatus("Mengirim musik ke mesin AI…");
      setPhase("loading");
    };

    document.addEventListener("click", onClick, true);
    return () => {
      generationRef.current += 1;
      document.removeEventListener("click", onClick, true);
      window.fetch = originalFetch;
    };
  }, [title]);

  // Navigation between the two screens must not delete history or cancel an active generation.
  const showStudio = () => setPhase("idle");
  const showResults = () => setPhase("result");

  const reset = () => {
    // Back to Studio only changes the visible screen. It intentionally does not
    // increment generationRef, so an active music task can continue in the background.
    showStudio();
    setError("");
  };

  const results = songs.map(song => (
    <article key={song.id} className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600/15 ring-1 ring-violet-400/20">
          <Music2 size={20} className="text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-bold sm:text-lg">{song.title}</h2>
          <p className="mt-1 text-xs text-zinc-500">Tersimpan di layar hasil lagu</p>
        </div>
        <button type="button" onClick={() => deleteSong(song.id)} aria-label={`Hapus ${song.title}`} className="rounded-xl p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300">
          <Trash2 size={18} />
        </button>
      </div>
      <audio controls src={song.audio} className="mt-5 w-full" />
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={song.audio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold hover:bg-violet-500">
          <Play size={16} /> Putar Lagu
        </a>
        <a href={song.audio} download className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold hover:bg-white/10">
          <Download size={16} /> Simpan Hasil
        </a>
      </div>
    </article>
  ));

  return (
    <>
      {children}

      {/* Screen 1 navigation: visible only when the studio is active. */}
      {phase === "idle" && songs.length > 0 && (
        <button
          type="button"
          onClick={showResults}
          className="fixed bottom-5 right-5 z-[90] inline-flex items-center gap-2 rounded-2xl border border-violet-300/20 bg-[#0b0b16]/95 px-4 py-3 text-sm font-bold text-white shadow-2xl shadow-violet-950/30 backdrop-blur-xl hover:bg-violet-600/20"
        >
          <Music2 size={17} className="text-violet-300" />
          Layar 2 · Hasil Lagu ({songs.length})
        </button>
      )}

      {phase !== "idle" && (
        <div className="fixed inset-0 z-[100] min-h-[100dvh] w-screen overflow-y-auto bg-[#02030a] text-white">
          <div className="flex min-h-[100dvh] w-full items-start justify-center p-4 sm:p-8">
            <section className="w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#080912]/95 p-5 shadow-2xl shadow-violet-950/30 backdrop-blur-xl sm:p-8">
              {/* Persistent screen switcher: Screen 1 and Screen 2 are always reachable. */}
              <div className="mb-6 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-1">
                <button
                  type="button"
                  onClick={showStudio}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  Layar 1 · Studio
                </button>
                <button
                  type="button"
                  onClick={showResults}
                  className="flex-1 rounded-xl bg-violet-600/20 px-4 py-2.5 text-sm font-bold text-violet-200 ring-1 ring-violet-400/20"
                >
                  Layar 2 · Hasil ({songs.length})
                </button>
              </div>

              {phase === "loading" && (
                <div className="text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-600/15 ring-1 ring-violet-400/20">
                    <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-violet-300" />
                  </div>
                  <p className="mt-7 text-xs font-bold uppercase tracking-[.28em] text-violet-300">Music Creator</p>
                  <h1 className="mt-3 text-2xl font-black sm:text-3xl">Pembuatan musik</h1>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">{status}</p>
                  <div className="mx-auto mt-8 h-2 w-full max-w-xl overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" />
                  </div>
                </div>
              )}

              {phase === "error" && (
                <div className="text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-300 ring-1 ring-red-400/20">!</div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[.28em] text-red-300">Pembuatan musik</p>
                  <h1 className="mt-2 text-2xl font-black">Terjadi kendala</h1>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">{error || status}</p>
                </div>
              )}

              {phase === "result" && (
                <div className="mb-7 text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-600/15 ring-1 ring-violet-400/20">
                    <Music2 size={34} className="text-violet-300" />
                  </div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[.28em] text-violet-300">Hasil Lagu</p>
                  <h1 className="mt-2 text-2xl font-black sm:text-3xl">Lagu berhasil dibuat</h1>
                </div>
              )}

              {songs.length > 0 && (
                <div className={phase === "loading" ? "mt-10" : "mt-2"}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.22em] text-violet-300">Hasil Lagu</p>
                      <h2 className="mt-1 text-xl font-black">Tersimpan</h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">{songs.length} lagu</span>
                  </div>
                  <div className="grid gap-4">{results}</div>
                </div>
              )}

              {songs.length === 0 && phase !== "loading" && phase !== "error" && (
                <p className="text-center text-sm text-zinc-500">Belum ada hasil lagu.</p>
              )}

              <button type="button" onClick={reset} className="mx-auto mt-7 flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5">
                <RotateCcw size={16} /> Kembali ke Studio
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
