"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Music2, CheckCircle2, AlertTriangle, Clock3, X } from "lucide-react";

const TERMINAL = ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const FAILURE = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const NOTICE_AFTER_SECONDS = 15 * 60;
const STUCK_AFTER_SECONDS = 20 * 60;

type ActiveTask = { id: string; startedAt: number; engine: string };

function cookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=7200; Path=/; SameSite=Lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}
function terminal(s: string) {
  const x = s.toLowerCase();
  return TERMINAL.some(v => x === v || x.includes(v));
}
function failed(s: string) {
  const x = s.toLowerCase();
  return FAILURE.some(v => x === v || x.includes(v));
}
function duration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function engineLabel(engine: string) {
  if (engine === "eleven_music_v2_5") return "Eleven Music";
  if (engine === "suno_v6") return "Suno";
  return "Mureka";
}
function stage(status: string, engine: string) {
  const x = status.toLowerCase();
  if (x.includes("queue")) return "Menunggu antrean mesin";
  if (x.includes("running") || x.includes("processing")) return "Sedang membuat musik";
  if (x.includes("stream")) return "Menyiapkan audio";
  if (x.includes("success") || x.includes("complete") || x.includes("done")) return "Finalisasi audio";
  if (x.includes("fail") || x.includes("error") || x.includes("timeout") || x.includes("cancel")) return "Proses gagal";
  return `Menyiapkan ${engineLabel(engine)}`;
}

export default function GenerationMonitorV3() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("preparing");
  const [done, setDone] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastCheck, setLastCheck] = useState(0);
  const [slow, setSlow] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [engine, setEngine] = useState("mureka");
  const stopWatchingRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let current: ActiveTask | null = null;
    let poll: number | undefined;
    let clock: number | undefined;
    let hide: number | undefined;
    const originalFetch = window.fetch.bind(window);

    const clearTracking = () => {
      clearCookie("salvian_generation_task");
      clearCookie("salvian_generation_endpoint");
      clearCookie("salvian_generation_engine");
      clearCookie("salvian_generation_workspace");
    };

    const begin = (requestEngine = "mureka", workspace = "") => {
      current = { id: "pending", startedAt: Date.now(), engine: requestEngine || "mureka" };
      setTaskId("pending");
      setStatus("preparing");
      setDone(false);
      setIsFailed(false);
      setSlow(false);
      setStuck(false);
      setRetrying(false);
      setElapsed(0);
      setEngine(requestEngine || "mureka");
      if (workspace) setCookie("salvian_generation_workspace", workspace);
      setCookie("salvian_generation_engine", requestEngine || "mureka");
    };

    const attach = (id: string, createdAt = 0, requestEngine = "") => {
      if (!id || stopped) return;
      const resolvedEngine = requestEngine || cookie("salvian_generation_engine") || "mureka";
      const startedAt = createdAt > 0 ? createdAt : current?.startedAt || Date.now();
      current = { id, startedAt, engine: resolvedEngine };
      setCookie("salvian_generation_task", id);
      setCookie("salvian_generation_engine", resolvedEngine);
      setTaskId(id);
      setEngine(resolvedEngine);
      setStatus("preparing");
      setDone(false);
      setIsFailed(false);
      setSlow(false);
      setStuck(false);
      setRetrying(false);
      setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
    };

    const finishAndClear = (bad: boolean, nextStatus: string, messageMs = 900) => {
      clearTracking();
      setIsFailed(bad);
      setDone(!bad);
      setStatus(nextStatus);
      setRetrying(false);
      if (hide) window.clearTimeout(hide);
      hide = window.setTimeout(() => {
        if (!stopped) {
          current = null;
          setTaskId("");
          setDone(false);
          setIsFailed(false);
        }
      }, messageMs);
    };

    const stopWatching = () => {
      current = null;
      clearTracking();
      if (hide) window.clearTimeout(hide);
      setTaskId("");
      setDone(false);
      setIsFailed(false);
      setRetrying(false);
      setSlow(false);
      setStuck(false);
    };
    stopWatchingRef.current = stopWatching;

    const check = async () => {
      if (stopped) return;
      const id = current?.id || cookie("salvian_generation_task");
      if (!id || id === "pending") return;
      const endpoint = cookie("salvian_generation_endpoint") || "/api/music";
      const requestEngine = current?.engine || cookie("salvian_generation_engine") || "mureka";
      const workspace = cookie("salvian_generation_workspace");
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (workspace) headers["X-Music-Workspace"] = workspace;
        const res = await originalFetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "status", taskId: id, musicEngine: requestEngine }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setLastCheck(Date.now());
          setSlow(true);
          setRetrying(true);
          return;
        }
        setRetrying(false);
        const next = String(data.status || "preparing");
        const bad = Boolean(data.failed) || failed(next);
        const created = Number(data.createdAt || 0) * 1000;
        const startedAt = created > 0 ? created : current?.startedAt || Date.now();
        current = { id, startedAt, engine: requestEngine };
        const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
        setStatus(next);
        setEngine(requestEngine);
        setIsFailed(bad);
        setLastCheck(Date.now());
        setElapsed(seconds);
        setSlow(seconds >= NOTICE_AFTER_SECONDS);
        setStuck(seconds >= STUCK_AFTER_SECONDS && !data.finished);
        if (data.finished === true || terminal(next)) finishAndClear(bad, next);
      } catch (e) {
        setLastCheck(Date.now());
        setSlow(true);
        setRetrying(true);
        console.error("SALVIAN MUSIC MONITOR", e);
      }
    };

    const pointer = (event: Event) => {
      const el = event.target instanceof HTMLElement ? event.target : null;
      const button = el?.closest("button");
      const text = (button?.textContent || "").toLowerCase();
      if (text.includes("buat musik") || text.includes("buat lagu") || text.includes("buatkan lagu")) begin();
    };

    const patchedFetch: typeof window.fetch = async (...args) => {
      const request = args[0];
      const init = args[1];
      const url = typeof request === "string" ? request : request instanceof Request ? request.url : "";
      const method = (init?.method || (request instanceof Request ? request.method : "GET")).toUpperCase();
      let action = "";
      let parsedBody: Record<string, unknown> | null = null;
      if (typeof init?.body === "string") {
        try {
          parsedBody = JSON.parse(init.body) as Record<string, unknown>;
          action = String(parsedBody?.action || "");
        } catch {}
      }

      const musicEndpoint = url.endsWith("/api/music") || url.endsWith("/api/music/instrumental");
      const generation = musicEndpoint && method === "POST" && action !== "status";
      if (!generation) return originalFetch(...args);

      const requestHeaders = new Headers(init?.headers || (request instanceof Request ? request.headers : undefined));
      const requestWorkspace = requestHeaders.get("X-Music-Workspace") || "";
      const requestEngine = String(parsedBody?.musicEngine || (url.endsWith("/api/music/instrumental") ? "mureka" : "mureka"));
      begin(requestEngine, requestWorkspace);
      setCookie("salvian_generation_endpoint", url.endsWith("/api/music/instrumental") ? "/api/music/instrumental" : "/api/music");

      const instrumentalRequest = url.endsWith("/api/music/instrumental") || parsedBody?.instrumental === true;
      let actualArgs: Parameters<typeof fetch> = args;
      if (instrumentalRequest && url.endsWith("/api/music")) {
        const source = parsedBody || {};
        const instrumentalBody = JSON.stringify({
          title: String(source.title || "Instrumental SALVIAN AI"),
          prompt: String(source.style || source.prompt || "Instrumental music").slice(0, 1024),
          model: String(source.model || "auto"),
        });
        const headers = new Headers(requestHeaders);
        headers.set("Content-Type", "application/json");
        actualArgs = ["/api/music/instrumental", { ...init, method: "POST", headers, body: instrumentalBody }];
      }

      const response = await originalFetch(...actualArgs);
      const clone = response.clone();
      void clone.json().then((data: Record<string, unknown>) => {
        const id = data?.taskId ? String(data.taskId) : "";
        const created = Number(data?.createdAt || 0) * 1000;
        if (!response.ok || data?.success === false) {
          finishAndClear(true, "error", 1200);
          return;
        }
        if (data?.audio) {
          // Eleven Music v2.5 returns the completed audio in the generation response.
          // There is no task left to monitor, so remove the monitor immediately.
          finishAndClear(false, "completed", 500);
          return;
        }
        if (id) {
          attach(id, created, requestEngine);
          void check();
        } else {
          finishAndClear(false, "completed", 900);
        }
      }).catch(() => {
        if (!response.ok) finishAndClear(true, "error", 1200);
      });
      return response;
    };

    document.addEventListener("click", pointer, true);
    window.fetch = patchedFetch;
    const existing = cookie("salvian_generation_task");
    if (existing) attach(existing, 0, cookie("salvian_generation_engine") || "mureka");
    void check();
    poll = window.setInterval(() => void check(), 5000);
    clock = window.setInterval(() => {
      if (!stopped && current?.startedAt) {
        const seconds = Math.max(0, (Date.now() - current.startedAt) / 1000);
        setElapsed(seconds);
        setSlow(seconds >= NOTICE_AFTER_SECONDS);
        setStuck(seconds >= STUCK_AFTER_SECONDS);
      }
    }, 1000);

    return () => {
      stopped = true;
      document.removeEventListener("click", pointer, true);
      if (poll) window.clearInterval(poll);
      if (clock) window.clearInterval(clock);
      if (hide) window.clearTimeout(hide);
      window.fetch = originalFetch;
      stopWatchingRef.current = () => {};
    };
  }, []);

  if (!taskId) return null;

  return <div className="fixed bottom-20 left-3 right-3 z-[70] mx-auto max-w-xl rounded-2xl border border-violet-400/30 bg-[#111116]/98 p-4 shadow-2xl backdrop-blur-xl"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">{isFailed ? <AlertTriangle size={21}/> : done ? <CheckCircle2 size={21}/> : <LoaderCircle size={21} className="animate-spin"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2 text-sm font-bold"><div className="flex items-center gap-2"><Music2 size={15}/>{isFailed ? "Pembuatan musik bermasalah" : done ? "Musik selesai" : `Pembuatan musik · ${engineLabel(engine)}`}</div><div className="flex items-center gap-1"><div className="flex items-center gap-1 text-xs text-violet-200"><Clock3 size={13}/> {duration(elapsed)}</div><button type="button" onClick={() => stopWatchingRef.current()} aria-label="Hentikan pemantauan task" title="Hentikan pemantauan task" className="ml-1 grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"><X size={16}/></button></div></div><p className="mt-1 text-xs leading-5 text-zinc-400">{isFailed ? "Mesin musik melaporkan proses gagal. Periksa detail task dan coba lagi bila diperlukan." : done ? "Musik selesai dan project diperbarui di Library." : stuck ? `Task ${engineLabel(engine)} masih tertahan. Anda bisa menghentikan pemantauan task lama ini tanpa membuat task baru.` : slow ? "Proses lebih lama dari biasanya. Tetap dipantau sampai mesin memberi hasil." : "Proses dipantau otomatis setiap 5 detik."}</p>{!done && !isFailed && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400 transition-[width] duration-1000" style={{ width: `${Math.min(100, Math.max(2, elapsed / NOTICE_AFTER_SECONDS * 100))}%` }}/></div><div className="mt-1 flex justify-between text-[9px] text-zinc-600"><span>{stuck ? "Task lama — pemantauan dapat dihentikan" : slow ? "Masih dipantau" : "Kontrol waktu"}</span><span>{duration(Math.max(NOTICE_AFTER_SECONDS, elapsed))}</span></div></>}<div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{stage(status, engine)}</span><span>{taskId === "pending" ? "Menunggu Task ID" : `Task ${taskId}`}</span></div>{lastCheck > 0 && !done && !isFailed && <div className="mt-1 text-[9px] text-zinc-600">Pemeriksaan terakhir: {new Date(lastCheck).toLocaleTimeString("id-ID")}{retrying ? " · koneksi sedang dicoba ulang" : ""}</div>}</div></div></div>;
}
