"use client";

import type { ReactNode } from "react";

/**
 * The legacy generation/result overlay has been retired.
 * The Premium Music Studio owns generation progress and Library results now.
 * Keeping this wrapper transparent prevents a second, stale progress screen
 * from covering the active studio after a song is finished.
 */
export default function MusicGenerationShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
