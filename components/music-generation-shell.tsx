"use client";

import { ReactNode, useEffect, useState } from "react";
import { ArrowLeft, Download, Headphones, LoaderCircle, Music2, Play } from "lucide-react";

type Project = {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  model: string;
  status: string;
  audio?: string | null;
  task_id?: string | null;
  created_at?: string;
};
type Phase = "studio" | "results";

export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("studio");
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState("Hasil dan proses pembuatan lagu akan tampil di halaman ini.");
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onResults = (event: Event) => {
      const detail = (event as CustomEvent<{ projects?: Project[] }>).detail;
      if (Array.isArray(detail?.projects)) setProjects(detail.projects);
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ generating?: boolean; failed?: boolean; status?: string }>).detail;
      if (typeof detail?.status === "string") setStatus(detail.status);
      if (typeof detail?.generating === "boolean") setGenerating(detail.generating);
      setFailed(Boolean(detail?.failed));
    };
    const onShowResults = () => {
      setPhase("results");
      window.dispatchEvent(new CustomEvent("salvian-music-refresh-library"));
    };
    const onShowStudio = () => setPhase("studio");

    window.addEventListener("salvian-music-results-update", onResults);
    window.addEventListener("salvian-music-generation-status", onStatus);
    window.addEventListener("salvian-music-show-results", onShowResults);
    window.addEventListener("salvian-music-show-studio", onShowStudio);
    return () => {
      window.removeEventListener("salvian-music-results-update", onResults);
      window.removeEventListener("salvian-music-generation-status", onStatus);
      window.removeEventListener("salvian-music-show-results", onShowResults);
      window.removeEventListener("salvian-music-show-studio", onShowStudio);
    };
  }, []);

  const showResults = () => {
    setPhase("results");
    window.dispatchEvent(new CustomEvent("salvian-music-refresh-library"));
  };
  const showStudio = () => setPhase("studio");

  return (
    <>
      {children}

      {phase === "studio" && (
        <button
          type="button"
          onClick={showResults}
          aria-label="Buka halaman hasil lagu dan proses pembuatan musik"
          className="fixed bottom-[5.75rem] right-3 z-[90] inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-violet-300/25 bg-[#0b0b16]/95 px-4 py-3 text-sm font-bold text-white shadow-2xl shadow-violet-950/40 backdrop-blur-xl transition hover:border-violet-300/50 hover:bg-violet-600/20 lg:bottom-5 lg:right-5"
        >
          {generating ? <LoaderCircle size={18} className="animate-spin text-violet-300" /> : <Headphones size={18} className="text-violet-300" />}
          <span>Hasil Lagu &amp; Proses</span>
          {projects.length > 0 && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-100">{projects.length}</span>}
        </button>
      )}

      {phase === "results" && (
        <div className="fixed inset-0 z-[100] min-h-[100dvh] w-screen overflow-y-auto bg-[#02030a] text-white">
          <div className="mx-auto min-h-[100dvh] w-full max-w-4xl p-4 pb-8 sm:p-8">
            <section className="rounded-[28px] border border-white/10 bg-[#080912]/95 p-5 shadow-2xl shadow-violet-950/30 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.28em] text-violet-300">Music Creator · Layar 2</p>
                  <h1 className="mt-2 text-2xl font-black sm:text-3xl">Hasil Lagu &amp; Proses</h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">Pantau proses pembuatan dan buka hasil lagu yang tersimpan di Library Music.</p>
                </div>
                <Music2 size={30} className="shrink-0 text-violet-300" />
              </div>

              <div className="mb-6 flex rounded-2xl border border-white/10 bg-black/20 p-1">
                <button type="button" onClick={showStudio} className="flex-1 rounded-xl px-3 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white">
                  <ArrowLeft size={16} className="mr-2 inline" />Layar 1 · Studio
                </button>
                <div className="flex-1 rounded-xl bg-violet-600/20 px-3 py-3 text-center text-sm font-bold text-violet-200 ring-1 ring-violet-400/20">
                  Layar 2 · Hasil ({projects.length})
                </div>
              </div>

              <div className={`mb-6 rounded-2xl border px-4 py-4 ${failed ? "border-red-400/25 bg-red-500/5" : generating ? "border-violet-400/25 bg-violet-500/10" : "border-white/10 bg-white/[.03]"}`}>
                <div className="flex items-start gap-3">
                  {generating ? <LoaderCircle size={20} className="mt-0.5 shrink-0 animate-spin text-violet-300" /> : <Music2 size={20} className={`mt-0.5 shrink-0 ${failed ? "text-red-300" : "text-violet-300"}`} />}
                  <div className="min-w-0">
                    <p className="font-bold">{generating ? "Musik sedang diproses" : failed ? "Proses mengalami kendala" : "Status terbaru"}</p>
                    <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{status}</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Library Music</p>
                  <h2 className="mt-1 text-xl font-black">Karya dan hasil lagu</h2>
                </div>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("salvian-music-refresh-library"))} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/5">Refresh</button>
              </div>

              {projects.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
                  <Music2 size={28} className="mx-auto text-zinc-600" />
                  <p className="mt-3 text-sm font-semibold text-zinc-300">Belum ada hasil lagu di Library.</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Mulai pembuatan lagu dari Studio. Proses dan hasilnya akan ditampilkan di halaman ini.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map(project => (
                    <article key={project.id} className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600/15 ring-1 ring-violet-400/20"><Music2 size={20} className="text-violet-300" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-bold">{project.title || "Hasil Musik AI"}</h3>
                          <p className="mt-1 break-words text-xs text-zinc-500">{project.model || "Mesin musik"} · {project.status || "Status belum tersedia"}</p>
                        </div>
                        {project.audio && <a href={project.audio} download className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold hover:bg-white/5"><Download size={15} />Simpan</a>}
                      </div>
                      {project.audio ? (
                        <div className="mt-4 flex items-center gap-3">
                          <audio controls preload="none" src={project.audio} className="min-w-0 flex-1" />
                          <a href={project.audio} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold hover:bg-violet-500"><Play size={14} />Buka</a>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl bg-white/[.03] px-3 py-2 text-xs text-zinc-500">{project.task_id ? "Task masih menunggu hasil audio." : "Audio belum tersedia untuk karya ini."}</p>
                      )}
                      {project.lyrics && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-500">{project.lyrics}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
