import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SALVIAN AI MUSIC",
  description: "Create original songs with AI — lyrics, style, vocals and more.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
