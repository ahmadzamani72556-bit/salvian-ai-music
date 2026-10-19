"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Download, Music2, Play, RotateCcw } from "lucide-react";

type Phase = "idle" | "loading" | "result" | "error";

export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Menyiapkan musik…");
  const [audio, setAudio] = useState("");
  const [title, setTitle] = useState("Hasil Musik AI");
  const [error, setError] = useState("");
  const generationRef = useRef(0);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const monitorGeneration = async (response: Response, endpoint: string, headers: HeadersInit, requestBody: string) => {
      const data = await response.clone().json().catch(() => ({}));
      if (!response.ok) {
        const message = String(data?.error || "Pembuatan musik gagal.");
        setError(message);
        setStatus(message);
        setPhase("error");
        return;
      }

      if (data?.audio) {
        setAudio(String(data.audio));
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
              setAudio(String(statusData.audio));
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
        void monitorGeneration(response, endpoint, headers, body);
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
      setAudio("");
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
  }, []);

  const reset = () => {
    generationRef.current += 1;
    setPhase("idle");
    setAudio("");
    setError("");
  };

  return (
    <>
      {children}
      {phase !== "idle" && (
        <div className="fixed inset-0 z-[100] min-h-[100dvh] w-screen overflow-y-auto bg-[#02030a] text-white">
          <div className="flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-8">
            <section className="w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#080912]/95 p-6 shadow-2xl shadow-violet-950/30 backdrop-blur-xl sm:p-10">
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
                  <p className="mt-4 text-xs text-zinc-600">Proses dipantau otomatis sampai hasil lagu tersedia.</p>
                </div>
              )}

              {phase === "result" && (
                <div>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-600/15 ring-1 ring-violet-400/20">
                      <Music2 size={34} className="text-violet-300" />
                    </div>
                    <p className="mt-6 text-xs font-bold uppercase tracking-[.28em] text-violet-300">Hasil Lagu</p>
                    <h1 className="mt-2 max-w-2xl break-words text-2xl font-black sm:text-3xl">{title}</h1>
                  </div>
                  <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-6">
                    <audio controls autoPlay src={audio} className="w-full" />
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                      <a href={audio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold hover:bg-violet-500">
                        <Play size={17} /> Putar Lagu
                      </a>
                      <a href={audio} download className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold hover:bg-white/10">
                        <Download size={17} /> Simpan Hasil
                      </a>
                    </div>
                  </div>
                  <button onClick={reset} className="mx-auto mt-6 flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5">
                    <RotateCcw size={16} /> Kembali ke Studio
                  </button>
                </div>
              )}

              {phase === "error" && (
                <div className="text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-300 ring-1 ring-red-400/20">!</div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[.28em] text-red-300">Pembuatan musik</p>
                  <h1 className="mt-2 text-2xl font-black">Terjadi kendala</h1>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">{error || status}</p>
                  <button onClick={reset} className="mx-auto mt-7 flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold hover:bg-white/5">
                    <RotateCcw size={16} /> Kembali ke Studio
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
