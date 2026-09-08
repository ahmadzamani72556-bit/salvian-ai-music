"use client";

import { useEffect, useState } from "react";
import { createClient } from "@neondatabase/neon-js";
import { LoaderCircle, Music2, CheckCircle2 } from "lucide-react";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH }, dataApi: { url: DATA } });

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export default function GenerationMonitor() {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("processing");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    const check = async () => {
      const currentTask = getCookie("salvian_generation_task");
      if (!currentTask) {
        if (!stopped) setTaskId("");
        return;
      }
      if (!stopped) setTaskId(currentTask);
      try {
        const session = await neon.auth.getSession();
        if (!session?.data?.user) return;
        const authWithJwt = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
        if (typeof authWithJwt.getJWTToken !== "function") return;
        const jwt = await authWithJwt.getJWTToken(false);
        if (!jwt) return;
        const res = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "status", taskId: currentTask }), cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (stopped) return;
        setStatus(String(data.status || "processing"));
        if (data.finished || data.audio) {
          clearCookie("salvian_generation_task");
          setDone(true);
          window.dispatchEvent(new CustomEvent("salvian-generation-complete"));
          window.setTimeout(() => { if (!stopped) setTaskId(""); }, 7000);
        }
      } catch (error) {
        console.error("SALVIAN GENERATION MONITOR", error);
      }
    };

    check();
    timer = window.setInterval(check, 8000);
    return () => { stopped = true; if (timer) window.clearInterval(timer); };
  }, []);

  if (!taskId) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[60] mx-auto max-w-xl rounded-2xl border border-violet-400/25 bg-[#111116]/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          {done ? <CheckCircle2 size={20} /> : <LoaderCircle size={20} className="animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Music2 size={15} />
            {done ? "Lagu selesai" : "Pembuatan lagu masih berjalan"}
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {done ? "Hasil sudah tersedia dan project tetap tersimpan di Library." : "Mesin musik sedang memproses lagu. Anda boleh berpindah halaman atau refresh; proses tetap dipantau."}
          </p>
          {!done && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-violet-400" /></div>}
          {!done && <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">Status: {status}</div>}
        </div>
      </div>
    </div>
  );
}
