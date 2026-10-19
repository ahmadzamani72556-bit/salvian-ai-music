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
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js" strategy="beforeInteractive" />
        <Script src="/remix-duration-guard.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
