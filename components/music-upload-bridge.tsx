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

      // Stage-1 Audio Referensi is STORAGE ONLY. Never send the selected
      // full-length file to Mureka during the initial upload. This also
      // covers legacy callers that still label the upload as "remix".
      // Mureka's 10–350 second validation belongs only to Stage-2 when
      // /api/music/remix is called after the user presses Buat Musik.
      if (url === "/api/music/upload" && body instanceof FormData) {
        const purpose = String(body.get("purpose") || "reference").toLowerCase();
        const engine = String(body.get("engine") || "mureka").toLowerCase();
        const file = body.get("file");

        if ((purpose === "reference" || purpose === "remix") && engine === "mureka" && file instanceof File) {
          try {
            const blob = await upload(`salvian-music/${crypto.randomUUID()}-${file.name}`, file, {
              access: "public",
              handleUploadUrl: "/api/blob/upload",
              multipart: true,
            });

            const handoff = new FormData();
            handoff.append("file_url", blob.url);
            handoff.append("file_name", file.name);
            // Normalize both legacy "remix" uploads and the current
            // reference upload into the same storage-only Stage-1 path.
            handoff.append("purpose", "reference");
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
