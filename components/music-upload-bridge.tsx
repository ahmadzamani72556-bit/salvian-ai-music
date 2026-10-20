"use client";

import { upload } from "@vercel/blob/client";
import { useEffect } from "react";
import PremiumMusicStudio from "./premium-music-studio";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export default function MusicUploadBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const body = init?.body;

      // ROOT FIX: Mureka Stage-2 Audio Referensi follows the verified
      // Mureka flow: browser -> Vercel Blob (multipart) -> reference URL ->
      // /api/music/remix -> Mureka. Do not send the reference file through
      // the generic /api/music/upload storage-only path.
      if (url.endsWith("/api/music/upload") && body instanceof FormData) {
        const purpose = String(body.get("purpose") || "reference").toLowerCase();
        const engine = String(body.get("engine") || "mureka").toLowerCase();
        const file = body.get("file");

        if (purpose === "reference" && engine === "mureka" && file instanceof File) {
          const headers = new Headers(init?.headers || {});
          const workspace = (headers.get("X-Music-Workspace") || headers.get("x-music-workspace") || "").trim();
          if (!workspace) {
            return new Response(JSON.stringify({ success: false, error: "Workspace Music belum siap." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          try {
            const blob = await upload(file.name, file, {
              access: "public",
              contentType: file.type || undefined,
              handleUploadUrl: "/api/music/reference-upload",
              clientPayload: JSON.stringify({ workspace }),
              multipart: true,
            });

            return new Response(JSON.stringify({
              success: true,
              id: blob.url,
              reference_id: blob.url,
              reference_url: blob.url,
              purpose: "reference",
              engine: "mureka",
              url: blob.url,
              pathname: blob.pathname,
              largeReferenceUpload: true,
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Upload Audio Referensi gagal.",
            }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        // Keep the existing storage-first flow for Eleven Music and Suno,
        // plus Suno voice uploads. Mureka vocal cloning remains direct-file.
        const shouldStorageFirst =
          file instanceof File &&
          (purpose === "remix" || (purpose === "voice" && engine === "suno_v6")) &&
          (engine === "mureka" || engine === "eleven_music_v2_5" || engine === "suno_v6");

        if (shouldStorageFirst) {
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

            if (engine === "suno_v6") {
              return originalFetch("/api/music/suno-upload", { ...init, body: handoff });
            }

            return originalFetch("/api/music/upload", { ...init, body: handoff });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload audio ke penyimpanan gagal.";
            return new Response(JSON.stringify({ success: false, error: `Penyimpanan audio gagal: ${message}` }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      // ROOT FIX: when Mureka Stage-2 is submitted, a Blob URL is a reference
      // source, not a final Mureka file ID. Route it to the dedicated Remix
      // endpoint, which performs the Mureka URL upload and /v1/song/remix call.
      if (url.endsWith("/api/music") && typeof body === "string") {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          const engine = String(parsed.musicEngine || parsed.engine || "").toLowerCase();
          const referenceId = typeof parsed.reference_id === "string" ? parsed.reference_id.trim() : "";

          if (engine === "mureka" && /^https?:\/\//i.test(referenceId)) {
            const remixBody = {
              reference_url: referenceId,
              lyrics: String(parsed.lyrics || ""),
              prompt: String(parsed.style || "").slice(0, 1024),
              title: String(parsed.title || "Salvian AI Music — Reference Remix").slice(0, 160),
              model: String(parsed.model || "mureka-9"),
              language: String(parsed.language || "Indonesia"),
              gender: String(parsed.gender || ""),
              tempo: Number.isFinite(Number(parsed.tempo)) ? Math.max(0, Math.round(Number(parsed.tempo))) : 0,
              n: Number.isFinite(Number(parsed.n)) ? Math.min(3, Math.max(1, Math.floor(Number(parsed.n)))) : 1,
              instrumental: false,
            };
            const headers = new Headers(init?.headers || {});
            headers.set("Content-Type", "application/json");
            return originalFetch("/api/music/remix", { ...init, headers, body: JSON.stringify(remixBody) });
          }
        } catch {
          // Preserve the original request for non-JSON or non-Mureka requests.
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
