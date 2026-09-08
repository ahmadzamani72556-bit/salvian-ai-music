"use client";

import { useEffect } from "react";

export default function AccountEntryBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim() || "";
      if (label.includes("Masuk / Cek")) {
        event.preventDefault();
        event.stopPropagation();
        window.location.assign("/account");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
