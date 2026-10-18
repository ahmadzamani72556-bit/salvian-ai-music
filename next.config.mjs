import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * SALVIAN AI MUSIC is a feature workspace without its own login.
 * Legacy client components still import Neon JS, so resolve that import to the
 * local anonymous workspace shim. No Neon Auth network/session is used.
 */
export default {
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@neondatabase/neon-js": path.join(root, "lib/neon-authless-shim.ts"),
    };
    return config;
  },
};
