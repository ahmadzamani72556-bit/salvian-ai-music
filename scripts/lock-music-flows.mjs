/**
 * SALVIAN AI MUSIC FLOW LOCK
 *
 * Music is a feature of parent SALVIAN AI. It owns neither user login/session
 * nor billing/credit/checkout. This build gate requires the exact reviewed
 * production commit so protected Music flows cannot drift silently.
 *
 * When a protected production change is intentionally reviewed, update the
 * reviewed commit SHA here in the same change.
 */

const REVIEWED_COMMIT = "7ebb94c4fa2658a8263a9ad4050d330617da1073";
const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim();

if (!commit) {
  console.error("\nSALVIAN AI MUSIC FLOW LOCK: BUILD BLOCKED");
  console.error("VERCEL_GIT_COMMIT_SHA is missing; refusing to build an unverified Music production source.\n");
  process.exit(1);
}

if (commit !== REVIEWED_COMMIT) {
  console.error("\nSALVIAN AI MUSIC FLOW LOCK: BUILD BLOCKED");
  console.error(`Protected Music source changed. Expected reviewed commit ${REVIEWED_COMMIT}, got ${commit}.`);
  console.error("Review the Music flow, billing boundary, and protected files, then deliberately update REVIEWED_COMMIT in the same reviewed change.\n");
  process.exit(1);
}

console.log(`SALVIAN AI MUSIC FLOW LOCK: OK (reviewed commit ${commit})`);
