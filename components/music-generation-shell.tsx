"use client";

import { ReactNode, useEffect } from "react";

// Keep the shell transparent. When the Studio accepts a real music-generation
// request, switch directly to the dedicated second screen: Hasil Lagu & Proses.
// The legacy floating generation monitor is intentionally not used anymore.
export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const openResults = (event: Event) => {
      const detail = (event as CustomEvent<{ generating?: boolean }>).detail;
      if (!detail?.generating) return;

      window.setTimeout(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const resultsButton = buttons.find((button) =>
          button.textContent?.replace(/\s+/g, " ").trim().includes("Hasil Lagu & Proses")
        );
        resultsButton?.click();
      }, 0);
    };

    window.addEventListener("salvian-music-generation-status", openResults);
    return () => window.removeEventListener("salvian-music-generation-status", openResults);
  }, []);

  return <>{children}</>;
}
