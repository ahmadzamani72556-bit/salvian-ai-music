"use client";

import { type ReactNode, useEffect } from "react";

type Props = { children: ReactNode };

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Stage-2 adapter only. It leaves the proven Studio component and Stage-1
 * /api/music flow untouched. For Mureka reference audio it moves the binary
 * upload directly from the browser to Vercel Blob using a short-lived signed
 * PUT URL, then changes only the final Mureka reference request into Remix.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);

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

      // The existing Studio sends the reference URL in reference_id. Only a
      // Mureka reference URL is rerouted; Stage 1 and all other engines stay
      // exactly on their original endpoint.
      if (url.endsWith("/api/music") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const engine = String(body.musicEngine || body.engine || "").toLowerCase();
          const referenceUrl = typeof body.reference_id === "string" ? body.reference_id.trim() : "";
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
          // Preserve the original request when it is not the Stage-2 path.
        }
      }

      return nativeFetch(input, init);
    };

    return () => { window.fetch = nativeFetch; };
  }, []);

  return <>{children}</>;
}
