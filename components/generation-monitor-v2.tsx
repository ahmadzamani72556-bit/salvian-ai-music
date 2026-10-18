"use client";

// Compatibility shim: the legacy monitor previously depended on Neon Auth.
// Music generation no longer has a login/billing flow, so all monitoring uses
// the standalone provider-status monitor instead.
export { default } from "./generation-monitor-v3";
