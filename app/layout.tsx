import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "SALVIAN AI MUSIC STUDIO — Premium AI Music Creation",
  description: "Studio AI musik kelas premium untuk membuat, mengembangkan, dan mengelola karya musik dengan AI.",
  manifest: "/site.webmanifest",
  icons: {
    icon: "/salvian-logo.svg",
    shortcut: "/salvian-logo.svg",
    apple: "/salvian-logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <style dangerouslySetInnerHTML={{ __html: `
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] {
            background: #ffffff !important;
            color: #18181b !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] header {
            background: #ffffff !important;
            color: #18181b !important;
            border-color: #e4e4e7 !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] main,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] section {
            background: #ffffff !important;
            color: #27272a !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] footer {
            background: linear-gradient(to top, #ffffff 82%, rgba(255,255,255,0.96) 94%, rgba(255,255,255,0)) !important;
            border-color: #e4e4e7 !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] form {
            background: #ffffff !important;
            border-color: #d4d4d8 !important;
            box-shadow: 0 12px 30px rgba(15,23,42,0.10) !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] textarea {
            background: #ffffff !important;
            color: #18181b !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] textarea::placeholder {
            color: #a1a1aa !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-white,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-zinc-100,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-zinc-200,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-zinc-300 {
            color: #27272a !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-zinc-500,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .text-zinc-600 {
            color: #71717a !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .border-white\/10,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .border-white\/8 {
            border-color: #e4e4e7 !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-white\/5,
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-white\/10 {
            background: #f8f8fa !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-violet-600\/20 {
            background: #f0e9ff !important;
            color: #4c1d95 !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-\[\#08080d\],
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-\[\#0c0c13\],
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] .bg-\[\#111119\] {
            background: #ffffff !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] button {
            color: #3f3f46;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] footer button[type="submit"] {
            color: #ffffff !important;
            background: linear-gradient(135deg, #7c3aed, #c026d3) !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] > div > div[role="dialog"] {
            background: #ffffff !important;
            color: #18181b !important;
          }
          div[role="dialog"][aria-label="Asisten AI SALVIAN AI MUSIC"] > div > div[role="dialog"] aside {
            background: #ffffff !important;
            border-color: #e4e4e7 !important;
          }
          [data-premium-studio] main > header button {
            color: #4c1d95 !important;
            background: #f3e8ff !important;
            border-color: #c4b5fd !important;
            opacity: 1 !important;
            text-shadow: none !important;
          }
          [data-premium-studio] main > header button svg {
            color: #7c3aed !important;
            opacity: 1 !important;
          }
        ` }} />
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js" strategy="beforeInteractive" />
        <Script src="/remix-duration-guard.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
