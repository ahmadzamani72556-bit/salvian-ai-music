import type { Metadata } from "next";
import "./globals.css";
import GenerationMonitorV3 from "../components/generation-monitor-v3";

export const metadata: Metadata = {
  title: "SALVIAN AI MUSIC STUDIO — Premium AI Music Creation",
  description: "Studio AI musik kelas premium untuk membuat, mengembangkan, dan mengelola karya musik dengan AI.",
  icons: {
    icon: "/salvian-ai-logo.svg",
    shortcut: "/salvian-ai-logo.svg",
    apple: "/salvian-ai-logo.svg",
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
