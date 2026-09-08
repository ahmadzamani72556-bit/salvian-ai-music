import type { Metadata } from "next";
import "./globals.css";
import GenerationMonitorV3 from "../components/generation-monitor-v3";

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {children}
        <GenerationMonitorV3 />
      </body>
    </html>
  );
}
