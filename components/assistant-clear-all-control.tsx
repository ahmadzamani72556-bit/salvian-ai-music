"use client";

import { Trash2 } from "lucide-react";
import { useEffect } from "react";

export default function AssistantClearAllControl() {
  useEffect(() => {
    const install = () => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"]');
      const header = dialog?.querySelector<HTMLElement>("header");
      if (!header || header.querySelector("[data-salvian-clear-all]") || !dialog) return;

      const clearButton = Array.from(header.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => (button.textContent || "").replace(/\s+/g, " ").trim().includes("Percakapan baru"),
      );
      if (!clearButton) return;

      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-salvian-clear-all", "true");
      button.setAttribute("aria-label", "Hapus semua pesan di layar");
      button.title = "Hapus semua pesan di layar";
      button.className = "inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10";
      button.innerHTML = '<span aria-hidden="true"></span><span class="salvian-clear-label">Hapus</span>';
      const iconHost = button.firstElementChild as HTMLElement | null;
      if (iconHost) {
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = "🗑️";
        iconHost.replaceWith(icon);
      }
      button.addEventListener("click", () => {
        clearButton.click();
      });

      clearButton.parentElement?.insertBefore(button, clearButton);
    };

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
