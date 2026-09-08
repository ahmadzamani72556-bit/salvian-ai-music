"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Music2, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { createClient } from "@neondatabase/neon-js";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });
const TERMINAL = ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled"];
const FAILURE = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];

type MusicState = { id: string; status: string; startedAt: number; done: boolean; failed: boolean; audio?: string | null };

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}
function setCookie(name: string, value: string) { document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=3600; Path=/; SameSite=Lax`; }
function clearCookie(name: string) { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
function terminal(status: string) { const s = status.toLowerCase(); return TERMINAL.some(v => s === v || s.includes(v)); }
function failed(status: string) { const s = status.toLowerCase(); return FAILURE.some(v => s === v || s.includes(v)); }
function duration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`;
}
function stage(status: string) {
  const s = status.toLowerCase();
  if (s.includes("prepar")) return "Menyiapkan lagu";
  if (s.includes("queue")) return "Menunggu antrean mesin musik";
  if (s.includes("running")) return "Sedang membuat lagu";
  if (s.includes("stream")) return "Menyiapkan audio";
  if (s.includes("success") || s.includes("complete") || s.includes("done")) return "Finalisasi audio";
  if (s.includes("fail") || s.includes("error") || s.includes("timeout") || s.includes("cancel")) return "Proses gagal";
  return "Memproses lagu";
}

export default function GenerationMonitorV2() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("preparing");
  const [done, setDone] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const active = useState<MusicState | null>(null)[0];
  const [activeState, setActiveState] = useState<MusicState | null>(null);

  useEffect(() => {
    let stopped = false;
    let pollTimer: number | null = null;
    let clockTimer: number | null = null;
    let hideTimer: number | null = null;
    const originalFetch = window.fetch.bind(window);
    let current: MusicState | null = null;

    const start = (id: string, createdAt = 0) => {
      if (!id || stopped) return;
      const startMs = createdAt > 0 ? createdAt : Date.now();
      current = { id, status: "preparing", startedAt: startMs, done: false, failed: false };
      setActiveState(current);
      setCookie("salvian_generation_task", id);
      setTaskId(id);
      setStatus("preparing");
      setDone(false);
      setIsFailed(false);
      setStartedAt(startMs);
      setElapsed(Math.max(0, (Date.now() - startMs) / 1000));
      if (hideTimer) window.clearTimeout(hideTimer);
    };

    const token = async () => {
      try {
        const session = await neon.auth.getSession();
        if (!session?.data?.user) return null;
        const a = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
        return typeof a.getJWTToken === "function" ? await a.getJWTToken(false) : null;
      } catch { return null; }
    };

    const check = async () => {
      if (stopped) return;
      const id = current?.id || getCookie("salvian_generation_task");
      if (!id) return;
      const jwt = await token();
      if (!jwt || stopped) return;
      try {
        const res = await originalFetch("/api/music", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ action: "status", taskId: id }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || stopped) return;
        const next = String(data.status || "preparing");
        const bad = Boolean(data.failed) || failed(next);
        const created = Number(data.createdAt || 0) * 1000;
        const currentStart = created > 0 ? created : (current?.startedAt || Date.now());
        if (!current || current.id !== id) start(id, currentStart);
        current = { id, status: next, startedAt: currentStart, done: Boolean(data.finished) && !bad, failed: bad, audio: data.audio || null };
        setActiveState(current);
        setStatus(next);
        setIsFailed(bad);
        setStartedAt(currentStart);
        setElapsed(Math.max(0, (Date.now() - currentStart) / 1000));

        if (data.finished === true || terminal(next)) {
          clearCookie("salvian_generation_task");
          setDone(!bad);
          window.dispatchEvent(new CustomEvent("salvian-generation-complete", { detail: { taskId: id, failed: bad, audio: data.audio || null } }));
          if (hideTimer) window.clearTimeout(hideTimer);
          hideTimer = window.setTimeout(() => {
            if (!stopped && current?.id === id) {
              current = null;
              setActiveState(null);
              setTaskId("");
            }
          }, 15000);
        }
      } catch (error) {
        console.error("SALVIAN GENERATION CONTROL", error);
      }
    };

    const onStarted = (e: Event) => {
      const d = (e as CustomEvent<{ taskId?: string; createdAt?: number }>).detail;
      if (d?.taskId) { start(String(d.taskId), Number(d.createdAt || 0)); void check(); }
    };

    window.addEventListener("salvian-generation-started", onStarted);

    const patchedFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const request = args[0];
        const url = typeof request === "string" ? request : request instanceof Request ? request.url : "";
        const init = args[1];
        const method = (init?.method || (request instanceof Request ? request.method : "GET")).toUpperCase();
        if (url.includes("/api/music") && method === "POST") {
          const clone = response.clone();
          void clone.json().then((data: Record<string, unknown>) => {
            const id = data?.taskId ? String(data.taskId) : "";
            if (id) {
              const created = Number(data?.createdAt || 0) * 1000;
              start(id, created);
              window.dispatchEvent(new CustomEvent("salvian-generation-started", { detail: { taskId: id, createdAt: created } }));
              void check();
            }
          }).catch(() => undefined);
        }
      } catch (error) { console.error("SALVIAN FETCH MONITOR", error); }
      return response;
    };

    window.fetch = patchedFetch;
    const existing = getCookie("salvian_generation_task");
    if (existing) start(existing);
    void check();
    pollTimer = window.setInterval(() => void check(), 5000);
    clockTimer = window.setInterval(() => {
      if (!stopped && current?.startedAt) setElapsed(Math.max(0, (Date.now() - current.startedAt) / 1000));
    }, 1000);

    return () => {
      stopped = true;
      window.removeEventListener("salvian-generation-started", onStarted);
      if (pollTimer) window.clearInterval(pollTimer);
      if (clockTimer) window.clearInterval(clockTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      window.fetch = originalFetch;
    };
  }, []);

  if (!taskId) return null;
  return (
    <div className="fixed bottom-20 left-3 right-3 z-[70] mx-auto max-w-xl rounded-2xl border border-violet-400/30 bg-[#111116]/98 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">{isFailed ? <AlertTriangle size={21}/> : done ? <CheckCircle2 size={21}/> : <LoaderCircle size={21} className="animate-spin"/>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm font-bold"><div className="flex items-center gap-2"><Music2 size={15}/>{isFailed ? "Pembuatan lagu gagal" : done ? "Lagu selesai" : "Pembuatan lagu"}</div><div className="flex items-center gap-1 text-xs font-semibold text-violet-200"><Clock3 size={13}/> {duration(elapsed)}</div></div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{isFailed ? "Mesin musik melaporkan proses gagal. Hasil tidak dianggap selesai." : done ? "Lagu selesai. Project sudah diperbarui di Library." : "Proses sedang dipantau. Kontrol tetap aktif meskipun halaman di-refresh."}</p>
          {!done && !isFailed && <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-violet-400"/></div>}
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{stage(status)}</span><span>Task {taskId}</span></div>
        </div>
      </div>
    </div>
  );
}
