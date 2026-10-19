"use client";

import { ReactNode } from "react";

// The results screen and its navigation now live inside the Studio's four-item
// mobile bottom navigation. Keep this wrapper transparent: no floating shortcut.
export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
