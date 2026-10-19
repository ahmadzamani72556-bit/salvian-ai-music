"use client";

import { upload } from "@vercel/blob/client";
import { ReactNode, useEffect } from "react";

type Props = { children: ReactNode };

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Keeps the existing Studio component and Stage-1 request flow intact while
 * routing only Mureka Stage-2 reference uploads through Vercel Blob client
 * uploads. The existing component already calls /api/music/upload for its
 * reference button; intercepting that one request avoids a large rewrite of
 * the proven Studio UI.
 */
export default function Stage2ReferenceUploadBridge({ children }: Props) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/api/music/upload") && init?.body instanceof FormData) {
        const form = init.body;
        const purpose = String(form.get("purpose") || "").toLowerCase();
        const engine = String(form.get("engine") || "").toLowerCase();
        const file = form.get("file");

        if (purpose === "reference" && engine === "mureka" && file instanceof File) {
          const workspace = String((init.headers as Record<string, string> | undefined)?.["X-Music-Workspace"] || (init.headers as Record<string, string> | undefined)?.["x-music-workspace"] || "").trim();
          if (!workspace) return new Response(JSON.stringify({ success: false, error: "Workspace Music belum siap." }), { status: 400, headers: { "Content-Type": "application/json" } });

          try {
            const blob = await upload(file.name, file, {
              access: "public",
              contentType: file.type || undefined,
              handleUploadUrl: "/api/music/reference-upload",
              clientPayload: JSON.stringify({ workspace }),
              // Direct client upload. Vercel Blob splits large files into
              // parts so the file never passes through the 4.5 MB Function limit.
              multipart: true,
            });
            return new Response(JSON.stringify({
              success: true,
              id: blob.url,
              purpose: "reference",
              engine: "mureka",
              url: blob.url,
              pathname: blob.pathname,
              largeReferenceUpload: true,
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Upload Audio Referensi gagal." }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }
      }

      // When the existing Studio submits a Mureka reference URL, route the
      // final Create action to the dedicated Remix API. Stage 1 and all other
      // engines continue through their original /api/music route unchanged.
      if (url.endsWith("/api/music") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const engine = String(body.musicEngine || body.engine || "").toLowerCase();
          const referenceId = typeof body.reference_id === "string" ? body.reference_id.trim() : "";
          if (engine === "mureka" && /^https?:\/\//i.test(referenceId)) {
            const remixBody = {
              reference_url: referenceId,
              lyrics: String(body.lyrics || ""),
              prompt: String(body.style || "").slice(0, 1024),
              title: String(body.title || "Salvian AI Music — Reference Remix").slice(0, 160),
              n: Number.isFinite(Number(body.n)) ? Math.min(3, Math.max(1, Math.floor(Number(body.n)))) : 1,
            };
            const headers = new Headers(init.headers || {});
            headers.set("Content-Type", "application/json");
            return originalFetch("/api/music/remix", { ...init, headers, body: JSON.stringify(remixBody) });
          }
        } catch {
          // Not JSON or not the Stage-2 reference path; preserve the original request.
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
