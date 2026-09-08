"use client";

import { useEffect, useState } from "react";
import { createClient } from "@neondatabase/neon-js";
import { LoaderCircle, Music2, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });
const ACTIVE_STATUSES = new Set(["preparing", "queued", "running", "streaming", "processing", "pending", "created"]);

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}
function clearCookie(name: string) { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function stageLabel(status: string) {
  const s = status.toLowerCase();
  if (s.includes("prepar")) return "Menyiapkan lagu";
  if (s.includes("queue")) return "Menunggu antrean mesin musik";
  if (s.includes("running")) return "Sedang membuat lagu";
  if (s.includes("stream")) return "Menyiapkan audio";
  if (s.includes("success") || s.includes("complete") || s.includes("done")) return "Finalisasi audio";
  if (s.includes("fail") || s.includes("error") || s.includes("timeout") || s.includes("cancel")) return "Proses gagal";
  return "Memproses lagu";
}

export default function GenerationMonitor() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("preparing");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let clock: number | null = null;

    const getJwt = async () => {
      try {
        const session = await neon.auth.getSession();
        if (!session?.data?.user) return null;
        const authWithJwt = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
        if (typeof authWithJwt.getJWTToken !== "function") return null;
        return await authWithJwt.getJWTToken(false);
      } catch { return null; }
    };

    const findActiveTask = async (jwt: string) => {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${jwt}` }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.projects)) return null;
      const active = data.projects.find((project: Record<string, unknown>) => {
        const task = project.task_id ? String(project.task_id) : "";
        const state = String(project.status || "").toLowerCase();
        return task && ACTIVE_STATUSES.has(state);
      });
      return active || null;
    };

    const check = async () => {
      if (stopped) return;
      try {
        const jwt = await getJwt();
        if (!jwt) return;

        // Do not depend on the browser cookie. Library is the source of truth,
        // so the control reappears after refresh, navigation, or cookie loss.
        let currentTask = getCookie("salvian_generation_task");
        let libraryProject: Record<string, unknown> | null = null;
        if (!currentTask) {
          libraryProject = await findActiveTask(jwt);
          currentTask = libraryProject?.task_id ? String(libraryProject.task_id) : "";
          if (currentTask) {
            document.cookie = `salvian_generation_task=${encodeURIComponent(currentTask)}; Max-Age=3600; Path=/; SameSite=Lax`;
          }
        }
        if (!currentTask) { setTaskId(""); return; }
        setTaskId(currentTask);

        const res = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "status", taskId: currentTask }), cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || stopped) return;

        const nextStatus = String(data.status || libraryProject?.status || "preparing");
        const isFailed = Boolean(data.failed);
        const createdMs = Number(data.createdAt || 0) * 1000 || Number(libraryProject?.created_at || 0);
        if (createdMs > 0 && Number.isFinite(createdMs)) {
          setStartedAt(prev => prev ?? createdMs);
          setElapsed(Math.max(0, (Date.now() - createdMs) / 1000));
        } else if (!startedAt) {
          setStartedAt(Date.now());
        }
        setStatus(nextStatus);
        setFailed(isFailed);

        // Only a terminal Mureka status ends the control.
        if (data.finished === true) {
          clearCookie("salvian_generation_task");
          setDone(!isFailed);
          window.dispatchEvent(new CustomEvent("salvian-generation-complete", { detail: { taskId: currentTask, failed: isFailed, audio: data.audio || null } }));
          window.setTimeout(() => { if (!stopped) setTaskId(""); }, 10000);
        }
      } catch (error) { console.error("SALVIAN GENERATION MONITOR", error); }
    };

    check();
    timer = window.setInterval(check, 5000);
    clock = window.setInterval(() => {
      if (!stopped && startedAt) setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
    }, 1000);
    return () => { stopped = true; if (timer) window.clearInterval(timer); if (clock) window.clearInterval(clock); };
  }, [startedAt]);

  if (!taskId) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[60] mx-auto max-w-xl rounded-2xl border border-violet-400/25 bg-[#111116]/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          {failed ? <AlertTriangle size={20} /> : done ? <CheckCircle2 size={20} /> : <LoaderCircle size={20} className="animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm font-bold">
            <div className="flex items-center gap-2"><Music2 size={15} />{failed ? "Pembuatan lagu gagal" : done ? "Lagu selesai" : "Kontrol pembuatan lagu"}</div>
            <div className="flex items-center gap-1 text-xs font-semibold text-violet-200"><Clock3 size={13} /> {formatDuration(elapsed)}</div>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {failed ? "Mesin musik melaporkan proses gagal. Hasil tidak dianggap selesai." : done ? "Lagu selesai. Project sudah diperbarui di Library." : "Proses sedang berjalan. Kontrol ini tetap aktif walaupun halaman di-refresh atau Anda berpindah halaman."}
          </p>
          {!done && !failed && <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-violet-400" /></div>}
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{stageLabel(status)}</span><span>Task {taskId}</span></div>
        </div>
      </div>
    </div>
  );
}
