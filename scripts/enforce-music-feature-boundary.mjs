import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SALVIAN AI MUSIC FEATURE BOUNDARY
 *
 * SALVIAN AI MUSIC is a feature of the parent SALVIAN AI application.
 * It MUST NOT own a user-login/session flow or a user billing/credit/checkout flow.
 * Parent SALVIAN AI owns those concerns and may provide identity/billing context later.
 *
 * This script runs before next build. It removes legacy provider-card billing labels
 * from the generated feature UI and then blocks the build if application-level auth or
 * billing implementation is detected in the music feature source tree.
 * Provider API credentials (MUREKA_API_KEY, SUNO_API_KEY, ELEVENLABS_API_KEY, etc.)
 * remain valid because they authenticate server-to-provider requests, not end users.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);

const forbidden = [
  /from\s+["'](?:next-auth|@supabase\/auth|@clerk|firebase\/auth)/,
  /(?:signIn|signOut|createCheckoutSession|checkoutSession|stripeCheckout|createSubscription)\s*\(/,
  /(?:\/api\/login|\/api\/auth|\/api\/billing|\/api\/checkout|\/api\/payment|\/api\/subscription)/,
  /(?:priceId|subscriptionId|billingMode|credits?Balance|creditBalance|walletBalance)\s*[:=]/,
  /(?:new\s+Stripe|stripe\.)/,
  /Billing\s*:/,
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) out.push(path);
  }
  return out;
}

// Legacy labels are presentation only, but they incorrectly suggest that this feature
// owns provider billing. Strip them at build time without touching the verified music flow.
const premium = join(ROOT, "components", "premium-music-studio.tsx");
if (existsSync(premium)) {
  const before = readFileSync(premium, "utf8");
  const after = before
    .replace(/,\s*\"Billing:\s*Mureka\"/g, "")
    .replace(/,\s*\"Billing:\s*Eleven Elite\"/g, "")
    .replace(/,\s*\"Billing:\s*Suno Ultimate\"/g, "");
  if (after !== before) writeFileSync(premium, after, "utf8");
}

const failures = [];
for (const relative of SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)).map((p) => p.slice(ROOT.length + 1)))) {
  const text = readFileSync(join(ROOT, relative), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) failures.push(`${relative}: forbidden standalone auth/billing pattern (${pattern})`);
  }
}

if (existsSync(join(ROOT, "lib", "music-plans.ts"))) {
  failures.push("lib/music-plans.ts: standalone music billing plan must not exist");
}

if (failures.length) {
  console.error("\nSALVIAN AI MUSIC FEATURE BOUNDARY: BUILD BLOCKED");
  console.error("Music is a feature only. User login/session and billing/credit/checkout must remain in parent SALVIAN AI.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SALVIAN AI MUSIC FEATURE BOUNDARY: OK (no standalone login or billing flow)");
