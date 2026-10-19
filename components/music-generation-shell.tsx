"use client";

import { ReactNode, useEffect, useState } from "react";
import { CheckCircle2, Download, Music2, Play, Save, Trash2, X } from "lucide-react";

type Project = {
  id: string;
  title?: string;
  status?: string;
  audio?: string | null;
  task_id?: string | null;
};

type GenerationDetail = {
  generating?: boolean;
  status?: string;
  failed?: boolean;
};

function getWorkspaceId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("salvian_music_workspace") || "";
}

export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Menyiapkan mesin musik…");
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [latest, setLatest] = useState<Project | null>(null);
  const [saved, setSaved] = useState(false);

  const loadLatest = async () => {
    const workspace = getWorkspaceId();
    if (!workspace) return;
    try {
      const res = await fetch("/api/projects", {
        headers: { "X-Music-Workspace": workspace },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.projects) || !data.projects.length) return;
      const project = data.projects[0] as Project;
      setLatest(project);
      const key = `salvian_music_saved_${project.id}`;
      setSaved(window.localStorage.getItem(key) === "1");
    } catch {
      // The Studio itself remains usable if the result refresh is temporarily unavailable.
    }
  };

  useEffect(() => {
    const openResults = (event: Event) => {
      const detail = (event as CustomEvent<GenerationDetail>).detail;
      if (!detail?.generating) return;

      setOpen(true);
      setFinished(false);
      setFailed(false);
      setLatest(null);
      setSaved(false);
      setProgress(value => Math.max(value, 8));
      setStatus(detail.status || "Permintaan diterima. Mesin sedang menyiapkan lagu…");

      window.setTimeout(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const resultsButton = buttons.find((button) =>
          button.textContent?.replace(/\s+/g, " ").trim().includes("Hasil Lagu & Proses")
        );
        resultsButton?.click();
      }, 0);
    };

    const updateStatus = (event: Event) => {
      const detail = (event as CustomEvent<GenerationDetail>).detail;
      if (!detail) return;
      setOpen(true);
      if (detail.status) setStatus(detail.status);
      if (detail.generating) {
        setFinished(false);
        setFailed(Boolean(detail.failed));
        setProgress(value => Math.max(value, 10));
        return;
      }
      setFinished(true);
      setFailed(Boolean(detail.failed));
      setProgress(detail.failed ? 100 : 100);
      void loadLatest();
    };

    window.addEventListener("salvian-music-generation-status", openResults);
    window.addEventListener("salvian-music-generation-status", updateStatus);
    return () => {
      window.removeEventListener("salvian-music-generation-status", openResults);
      window.removeEventListener("salvian-music-generation-status", updateStatus);
    };
  }, []);

  useEffect(() => {
    if (!open || finished) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      // Visual progress only: it approaches 94% until the provider confirms completion.
      const visual = Math.min(94, 12 + elapsed * 2.2);
      setProgress(value => Math.max(value, Math.round(visual)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, finished]);

  const deleteLatest = async () => {
    if (!latest?.id) return;
    const workspace = getWorkspaceId();
    if (!workspace) return;
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(latest.id)}`, {
        method: "DELETE",
        headers: { "X-Music-Workspace": workspace },
      });
      if (!res.ok) throw new Error();
      setLatest(null);
      setSaved(false);
      setStatus("Hasil lagu dihapus dari Library Music.");
      setFinished(true);
      setProgress(100);
    } catch {
      setStatus("Hasil lagu gagal dihapus. Coba lagi.");
    }
  };

  const saveLatest = () => {
    if (!latest?.id) return;
    window.localStorage.setItem(`salvian_music_saved_${latest.id}`, "1");
    setSaved(true);
    setStatus("Hasil lagu ditandai tersimpan di perangkat ini.");
  };

  return (
    <>
      {children}
      {open && (
        <section
          aria-label="Proses pembuatan lagu"
          className="fixed inset-x-3 bottom-[88px] z-[120] mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-violet-400/25 bg-[#0b0715]/95 p-4 shadow-2xl shadow-violet-950/40 backdrop-blur-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[520px]"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${finished ? "bg-emerald-500/15" : "bg-violet-500/15"}`}>
              {finished ? <CheckCircle2 className="text-emerald-300" size={23} /> : <Music2 className="animate-pulse text-violet-300" size={23} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black">{finished ? (failed ? "Pembuatan lagu gagal" : "Pembuatan lagu selesai") : "Pembuatan musik"}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">SALVIAN AI MUSIC · Layar 2</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Tutup kartu proses" className="rounded-xl p-2 text-zinc-500 hover:bg-white/5 hover:text-white">
                  <X size={17} />
                </button>
              </div>
              <p className="mt-2 break-words text-sm leading-5 text-zinc-300">{status}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{finished ? "SELESAI" : "PROSES MESIN"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-300 transition-[width] duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {!finished && <p className="mt-3 text-[11px] text-zinc-600">Proses dipantau otomatis. Kartu ini akan berubah ketika mesin mengembalikan hasil lagu.</p>}

          {finished && !failed && latest && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/15"><Music2 size={18} className="text-violet-300" /></div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold">{latest.title || "Salvian AI Song"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{latest.status || "succeeded"} · tersimpan di Library</p>
                </div>
              </div>
              {latest.audio ? (
                <>
                  <audio controls preload="metadata" src={latest.audio} className="mt-3 w-full" />
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <a href={latest.audio} download className="flex items-center justify-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold hover:bg-white/5"><Download size={14} /> Download</a>
                    <button type="button" onClick={() => { const audio = new Audio(latest.audio!); void audio.play(); }} className="flex items-center justify-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold"><Play size={14} /> Putar</button>
                    <button type="button" onClick={saveLatest} className={`flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold ${saved ? "border-emerald-400/30 text-emerald-300" : "border-white/10 hover:bg-white/5"}`}><Save size={14} /> {saved ? "Tersimpan" : "Simpan"}</button>
                    <button type="button" onClick={() => void deleteLatest()} className="flex items-center justify-center gap-1 rounded-xl border border-red-400/20 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Hapus</button>
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-xl bg-white/[.03] px-3 py-2 text-xs text-amber-200/80">Mesin selesai, tetapi URL audio belum diterima. Refresh Hasil Lagu & Proses untuk mengambil hasil terbaru.</p>
              )}
            </div>
          )}

          {finished && !failed && !latest && <p className="mt-3 rounded-xl bg-white/[.03] px-3 py-2 text-xs text-zinc-400">Lagu selesai. Sedang mengambil hasil dari Library…</p>}
        </section>
      )}
    </>
  );
}
