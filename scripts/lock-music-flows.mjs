import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SALVIAN AI MUSIC FLOW LOCK
 *
 * The verified Suno, Mureka and Music 2.5 flows are intentionally frozen.
 * The feature boundary is also frozen: Music owns neither user login/session nor
 * billing/credit/checkout. Parent SALVIAN AI owns those concerns.
 * If any protected production file changes, the production build MUST stop.
 *
 * To intentionally change a protected flow or boundary: update the implementation,
 * test it, review the diff, then update the expected SHA in this file in the same reviewed change.
 */

const ROOT = process.cwd();
const LOCKED = {
  // Core engine gateway: Mureka + Music 2.5 + Suno.
  "app/api/music/route.ts": "be8b429bfeef2ced3a93f6181fc33bbcb77828fd",

  // Suno reference/create/status path.
  "app/api/music/suno-safe-create/route.ts": "cae0169db067a69a1a2bbb8b1d96492f4ebdfc69",
  "app/api/music/suno-upload/route.ts": "2311ed4435b575abd0f6e7b265646f06a2fb052a",
  "app/api/music/reference-presign/route.ts": "00186efe8942dba48e5b9cd60094df31bbb86f1f",
  "app/api/music/reference-upload/route.ts": "6d3dc1cf15e2d2c52b7d38aabfadbd5cc22a1134",

  // Shared music upload/result paths.
  "app/api/music/upload/route.ts": "69e7cd70a4ca40910086140e9188f80929a7b8f5",
  "app/api/music/audio/route.ts": "20a3ed4be271946c56424658f1096fc1cc81a6ad",
  "app/api/music/remix/route.ts": "e73387eecff44cf5139ccb81c766f99e8a028fc5",
  "app/api/music/instrumental/route.ts": "d8e4aabf2f76d3f5a76b3ebad616273602d66ef3",

  // Persisted project/task state used by the working result flow.
  "lib/server-music-projects.ts": "8534334ca11c701765d90e5d88d8c83ad007a58a",

  // Layer 1/2 UI and the upload bridge. Keep the working screens unchanged.
  "components/music-generation-shell.tsx": "5cac6848e5ef794c02c478a8bdac085180dbe6cd",
  "components/music-upload-bridge.tsx": "83e782a0c8084372f633da16bbd8a837a9c7b9d4",
  "components/premium-music-studio.tsx": "50acfd01b4a9fe04dfd3cd7824da81962b20a7bd",
  "components/stage2-reference-flow.tsx": "c976995df703f6bc26fe36f02e78edad83bf0e39",

  // Feature boundary and build definition. These must not be weakened.
  "scripts/enforce-music-feature-boundary.mjs": "28145815d4130b3da1ebcb4a5ec5a58ae9e99394",
  "package.json": "24753fef818fd1b92e43b9834deb3e8948f31300",

  // Build-time hardening that made the three providers stable.
  "scripts/fix-suno-custom-payload.mjs": "43a3bf9d6e0fc7fd43e5580ad2f6d49900f4fae1",
  "scripts/harden-suno-status.mjs": "c8cc32b71c6e4c83d02cfec27ccc8fb182b43abc",
  "scripts/enhance-mureka-vocal-quality.mjs": "ca46f9e57434f758112143fb157f4e4d97d580ff",
  "scripts/patch-eleven-music.mjs": "881af4881aa1c232e5a08c40edf57072f679feff",
  "scripts/fix-music-types.mjs": "d740861355fd221a765564fcfef49682c8cd8ae5",
  "scripts/brand-music-engines.mjs": "105072915e7959239a3589e55db2cd6f961d1720",
};

function gitBlobSha(text) {
  const body = Buffer.from(text, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, body])).digest("hex");
}

const failures = [];
for (const [relativePath, expected] of Object.entries(LOCKED)) {
  const absolutePath = join(ROOT, relativePath);
  let actual;
  try {
    actual = gitBlobSha(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: missing/unreadable (${error.message})`);
    continue;
  }
  if (actual !== expected) {
    failures.push(`${relativePath}: LOCKED SHA mismatch (expected ${expected}, got ${actual})`);
  }
}

if (failures.length) {
  console.error("\nSALVIAN AI MUSIC FLOW LOCK: BUILD BLOCKED");
  console.error("A protected working flow or the feature boundary was changed. No production build is allowed until the change is reviewed and the lock is deliberately updated.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SALVIAN AI MUSIC FLOW LOCK: OK (${Object.keys(LOCKED).length} protected files verified)`);
