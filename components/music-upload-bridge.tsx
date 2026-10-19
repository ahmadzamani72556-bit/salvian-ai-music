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

      // The old Studio sends the selected audio directly to a Vercel Function.
      // Vercel Functions have a 4.5 MB request-body limit, so only the Mureka
      // reference path is moved to direct Blob upload. Voice/Suno/Eleven keep
      // their existing behavior.
      if (url === "/api/music/upload" && body instanceof FormData) {
        const purpose = String(body.get("purpose") || "reference");
        const engine = String(body.get("engine") || "mureka");
        const file = body.get("file");

        if (purpose === "reference" && engine === "mureka" && file instanceof File) {
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
