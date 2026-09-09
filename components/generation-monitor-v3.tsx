"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Music2, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { createClient, BetterAuthVanillaAdapter } from "@neondatabase/neon-js";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });
const TERMINAL = ["succeeded", "success", "completed", "complete", "done", "failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const FAILURE = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"];
const NOTICE_AFTER_SECONDS = 15 * 60;

type ActiveTask = { id: string; startedAt: number };
function cookie(name: string) { if (typeof document === "undefined") return ""; const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`)); return row ? decodeURIComponent(row.slice(name.length + 1)) : ""; }
function setCookie(name: string, value: string) { document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=7200; Path=/; SameSite=Lax`; }
function clearCookie(name: string) { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
function terminal(s: string) { const x = s.toLowerCase(); return TERMINAL.some(v => x === v || x.includes(v)); }
function failed(s: string) { const x = s.toLowerCase(); return FAILURE.some(v => x === v || x.includes(v)); }
function duration(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function stage(s: string) { const x = s.toLowerCase(); if (x.includes("queue")) return "Menunggu antrean mesin"; if (x.includes("running")) return "Sedang membuat musik"; if (x.includes("stream")) return "Menyiapkan audio"; if (x.includes("success") || x.includes("complete") || x.includes("done")) return "Finalisasi audio"; if (x.includes("fail") || x.includes("error") || x.includes("timeout") || x.includes("cancel")) return "Proses gagal"; return "Menyiapkan musik"; }

export default function GenerationMonitorV3() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("preparing");
  const [done, setDone] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastCheck, setLastCheck] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let current: ActiveTask | null = null;
    let poll: number | undefined;
    let clock: number | undefined;
    let hide: number | undefined;
    let consecutiveErrors = 0;
    const originalFetch = window.fetch.bind(window);

    const begin = () => { current = { id: "pending", startedAt: Date.now() }; setTaskId("pending"); setStatus("preparing"); setDone(false); setIsFailed(false); setSlow(false); setElapsed(0); };
    const attach = (id: string, createdAt = 0) => { if (!id || stopped) return; const startedAt = createdAt > 0 ? createdAt : current?.startedAt || Date.now(); current = { id, startedAt }; setCookie("salvian_generation_task", id); setTaskId(id); setStatus("preparing"); setDone(false); setIsFailed(false); setSlow(false); setElapsed(Math.max(0, (Date.now() - startedAt) / 1000)); };
    const finishAndClear = (bad: boolean, nextStatus: string, messageMs = 8000) => { clearCookie("salvian_generation_task"); clearCookie("salvian_generation_endpoint"); setIsFailed(bad); setDone(!bad); setStatus(nextStatus); if (hide) window.clearTimeout(hide); hide = window.setTimeout(() => { if (!stopped) { current = null; setTaskId(""); } }, messageMs); };
    const token = async () => { try { const session = await neon.auth.getSession(); if (!session?.data?.user) return null; const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> }; return auth.getJWTToken ? await auth.getJWTToken(false) : null; } catch { return null; } };
    const check = async () => {
      if (stopped) return;
      const id = current?.id || cookie("salvian_generation_task"); if (!id || id === "pending") return;
      const jwt = await token(); if (!jwt || stopped) return;
      const endpoint = cookie("salvian_generation_endpoint") || "/api/music";
      try {
        const res = await originalFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "status", taskId: id }), cache: "no-store" });
        const data = await res.json().catch(() => ({})); if (stopped) return;
        if (!res.ok) { consecutiveErrors += 1; setLastCheck(Date.now()); setSlow(true); return; }
        consecutiveErrors = 0;
        const next = String(data.status || "preparing"); const bad = Boolean(data.failed) || failed(next); const created = Number(data.createdAt || 0) * 1000; const startedAt = created > 0 ? created : current?.startedAt || Date.now(); current = { id, startedAt };
        const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
        setStatus(next); setIsFailed(bad); setLastCheck(Date.now()); setElapsed(seconds); setSlow(seconds >= NOTICE_AFTER_SECONDS);
        if (data.finished === true || terminal(next)) finishAndClear(bad, next);
      } catch (e) { consecutiveErrors += 1; setLastCheck(Date.now()); setSlow(true); console.error("SALVIAN MUSIC MONITOR", e); }
    };
    const pointer = (event: Event) => { const el = event.target instanceof HTMLElement ? event.target : null; const button = el?.closest("button"); const text = (button?.textContent || "").toLowerCase(); if (text.includes("buat musik") || text.includes("buat lagu") || text.includes("buatkan lagu")) begin(); };

    const patchedFetch: typeof window.fetch = async (...args) => {
      const request = args[0];
      const init = args[1];
      const url = typeof request === "string" ? request : request instanceof Request ? request.url : "";
      const method = (init?.method || (request instanceof Request ? request.method : "GET")).toUpperCase();
      let action = "";
      let parsedBody: Record<string, unknown> | null = null;
      if (typeof init?.body === "string") { try { parsedBody = JSON.parse(init.body) as Record<string, unknown>; action = String(parsedBody?.action || ""); } catch {} }

      const assistantRequest = url.endsWith("/api/assistant") && method === "POST";
      if (assistantRequest) {
        try {
          const jwt = await token();
          if (jwt) {
            const headers = new Headers(init?.headers || (request instanceof Request ? request.headers : undefined));
            if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${jwt}`);
            if (typeof request === "string") return originalFetch(request, { ...init, headers });
            if (request instanceof Request) return originalFetch(new Request(request, { ...init, headers }));
          }
        } catch (e) { console.error("SALVIAN MUSIC ASSISTANT AUTH", e); }
      }

      const musicEndpoint = url.endsWith("/api/music") || url.endsWith("/api/music/instrumental");
      const generation = musicEndpoint && method === "POST" && action !== "status" && action !== "balance";
      if (!generation) return originalFetch(...args);

      begin();
      const instrumentalRequest = url.endsWith("/api/music/instrumental") || parsedBody?.instrumental === true;
      let actualArgs: Parameters<typeof fetch> = args;
      if (instrumentalRequest && url.endsWith("/api/music")) {
        const source = parsedBody || {};
        const instrumentalBody = JSON.stringify({ title: String(source.title || "Instrumental SALVIAN AI"), prompt: String(source.style || source.prompt || "Instrumental music").slice(0, 1024), model: String(source.model || "auto") });
        const headers = new Headers(init?.headers || (request instanceof Request ? request.headers : undefined));
        headers.set("Content-Type", "application/json");
        actualArgs = ["/api/music/instrumental", { ...init, method: "POST", headers, body: instrumentalBody }];
      }
      setCookie("salvian_generation_endpoint", instrumentalRequest ? "/api/music/instrumental" : "/api/music");
      const response = await originalFetch(...actualArgs);
      const clone = response.clone();
      void clone.json().then((data: Record<string, unknown>) => {
        const id = data?.taskId ? String(data.taskId) : "";
        const created = Number(data?.createdAt || 0) * 1000;
        if (id && response.ok && data?.success !== false) { attach(id, created); void check(); }
        else if (!response.ok || data?.success === false) { setElapsed(0); finishAndClear(true, "error"); }
      }).catch(() => { if (!response.ok) finishAndClear(true, "error"); });
      return response;
    };

    document.addEventListener("click", pointer, true);
    window.fetch = patchedFetch;
    const existing = cookie("salvian_generation_task");
    if (existing) attach(existing);
    void check();
    poll = window.setInterval(() => void check(), 5000);
    clock = window.setInterval(() => { if (!stopped && current?.startedAt) { const seconds = Math.max(0, (Date.now() - current.startedAt) / 1000); setElapsed(seconds); setSlow(seconds >= NOTICE_AFTER_SECONDS); } }, 1000);
    return () => { stopped = true; document.removeEventListener("click", pointer, true); if (poll) window.clearInterval(poll); if (clock) window.clearInterval(clock); if (hide) window.clearTimeout(hide); window.fetch = originalFetch; };
  }, []);

  if (!taskId) return null;
  return <div className="fixed bottom-20 left-3 right-3 z-[70] mx-auto max-w-xl rounded-2xl border border-violet-400/30 bg-[#111116]/98 p-4 shadow-2xl backdrop-blur-xl"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">{isFailed ? <AlertTriangle size={21}/> : done ? <CheckCircle2 size={21}/> : <LoaderCircle size={21} className="animate-spin"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2 text-sm font-bold"><div className="flex items-center gap-2"><Music2 size={15}/>{isFailed ? "Pembuatan musik bermasalah" : done ? "Musik selesai" : "Pembuatan musik"}</div><div className="flex items-center gap-1 text-xs text-violet-200"><Clock3 size={13}/> {duration(elapsed)}</div></div><p className="mt-1 text-xs leading-5 text-zinc-400">{isFailed ? "Mesin musik melaporkan proses gagal." : done ? "Musik selesai dan project diperbarui di Library." : slow ? "Proses lebih lama dari biasanya. Tetap dipantau sampai mesin memberi hasil." : "Proses dipantau otomatis setiap 5 detik."}</p>{!done && !isFailed && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400 transition-[width] duration-1000" style={{ width: `${Math.min(100, Math.max(2, elapsed / NOTICE_AFTER_SECONDS * 100))}%` }}/></div><div className="mt-1 flex justify-between text-[9px] text-zinc-600"><span>{slow ? "Masih dipantau" : "Kontrol waktu"}</span><span>{duration(Math.max(NOTICE_AFTER_SECONDS, elapsed))}</span></div></>}<div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{stage(status)}</span><span>{taskId === "pending" ? "Menunggu Task ID" : `Task ${taskId}`}</span></div>{lastCheck > 0 && !done && !isFailed && <div className="mt-1 text-[9px] text-zinc-600">Pemeriksaan terakhir: {new Date(lastCheck).toLocaleTimeString("id-ID")}</div>}</div></div></div>;
}
