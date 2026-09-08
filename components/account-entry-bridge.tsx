"use client";

import { useEffect } from "react";

const CREATOR_ACCOUNT = "https://salvian-ai-creator.vercel.app/akun.html?from=music";

export default function AccountEntryBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;

      const label = button.textContent?.replace(/\s+/g, " ").trim() || "";
      if (label.includes("Masuk / Cek") || label.includes("Cek / Masuk Akun")) {
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(CREATOR_ACCOUNT);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
