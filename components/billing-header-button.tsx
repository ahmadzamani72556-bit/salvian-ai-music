"use client";

import { CreditCard } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const BILLING_URL = "https://salvianai.sovira.id/billing";

export default function BillingHeaderButton() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const attach = () => {
      const root = document.querySelector("[data-premium-studio]");
      const header = root?.querySelector("header");
      if (!header) return;

      let target = header.querySelector<HTMLElement>("[data-salvian-billing-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-salvian-billing-host", "true");
        target.style.position = "absolute";
        target.style.left = "50%";
        target.style.top = "50%";
        target.style.transform = "translate(-50%, -50%)";
        target.style.zIndex = "2";
        header.insertBefore(target, header.querySelector("button"));
      }
      setHost(target);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;

  return createPortal(
    <a
      href={BILLING_URL}
      aria-label="Buka Billing SALVIAN AI"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl border border-violet-300/60 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-700 shadow-sm transition hover:bg-violet-100 sm:gap-2 sm:px-4 sm:text-sm"
    >
      <CreditCard size={16} />
      <span className="sm:hidden">Billing</span>
      <span className="hidden sm:inline">Billing SALVIAN AI</span>
    </a>,
    host,
  );
}
