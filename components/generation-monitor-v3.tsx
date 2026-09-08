"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Music2, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { createClient } from "@neondatabase/neon-js";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });
const TERMINAL = ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const FAILURE = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const CONTROL_LIMIT_SECONDS = 15 * 60;

type ActiveTask = { id: string; startedAt: number };

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}
function setCookie(name: string, value: string) { document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=3600; Path=/; SameSite=Lax`; }
function clearCookie(name: string) { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
function isTerminal(status: string) { const s = status.toLowerCase(); return TERMINAL.some(v => s === v || s.includes(v)); }
function isFailure(status: string) { const s = status.toLowerCase(); return FAILURE.some(v => s === v || s.includes(v)); }
function duration(seconds: number) { const s = Math.max(0, Math.floor(seconds)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`; }
function stage(status: string) { const s = status.toLowerCase(); if (s.includes("prepar")) return "Menyiapkan lagu"; if (s.includes("queue")) return "Menunggu antrean mesin musik"; if (s.includes("running")) return "Sedang membuat lagu"; if (s.includes("stream")) return "Menyiapkan audio"; if (s.includes("success") || s.includes("complete") || s.includes("done")) return "Finalisasi audio"; if (s.includes("fail") || s.includes("error") || s.includes("timeout") || s.includes("cancel")) return "Proses gagal"; return "Memproses lagu"; }

export default function GenerationMonitorV3() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("preparing");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastCheck, setLastCheck] = useState(0);

  useEffect(() => {
    let stopped = false;
    let current: ActiveTask | null = null;
    let pollTimer: number | null = null;
    let clockTimer: number | null = null;
    let hideTimer: number | null = null;
    const originalFetch = window.fetch.bind(window);

    const startPending = () => {
      if (stopped) return;
      current = { id: "pending", startedAt: Date.now() };
      setTaskId("pending"); setStatus("preparing"); setDone(false); setFailed(false); setElapsed(0); setLastCheck(0);
      if (hideTimer) window.clearTimeout(hideTimer);
    };

    const attach = (id: string, createdAt = 0) => {
      if (!id || stopped) return;
      const startedAt = createdAt > 0 ? createdAt : current?.startedAt || Date.now();
      current = { id, startedAt };
      setCookie("salvian_generation_task", id);
      setTaskId(id); setStatus("preparing"); setDone(false); setFailed(false); setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
    };

    const getToken = async () => {
      try {
        const session = await neon.auth.getSession();
        if (!session?.data?.user) return null;
        const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
        return typeof auth.getJWTToken === "function" ? await auth.getJWTToken(false) : null;
      } catch { return null; }
    };

    const check = async () => {
      if (stopped) return;
      const id = current?.id || getCookie("salvian_generation_task");
      if (!id || id === "pending") return;
      const jwt = await getToken();
      if (!jwt || stopped) return;
      try {
        const res = await originalFetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "status", taskId: id }), cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || stopped) return;
        const next = String(data.status || "preparing");
        const bad = Boolean(data.failed) || isFailure(next);
        const providerCreated = Number(data.createdAt || 0) * 1000;
        const startedAt = providerCreated > 0 ? providerCreated : (current?.startedAt || Date.now());
        current = { id, startedAt };
        setStatus(next); setFailed(bad); setLastCheck(Date.now()); setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
        if (data.finished === true || isTerminal(next)) {
          clearCookie("salvian_generation_task"); setDone(!bad);
          if (hideTimer) window.clearTimeout(hideTimer);
          hideTimer = window.setTimeout(() => { if (!stopped && current?.id === id) { current = null; setTaskId(""); } }, 15000);
        }
      } catch (error) { console.error("SALVIAN MUSIC MONITOR", error); }
    };

    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; createdAt?: number }>).detail;
      if (detail?.taskId && detail.taskId !== "pending") attach(String(detail.taskId), Number(detail.createdAt || 0)); else startPending();
      void check();
    };

    const onPointer = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("buat lagu")) startPending();
    };

    window.addEventListener("salvian-generation-started", onStart);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("click", onPointer, true);

    const patchedFetch: typeof window.fetch = async (...args) => {
      const request = args[0]; const init = args[1];
      const url = typeof request === "string" ? request : request instanceof Request ? request.url : "";
      const method = (init?.method || (request instanceof Request ? request.method : "GET")).toUpperCase();
      let action = "";
      if (typeof init?.body === "string") { try { action = String((JSON.parse(init.body) as Record<string, unknown>)?.action || ""); } catch {} }
      const generation = url.includes("/api/music") && method === "POST" && action !== "status" && action !== "balance";
      if (generation) startPending();
      const response = await originalFetch(...args);
      if (generation) {
        const clone = response.clone();
        void clone.json().then((data: Record<string, unknown>) => {
          const id = data?.taskId ? String(data.taskId) : "";
          const createdRaw = Number(data?.createdAt || 0);
          const created = createdRaw > 0 ? createdRaw * 1000 : current?.startedAt || Date.now();
          if (id) { attach(id, created); void check(); }
          else if (!data?.success) { setFailed(true); setStatus("failed"); }
        }).catch(() => { if (!stopped) { setFailed(true); setStatus("error"); } });
      }
      return response;
    };

    window.fetch = patchedFetch;
    const existing = getCookie("salvian_generation_task");
    if (existing) attach(existing);
    void check();
    pollTimer = window.setInterval(() => void check(), 5000);
    clockTimer = window.setInterval(() => {
      if (!stopped && current?.startedAt) {
        const seconds = Math.max(0, (Date.now() - current.startedAt) / 1000);
        setElapsed(seconds);
        // Local controller: if the provider has not completed after 15 minutes,
        // stop presenting it as an active generation and surface a timeout state.
        if (seconds >= CONTROL_LIMIT_SECONDS && current.id !== "pending" && !done && !failed) {
          setFailed(true); setStatus("timeout"); clearCookie("salvian_generation_task");
        }
      }
    }, 1000);

    return () => {
      stopped = true;
      window.removeEventListener("salvian-generation-started", onStart);
      document.removeEventListener("pointerdown", onPointer, true); document.removeEventListener("click", onPointer, true);
      if (pollTimer) window.clearInterval(pollTimer); if (clockTimer) window.clearInterval(clockTimer); if (hideTimer) window.clearTimeout(hideTimer);
      window.fetch = originalFetch;
    };
  }, [done, failed]);

  if (!taskId) return null;
  const pending = taskId === "pending";
  const controlPercent = Math.min(100, (elapsed / CONTROL_LIMIT_SECONDS) * 100);

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[70] mx-auto max-w-xl rounded-2xl border border-violet-400/30 bg-[#111116]/98 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          {failed ? <AlertTriangle size={21} /> : done ? <CheckCircle2 size={21} /> : <LoaderCircle size={21} className="animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm font-bold">
            <div className="flex items-center gap-2"><Music2 size={15} />{failed ? "Pembuatan lagu bermasalah" : done ? "Lagu selesai" : "Pembuatan lagu"}</div>
            <div className="flex items-center gap-1 text-xs font-semibold text-violet-200"><Clock3 size={13} /> {duration(elapsed)}</div>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {failed ? (status === "timeout" ? "Batas kontrol 15 menit tercapai. Proses ditandai timeout agar tidak menunggu tanpa batas." : pending ? "Server belum memberikan Task ID. Jangan menekan Buat Lagu lagi; tunggu respons provider." : "Mesin musik melaporkan proses gagal.") : done ? "Lagu selesai. Project sudah diperbarui di Library." : "Proses dipantau otomatis setiap 5 detik. Waktu kontrol maksimal 15 menit."}
          </p>
          {!done && !failed && <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400 transition-[width] duration-1000" style={{ width: `${Math.max(2, controlPercent)}%` }} /></div>
            <div className="mt-1 flex justify-between text-[9px] text-zinc-600"><span>Kontrol waktu</span><span>15:00</span></div>
          </>}
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{stage(status)}</span><span>{pending ? "Task menunggu respons" : `Task ${taskId}`}</span></div>
          {lastCheck > 0 && !done && !failed && <div className="mt-1 text-[9px] text-zinc-600">Pemeriksaan terakhir: {new Date(lastCheck).toLocaleTimeString("id-ID")}</div>}
        </div>
      </div>
    </div>
  );
}
