import type { Metadata } from "next";
import "./globals.css";
import AiAssistant from "../components/ai-assistant";
import GenerationMonitorV3 from "../components/generation-monitor-v3";
import PremiumMusicStudio from "../components/premium-music-studio";

export const metadata: Metadata = {
  title: "SALVIAN AI MUSIC STUDIO — Premium AI Music Creation",
  description: "Studio AI musik kelas premium untuk menciptakan karya musik dengan AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {children}
        <GenerationMonitorV3 />
        <AiAssistant />
        <PremiumMusicStudio />
      </body>
    </html>
  );
}
