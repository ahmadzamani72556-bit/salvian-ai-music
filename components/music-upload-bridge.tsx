"use client";

import { upload } from "@vercel/blob/client";
import { useEffect } from "react";
import PremiumMusicStudio from "./premium-music-studio";

export default function MusicUploadBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = init?.body;

      // All Stage-1 reference/remix uploads use storage first. The browser
      // never pushes a large audio file through a Vercel Function request body.
      // This keeps the proven Mureka/Eleven flow and now applies the same
      // handoff to Suno reference and voice uploads.
      if (url === "/api/music/upload" && body instanceof FormData) {
        const purpose = String(body.get("purpose") || "reference").toLowerCase();
        const engine = String(body.get("engine") || "mureka").toLowerCase();
        const file = body.get("file");

        if (
          (purpose === "reference" || purpose === "remix" || purpose === "voice") &&
          (engine === "mureka" || engine === "eleven_music_v2_5" || engine === "suno_v6") &&
          file instanceof File
        ) {
          try {
            const blob = await upload(`salvian-music/${crypto.randomUUID()}-${file.name}`, file, {
              access: "public",
              handleUploadUrl: "/api/blob/upload",
              multipart: true,
            });

            const handoff = new FormData();
            handoff.append("file_url", blob.url);
            handoff.append("file_name", file.name);
            handoff.append("purpose", purpose);
            handoff.append("engine", engine);

            // Suno gets its own server-side handoff because its provider API
            // requires the API key to stay server-side. Mureka and Eleven keep
            // using the existing verified /api/music/upload route.
            if (engine === "suno_v6") {
              return originalFetch("/api/music/suno-upload", {
                ...init,
                body: handoff,
              });
            }

            // Normalize legacy "remix" uploads and current references into the
            // same storage-first Stage-1 path used by the verified flow.
            if (purpose !== "voice") handoff.set("purpose", "reference");
            return originalFetch("/api/music/upload", {
              ...init,
              body: handoff,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload audio ke penyimpanan gagal.";
            return new Response(JSON.stringify({ success: false, error: `Penyimpanan audio gagal: ${message}` }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <PremiumMusicStudio />;
}
