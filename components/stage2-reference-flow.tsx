"use client";

import { type ReactNode, useEffect } from "react";

type Props = { children: ReactNode };

/**
 * Stage-2 reference-flow guard.
 *
 * The actual Mureka upload + Remix handoff is owned by
 * PremiumMusicStudio -> /api/music/upload -> /api/music/remix.
 *
 * Do NOT monkey-patch window.fetch here. The previous implementation
 * intercepted the Mureka reference upload, stored only a Blob URL as
 * referenceId, and therefore prevented /api/music/upload from returning the
 * authoritative remix_upload_id required by /api/music/remix. That produced
 * the false "Audio Referensi Remix belum ditemukan" result on Stage 2.
 *
 * This wrapper intentionally only keeps the Studio scroll behavior stable.
 * Stage 1, Stage 2, Library, and Assistant remain on the existing page flow.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflowY;
    const previousBodyOverflow = body.style.overflowY;

    html.style.overflowY = "auto";
    body.style.overflowY = "auto";

    return () => {
      html.style.overflowY = previousHtmlOverflow;
      body.style.overflowY = previousBodyOverflow;
    };
  }, []);

  return <>{children}</>;
}
