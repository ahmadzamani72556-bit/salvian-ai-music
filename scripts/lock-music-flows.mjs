import { execFileSync } from "node:child_process";

/**
 * SALVIAN AI MUSIC FLOW LOCK
 *
 * The verified Suno, Mureka and Music 2.5 flows are intentionally frozen.
 * The feature boundary is also frozen: Music owns neither user login/session nor
 * billing/credit/checkout. Parent SALVIAN AI owns those concerns.
 * If any protected production file changes in the reviewed commit, the production
 * build MUST stop. The lock reads Git's committed blob SHA directly so Vercel's
 * working-tree line-ending normalization cannot create false mismatches.
 */

const LOCKED = {
  "app/api/music/route.ts": "be8b429bfeef2ced3a93f6181fc33bbcb77828fd",
  "app/api/music/suno-safe-create/route.ts": "cae0169db067a69a1a2bbb8b1d96492f4ebdfc69",
  "app/api/music/suno-upload/route.ts": "2311ed4435b575abd0f6e7b265646f06a2fb052a",
  "app/api/music/reference-presign/route.ts": "00186efe8942dba48e5b9cd60094df31bbb86f1f",
  "app/api/music/reference-upload/route.ts": "6d3dc1cf15e2d2c52b7d38aabfadbd5cc22a1134",
  "app/api/music/upload/route.ts": "69e7cd70a4ca40910086140e9188f80929a7b8f5",
  "app/api/music/audio/route.ts": "20a3ed4be271946c56424658f1096fc1cc81a6ad",
  "app/api/music/remix/route.ts": "e73387eecff44cf5139ccb81c766f99e8a028fc5",
  "app/api/music/instrumental/route.ts": "d8e4aabf2f76d3f5a76b3ebad616273602d66ef3",
  "app/api/music/charge/route.ts": "45d8f61ba416ab762570b73ea5dbdfe94bd86533",
  "lib/server-music-projects.ts": "8534334ca11c701765d90e5d88d8c83ad007a58a",
  "components/music-generation-shell.tsx": "5cac6848e5ef794c02c478a8bdac085180dbe6cd",
  "components/music-upload-bridge.tsx": "83e782a0c8084372f633da16bbd8a837a9c7b9d4",
  "components/music-billing-gate.tsx": "1ccb3039fe53f61300d059acc10ce3893feb4510",
  "components/premium-music-studio.tsx": "50acfd01b4a9fe04dfd3cd7824da81962b20a7bd",
  "components/stage2-reference-flow.tsx": "c976995df703f6bc26fe36f02e78edad83bf0e39",
  "scripts/enforce-music-feature-boundary.mjs": "28145815d4130b3da1ebcb4a5ec5a58ae9e99394",
  "package.json": "24753fef818fd1b92e43b9834deb3e8948f31300",
  "scripts/fix-suno-custom-payload.mjs": "43a3bf9d6e0fc7fd43e5580ad2f6d49900f4fae1",
  "scripts/harden-suno-status.mjs": "c8cc32b71c6e4c83d02cfec27ccc8fb182b43abc5",
  "scripts/enhance-mureka-vocal-quality.mjs": "ca46f9e57434f758112143fb157f4e4d97d580ff",
  "scripts/patch-eleven-music.mjs": "881af4881aa1c232e5a08c40edf57072f679feff",
  "scripts/fix-music-types.mjs": "d740861355fd221a765564fcfef49682c8cd8ae5",
  "scripts/brand-music-engines.mjs": "105072915e7959239a3589e55db2cd6f961d1720",
};

const failures = [];
for (const [relativePath, expected] of Object.entries(LOCKED)) {
  let actual;
  try {
    actual = execFileSync("git", ["rev-parse", `HEAD:${relativePath}`], { encoding: "utf8" }).trim();
  } catch (error) {
    failures.push(`${relativePath}: committed blob is missing/unreadable (${error.message})`);
    continue;
  }
  if (actual !== expected) {
    failures.push(`${relativePath}: LOCKED SHA mismatch (expected ${expected}, got ${actual})`);
  }
}

if (failures.length) {
  console.error("\nSALVIAN AI MUSIC FLOW LOCK: BUILD BLOCKED");
  console.error("A protected working flow or the feature boundary changed in the committed source. No production build is allowed until the change is reviewed and the lock is deliberately updated.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SALVIAN AI MUSIC FLOW LOCK: OK (${Object.keys(LOCKED).length} protected files verified)`);
