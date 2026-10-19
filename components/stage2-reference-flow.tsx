"use client";

import { type ReactNode, useEffect } from "react";

type Props = { children: ReactNode };

/**
 * Stage-2 reference-flow guard.
 *
 * The actual Mureka upload + Remix handoff is owned by
 * PremiumMusicStudio -> /api/music/upload -> /api/music/remix.
 *
 * A previous draft could restore an old Audio Referensi after reload. That
 * stale reference then remained active while the user tried to upload a new
 * file. Stage 2 must start clean: the old reference is not persisted across
 * a new Stage-2 session. Prompt/lyrics/settings remain intact.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  useEffect(() => {
    // Remove only stale reference/vocal upload state. Never delete the user's
    // lyrics, concept, model, tempo, or other Studio settings.
    try {
      const key = "salvian_music_stage2_draft";
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === "object") {
          delete draft.referenceId;
          delete draft.referenceRemixId;
          delete draft.referenceName;
          delete draft.referenceEngine;
          delete draft.vocalId;
          delete draft.vocalName;
          delete draft.vocalEngine;
          window.localStorage.setItem(key, JSON.stringify(draft));
        }
      }
    } catch {
      // A malformed old draft must never block Stage 2.
      window.localStorage.removeItem("salvian_music_stage2_draft");
    }

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
