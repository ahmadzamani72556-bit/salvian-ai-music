"use client";

import { type ReactNode, useEffect, useState } from "react";

type Props = { children: ReactNode };

/**
 * Stage-2 reference-flow guard.
 *
 * Stage 2 must always start without a previously uploaded Audio Referensi or
 * Voice & Vocal. The old draft may still contain those fields from an earlier
 * version of the Studio. We clean them BEFORE mounting PremiumMusicStudio so
 * its initial localStorage restore can never put the stale audio back into
 * React state.
 *
 * Prompt, lyrics, model, tempo, language and other Studio settings are kept.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const key = "salvian_music_stage2_draft";
      const raw = window.localStorage.getItem(key);

      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === "object" && !Array.isArray(draft)) {
          delete draft.referenceId;
          delete draft.referenceRemixId;
          delete draft.referenceName;
          delete draft.referenceEngine;
          delete draft.vocalId;
          delete draft.vocalName;
          delete draft.vocalEngine;
          window.localStorage.setItem(key, JSON.stringify(draft));
        } else {
          window.localStorage.removeItem(key);
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

    setReady(true);

    return () => {
      html.style.overflowY = previousHtmlOverflow;
      body.style.overflowY = previousBodyOverflow;
    };
  }, []);

  // Do not mount the Studio until stale audio state has been removed. This is
  // the important part: PremiumMusicStudio's own restore effect can now only
  // see a clean reference/vocal state.
  if (!ready) return null;

  return <>{children}</>;
}
