"use client";

import { ReactNode, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Headphones, LoaderCircle, Music2, Play, Save, Trash2 } from "lucide-react";

type Project = {
  id: string;
  title?: string;
  lyrics?: string;
  style?: string;
  model?: string;
  status?: string;
  audio?: string | null;
  audio_url?: string | null;
  task_id?: string | null;
  created_at?: string;
};

type GenerationDetail = {
  generating?: boolean;
  status?: string;
  failed?: boolean;
};

type Phase = "studio" | "results";

function getWorkspaceId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("salvian_music_workspace") || "";
}

function audioSource(project: Project) {
  return project.audio || project.audio_url || null;
}

export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("studio");
  const [projects, setProjects] = useState<Project[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Hasil dan proses pembuatan lagu akan tampil di halaman ini.");
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  const loadProjects = async () => {
    const workspace = getWorkspaceId();
    if (!workspace) return;
    try {
      const res = await fetch("/api/projects", { headers: { "X-Music-Workspace": workspace }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.projects)) return;
      const next = (data.projects as Project[]).map(project => ({
        ...project,
        audio: audioSource(project),
      }));
      setProjects(next);
      const saved: Record<string, boolean> = {};
      next.forEach(project => {
        saved[project.id] = window.localStorage.getItem(`salvian_music_saved_${project.id}`) === "1";
      });
      setSavedIds(saved);
    } catch {
      // Keep the result screen usable if the refresh is temporarily unavailable.
    }
  };

  useEffect(() => {
    const onResults = (event: Event) => {
      const detail = (event as CustomEvent<{ projects?: Project[] }>).detail;
      if (!Array.isArray(detail?.projects)) return;
      setProjects(detail.projects.map(project => ({ ...project, audio: audioSource(project) })));
    };

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<GenerationDetail>).detail;
      if (!detail) return;
      if (typeof detail.status === "string") setStatus(detail.status);

      if (detail.generating) {
        setPhase("results");
        setGenerating(true);
        setFailed(Boolean(detail.failed));
        setProgress(value => Math.max(value, 8));
        return;
      }

      setPhase("results");
      setGenerating(false);
      setFailed(Boolean(detail.failed));
      setProgress(100);
      void loadProjects();
    };

    const onShowResults = () => {
      setPhase("results");
      setProgress(value => Math.max(value, 8));
      void loadProjects();
    };
    const onShowStudio = () => setPhase("studio");
    const onRefresh = () => void loadProjects();

    window.addEventListener("salvian-music-results-update", onResults);
    window.addEventListener("salvian-music-generation-status", onStatus);
    window.addEventListener("salvian-music-show-results", onShowResults);
    window.addEventListener("salvian-music-show-studio", onShowStudio);
    window.addEventListener("salvian-music-refresh-library", onRefresh);
    return () => {
      window.removeEventListener("salvian-music-results-update", onResults);
      window.removeEventListener("salvian-music-generation-status", onStatus);
      window.removeEventListener("salvian-music-show-results", onShowResults);
      window.removeEventListener("salvian-music-show-studio", onShowStudio);
      window.removeEventListener("salvian-music-refresh-library", onRefresh);
    };
  }, []);

  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setProgress(value => Math.max(value, Math.min(94, Math.round(12 + elapsed * 2.8))));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (phase === "results") void loadProjects();
  }, [phase]);

  const showStudio = () => {
    setPhase("studio");
    window.dispatchEvent(new CustomEvent("salvian-music-show-studio"));
  };

  const saveProject = (id: string) => {
    window.localStorage.setItem(`salvian_music_saved_${id}`, "1");
    setSavedIds(prev => ({ ...prev, [id]: true }));
  };

  const deleteProject = async (id: string) => {
    const workspace = getWorkspaceId();
    if (!workspace) return;
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Music-Workspace": workspace },
      });
      if (!res.ok) throw new Error();
      setProjects(prev => prev.filter(project => project.id !== id));
      setSavedIds(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      window.localStorage.removeItem(`salvian_music_saved_${id}`);
      setStatus("Hasil lagu berhasil dihapus dari Library Music.");
    } catch {
      setStatus("Hasil lagu gagal dihapus. Coba lagi.");
    }
  };

  return (
    <>
      {children}

      {phase === "results" && (
        <div className="fixed inset-0 z-[110] min-h-[100dvh] w-screen overflow-y-auto bg-[#02030a] text-white">
          <div className="mx-auto min-h-[100dvh] w-full max-w-3xl px-4 pb-10 pt-6 sm:px-8 sm:pt-8">
            <section className="rounded-[30px] border border-white/10 bg-[#080912]/96 p-5 shadow-2xl shadow-violet-950/30 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.28em] text-violet-300">Music Creator · Layar 2</p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight">Hasil Lagu &amp; Proses</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Pantau proses pembuatan lagu dan putar hasil yang sudah tersimpan di Library Music.</p>
                </div>
                <Headphones size={30} className="mt-1 shrink-0 text-violet-300" />
              </div>

              <div className="mt-6 flex rounded-2xl border border-white/10 bg-black/20 p-1">
                <button type="button" onClick={showStudio} className="flex-1 rounded-xl px-3 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white">
                  <ArrowLeft size={16} className="mr-2 inline" />Layar 1 · Studio
                </button>
                <div className="flex-1 rounded-xl bg-violet-600/20 px-3 py-3 text-center text-sm font-bold text-violet-200 ring-1 ring-violet-400/20">
                  Layar 2 · Hasil ({projects.length})
                </div>
              </div>

              <div className={`mt-6 rounded-3xl border p-5 ${failed ? "border-red-400/25 bg-red-500/5" : generating ? "border-violet-400/25 bg-violet-500/10" : "border-white/10 bg-white/[.03]"}`}>
                <div className="flex items-start gap-3">
                  {generating ? <LoaderCircle size={23} className="mt-0.5 shrink-0 animate-spin text-violet-300" /> : failed ? <Music2 size={23} className="mt-0.5 shrink-0 text-red-300" /> : <CheckCircle2 size={23} className="mt-0.5 shrink-0 text-emerald-300" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-black">{generating ? "Pembuatan musik sedang berlangsung" : failed ? "Pembuatan lagu gagal" : "Lagu berhasil dibuat"}</p>
                    <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{status}</p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-violet-200">{progress}%</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-300 transition-[width] duration-700" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600">
                  <span>{generating ? "Memproses audio" : "Proses selesai"}</span>
                  <span>Salvian AI Music</span>
                </div>
              </div>

              <div className="mt-7 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.22em] text-violet-300">Hasil Lagu</p>
                  <h2 className="mt-1 text-2xl font-black">Tersimpan</h2>
                </div>
                <button type="button" onClick={() => void loadProjects()} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/5">Refresh</button>
              </div>

              <div className="mt-4 space-y-4">
                {projects.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
                    <Music2 size={30} className="mx-auto text-zinc-600" />
                    <p className="mt-3 font-semibold text-zinc-300">Belum ada hasil lagu.</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">Buat musik dari Layar 1. Hasilnya akan otomatis muncul di halaman ini.</p>
                  </div>
                ) : projects.map(project => {
                  const saved = Boolean(savedIds[project.id]);
                  const audio = audioSource(project);
                  return (
                    <article key={project.id} className="rounded-[28px] border border-white/10 bg-black/20 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600/15 ring-1 ring-violet-400/20"><Music2 size={25} className="text-violet-300" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-violet-200">SALVIAN AI</span>
                            <span className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">{project.model || "ELITE"}</span>
                          </div>
                          <h3 className="mt-2 break-words text-xl font-black">{project.title || "Hasil Musik AI"}</h3>
                          <p className="mt-1 break-words text-sm text-zinc-500">Mode: {project.model || "Elite"} · {project.status || "succeeded"}</p>
                        </div>
                        <button type="button" onClick={() => void deleteProject(project.id)} aria-label="Hapus hasil lagu" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-red-400/20 px-2.5 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"><Trash2 size={18} /> <span className="hidden sm:inline">Hapus</span></button>
                      </div>

                      {audio ? (
                        <>
                          <audio controls preload="metadata" src={audio} className="mt-5 w-full" />
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => { const player = new Audio(audio); void player.play(); }} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black hover:bg-violet-500"><Play size={17} /> Putar Lagu</button>
                            <a href={audio} download className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-black hover:bg-white/5"><Download size={17} /> Download</a>
                            <button type="button" onClick={() => saveProject(project.id)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${saved ? "border-emerald-400/30 text-emerald-300" : "border-white/10 hover:bg-white/5"}`}><Save size={17} /> {saved ? "Tersimpan" : "Simpan Hasil"}</button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-4 rounded-2xl bg-white/[.03] px-4 py-3 text-sm text-zinc-500">
                          {project.task_id ? "Proses masih berjalan. Audio akan muncul setelah mesin selesai." : "Audio belum tersedia untuk karya ini."}
                        </div>
                      )}

                      {project.lyrics && <p className="mt-4 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-500">{project.lyrics}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
