"use client";

import { useEffect } from "react";

type BillingBody = {
  action: "consume" | "refund";
  feature: "MUSIC_GENERATION";
  musicEngine: string;
  referenceId: string;
};

type BillingRecord = { referenceId: string; engine: string };

const BILLING_REF_PREFIX = "salvian_music_billing_ref:";
const GENERATION_PATHS = new Set(["/api/music", "/api/music/remix"]);

function engineOf(body: Record<string, unknown>) {
  return String(body.musicEngine || body.engine || "").trim().toLowerCase();
}

function validEngine(engine: string) {
  return engine === "mureka" || engine === "eleven_music_v2_5" || engine === "eleven" || engine === "suno_v6" || engine === "suno";
}

async function bill(action: BillingBody["action"], engine: string, referenceId: string) {
  const payload: BillingBody = { action, feature: "MUSIC_GENERATION", musicEngine: engine, referenceId };
  const response = await window.fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Billing SALVIAN AI gagal diproses.");
  return data;
}

function taskKey(taskId: string) {
  return `${BILLING_REF_PREFIX}${taskId}`;
}

function saveTaskBilling(taskId: string, record: BillingRecord) {
  if (!taskId) return;
  window.localStorage.setItem(taskKey(taskId), JSON.stringify(record));
}

function readTaskBilling(taskId: string): BillingRecord | null {
  if (!taskId) return null;
  try {
    const value = window.localStorage.getItem(taskKey(taskId));
    if (!value) return null;
    const parsed = JSON.parse(value) as BillingRecord;
    return parsed?.referenceId && parsed?.engine ? parsed : null;
  } catch {
    return null;
  }
}

function clearTaskBilling(taskId: string) {
  if (taskId) window.localStorage.removeItem(taskKey(taskId));
}

export default function MusicBillingGate() {
  useEffect(() => {
    const globalKey = "__salvianMusicBillingGateInstalled";
    const currentWindow = window as typeof window & { [globalKey]?: boolean };
    if (currentWindow[globalKey]) return;
    currentWindow[globalKey] = true;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url: URL;
      try { url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.href); }
      catch { return nativeFetch(input, init); }

      if (!GENERATION_PATHS.has(url.pathname) || String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() !== "POST") {
        if (url.pathname === "/api/music" && String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST") {
          return nativeFetch(input, init);
        }
        return nativeFetch(input, init);
      }

      let body: Record<string, unknown> = {};
      try {
        if (typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
        else if (input instanceof Request) {
          const clone = input.clone();
          const text = await clone.text();
          body = text ? JSON.parse(text) as Record<string, unknown> : {};
        }
      } catch {
        return nativeFetch(input, init);
      }

      const action = String(body.action || "generate").trim().toLowerCase();
      if (action === "status") return nativeFetch(input, init);

      const engine = engineOf(body);
      if (!validEngine(engine)) return nativeFetch(input, init);

      const referenceId = `music-${Date.now()}-${crypto.randomUUID()}`.slice(0, 160);
      try {
        const billing = await bill("consume", engine, referenceId);
        const response = await nativeFetch(input, init);
        let data: Record<string, unknown> = {};
        try { data = await response.clone().json() as Record<string, unknown>; } catch {}

        if (!response.ok || data.success === false || typeof data.error === "string") {
          try { await bill("refund", engine, referenceId); } catch {}
          return response;
        }

        const taskId = String(data.taskId || data.task_id || "").trim();
        if (taskId) saveTaskBilling(taskId, { referenceId, engine });
        else void billing;
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gagal memproses billing SALVIAN AI.";
        return new Response(JSON.stringify({ success: false, error: message, code: "BILLING_REQUIRED", billingOwner: "SALVIAN_AI" }), {
          status: message.includes("tidak cukup") ? 402 : 502,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
    };

    const onStorage = () => {};
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const globalKey = "__salvianMusicBillingStatusHook";
    const currentWindow = window as typeof window & { [globalKey]?: boolean };
    if (currentWindow[globalKey]) return;
    currentWindow[globalKey] = true;

    const previousFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const response = await previousFetch(...args);
      let url: URL | null = null;
      try {
        const input = args[0];
        url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.href);
      } catch {}
      if (!url || url.pathname !== "/api/music") return response;

      let body: Record<string, unknown> = {};
      try {
        const init = args[1];
        const raw = typeof init?.body === "string" ? init.body : "";
        body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      } catch {}
      if (String(body.action || "").toLowerCase() !== "status") return response;

      try {
        const data = await response.clone().json() as Record<string, unknown>;
        if (!data.finished) return response;
        const taskId = String(body.taskId || body.task_id || body.id || "").trim();
        const record = readTaskBilling(taskId);
        if (!record) return response;
        if (data.failed) {
          void bill("refund", record.engine, record.referenceId).catch(() => {});
        }
        clearTaskBilling(taskId);
      } catch {}
      return response;
    };

    void originalFetch;
    return () => {};
  }, []);

  return null;
}
