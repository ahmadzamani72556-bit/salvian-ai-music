"use client";

// Compatibility shim: keep the legacy import path while removing the old
// Neon Auth-based implementation. The active monitor is provider-status only.
export { default } from "./generation-monitor-v3";
