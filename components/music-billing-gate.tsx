"use client";

import { useEffect } from "react";

type BillingAction = "consume" | "refund";
type BillingRecord = { referenceId: string; engine: string };

type BillingError = Error & { status?: number; code?: string };

const BILLING_REF_PREFIX = "salvian_music_billing_ref:";
const GENERATION_PATHS = new Set(["/api/music", "/api/music/remix", "/api/music/instrumental"]);
const SALVIAN_AI_ORIGIN = "https://salvianai.sovira.id";

function getEngine(body: Record<string, unknown>) {
  return String(body.musicEngine || body.engine || "").trim().toLowerCase();
}

function isSupportedEngine(engine: string) {
  return ["mureka", "eleven_music_v2_5", "eleven", "suno_v6", "suno"].includes(engine);
}

function billingError(message: string, status: number, code?: string): BillingError {
  const error = new Error(message) as BillingError;
  error.status = status;
  error.code = code;
  return error;
}

async function centralBill(fetcher: typeof window.fetch, action: BillingAction, engine: string, referenceId: string) {
  const response = await fetcher("/api/music/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, feature: "MUSIC_GENERATION", musicEngine: engine, referenceId }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw billingError(
      typeof data.error === "string" ? data.error : "Billing SALVIAN AI gagal diproses.",
      response.status,
      typeof data.code === "string" ? data.code : undefined,
    );
  }
  return data as Record<string, unknown>;
}

function taskKey(taskId: string) {
  return `${BILLING_REF_PREFIX}${taskId}`;
}

function rememberTask(taskId: string, record: BillingRecord) {
  if (taskId) window.localStorage.setItem(taskKey(taskId), JSON.stringify(record));
}

function readTask(taskId: string): BillingRecord | null {
  if (!taskId) return null;
  try {
    const raw = window.localStorage.getItem(taskKey(taskId));
    if (!raw) return null;
    const value = JSON.parse(raw) as BillingRecord;
    return value.referenceId && value.engine ? value : null;
  } catch {
    return null;
  }
}

function forgetTask(taskId: string) {
  if (taskId) window.localStorage.removeItem(taskKey(taskId));
}

async function readRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === "string") {
    try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return {}; }
  }
  if (input instanceof Request) {
    try {
      const text = await input.clone().text();
      return text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestUrl(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(raw, window.location.href);
}

function redirectToSalvianLogin() {
  // New users may view Music freely, but creation always requires the single SALVIAN AI account.
  // After login, the user is sent to the parent Billing page to obtain credits before returning to Music.
  const login = new URL("/login", SALVIAN_AI_ORIGIN);
  login.searchParams.set("next", "/billing");
  window.location.assign(login.toString());
}

function redirectToSalvianBilling() {
  window.location.assign(new URL("/billing", SALVIAN_AI_ORIGIN).toString());
}

export default function MusicBillingGate() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const gatedFetch: typeof window.fetch = async (input, init) => {
      let url: URL;
      try { url = requestUrl(input); } catch { return originalFetch(input, init); }
      if (!GENERATION_PATHS.has(url.pathname) || requestMethod(input, init) !== "POST") return originalFetch(input, init);

      const body = await readRequestBody(input, init);
      const action = String(body.action || "generate").trim().toLowerCase();
      const engine = getEngine(body);

      if (action === "status") {
        const response = await originalFetch(input, init);
        try {
          const data = await response.clone().json() as Record<string, unknown>;
          if (data.finished) {
            const taskId = String(body.taskId || body.task_id || body.id || "").trim();
            const record = readTask(taskId);
            if (record) {
              if (data.failed) void centralBill(originalFetch, "refund", record.engine, record.referenceId).catch(() => {});
              forgetTask(taskId);
            }
          }
        } catch {}
        return response;
      }

      if (!isSupportedEngine(engine)) return originalFetch(input, init);

      const referenceId = `music-${Date.now()}-${crypto.randomUUID()}`.slice(0, 160);
      try {
        // Parent SALVIAN AI is the only owner of authentication, billing and credits.
        await centralBill(originalFetch, "consume", engine, referenceId);
        const response = await originalFetch(input, init);
        let data: Record<string, unknown> = {};
        try { data = await response.clone().json() as Record<string, unknown>; } catch {}

        if (!response.ok || data.success === false || typeof data.error === "string") {
          await centralBill(originalFetch, "refund", engine, referenceId).catch(() => {});
          return response;
        }

        const taskId = String(data.taskId || data.task_id || "").trim();
        if (taskId) rememberTask(taskId, { referenceId, engine });
        return response;
      } catch (error) {
        const billing = error as BillingError;

        // No SALVIAN AI session: send the user directly to the single parent login.
        if (billing.status === 401 || billing.code === "UNAUTHENTICATED") {
          redirectToSalvianLogin();
          return new Response(JSON.stringify({ success: false, error: "Silakan masuk ke SALVIAN AI terlebih dahulu.", code: "AUTH_REQUIRED" }), {
            status: 401,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        // Logged-in users with insufficient credits go to the parent SALVIAN AI Billing page.
        // This avoids a login loop while keeping Music free of its own billing/credit system.
        if (billing.status === 402 || billing.code === "INSUFFICIENT") {
          redirectToSalvianBilling();
          return new Response(JSON.stringify({ success: false, error: "Kredit SALVIAN AI tidak cukup.", code: "CREDITS_REQUIRED" }), {
            status: 402,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        const message = billing.message || "Billing SALVIAN AI gagal diproses.";
        return new Response(JSON.stringify({ success: false, error: message, code: "BILLING_REQUIRED", billingOwner: "SALVIAN_AI" }), {
          status: billing.status && billing.status >= 400 ? billing.status : 502,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
    };

    window.fetch = gatedFetch;
    return () => { window.fetch = originalFetch; };
  }, []);

  return null;
}
