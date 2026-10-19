"use client";

import { type ReactNode, useEffect } from "react";

type Props = { children: ReactNode };
const DRAFT_KEY = "salvian_music_stage2_draft";

type Draft = {
  prompt?: string; lyrics?: string; gender?: string; instrumental?: boolean; tempo?: number; language?: string;
  musicEngine?: string; model?: string; referenceId?: string; referenceName?: string; referenceEngine?: string;
  vocalId?: string; vocalName?: string; vocalEngine?: string;
};

function readDraft(): Draft {
  try { return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null") || {}; } catch { return {}; }
}
function writeDraft(patch: Draft) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDraft(), ...patch })); } catch {}
}
function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Stage-2 adapter. It must NEVER create another page or navigation step.
 * File selection is the only browser picker step; after selection the user
 * remains on the same Studio screen and can continue with concept + lyrics.
 * Only the large Mureka reference upload and Mureka reference-duration remix
 * are intercepted here. Stage 1 remains untouched.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  useEffect(() => {
    // The Studio owns the page scroll on mobile. Do not trap touch scrolling
    // in an upload/result container after the file picker closes.
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflowY;
    const previousBodyOverflow = body.style.overflowY;
    html.style.overflowY = "auto";
    body.style.overflowY = "auto";

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);

      // Large Mureka reference: browser -> signed Blob PUT. The original
      // Studio still calls /api/music/upload; we intercept only this one case.
      if (url.endsWith("/api/music/upload") && init?.body instanceof FormData) {
        const form = init.body;
        const purpose = String(form.get("purpose") || "").toLowerCase();
        const engine = String(form.get("engine") || "").toLowerCase();
        const file = form.get("file");

        if (purpose === "reference" && engine === "mureka" && file instanceof File) {
          const headers = new Headers(init.headers || {});
          const workspace = headers.get("x-music-workspace") || "";
          if (!workspace) return new Response(JSON.stringify({ success: false, error: "Workspace Music belum siap." }), { status: 400, headers: { "Content-Type": "application/json" } });

          try {
            const sign = await nativeFetch("/api/music/reference-presign", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Music-Workspace": workspace },
              body: JSON.stringify({ filename: file.name, contentType: file.type || "audio/mpeg", size: file.size }),
            });
            const signData = await sign.json().catch(() => ({}));
            if (!sign.ok || !signData.presignedUrl) throw new Error(signData.error || "Gagal menyiapkan penyimpanan Audio Referensi.");

            const put = await nativeFetch(signData.presignedUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "audio/mpeg" },
              body: file,
            });
            if (!put.ok) throw new Error("Upload Audio Referensi ke Blob gagal.");

            writeDraft({ referenceId: String(signData.url), referenceName: file.name, referenceEngine: "mureka" });
            window.setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);
            return new Response(JSON.stringify({ success: true, id: signData.url, url: signData.url, purpose: "reference", engine: "mureka", largeReferenceUpload: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Upload Audio Referensi gagal." }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      // When Create Music is pressed with a Blob reference URL, use the
      // dedicated Mureka Remix path. Other engines and Stage 1 stay unchanged.
      if (url.endsWith("/api/music") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const engine = String(body.musicEngine || body.engine || "").toLowerCase();
          const stored = readDraft();
          const referenceUrl = (typeof body.reference_id === "string" ? body.reference_id.trim() : "") || stored.referenceId || "";

          writeDraft({
            lyrics: String(body.lyrics || ""),
            musicEngine: engine,
            model: String(body.model || ""),
            gender: String(body.gender || ""),
            language: String(body.language || ""),
            tempo: Number(body.tempo || 0),
            instrumental: Boolean(body.instrumental),
          });

          if (engine === "mureka" && /^https:\/\//i.test(referenceUrl)) {
            const headers = new Headers(init.headers || {});
            headers.set("Content-Type", "application/json");
            return nativeFetch("/api/music/remix", {
              method: "POST",
              headers,
              body: JSON.stringify({
                reference_url: referenceUrl,
                lyrics: String(body.lyrics || ""),
                prompt: String(body.style || "").slice(0, 1024),
                title: String(body.title || "Salvian AI Music — Reference Remix").slice(0, 160),
                n: Number.isFinite(Number(body.n)) ? Math.min(3, Math.max(1, Math.floor(Number(body.n)))) : 1,
              }),
            });
          }
        } catch {
          // Preserve the original request for Stage 1 and non-JSON requests.
        }
      }

      return nativeFetch(input, init);
    };

    return () => {
      html.style.overflowY = previousHtmlOverflow;
      body.style.overflowY = previousBodyOverflow;
      window.fetch = nativeFetch;
    };
  }, []);

  return <>{children}</>;
}
