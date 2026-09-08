import type { Metadata } from "next";
import "./globals.css";
import AiAssistant from "../components/ai-assistant";
import GenerationMonitor from "../components/generation-monitor";

export const metadata: Metadata = {
  title: "SALVIAN AI MUSIC",
  description: "Create original songs with AI — lyrics, style, vocals and more.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}<GenerationMonitor /><AiAssistant /></body>
    </html>
  );
}
