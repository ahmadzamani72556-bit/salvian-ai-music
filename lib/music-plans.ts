export type MusicEngine = "mureka" | "eleven_music_v2_5" | "suno_v6";

export type MusicBillingMode = "credits" | "monthly_pass";

export type MusicPlanId = "music_monthly";

/**
 * Pricing is intentionally omitted for now.
 * Salvian AI will supply the final price/catalog later.
 */
export type MusicPlan = {
  id: MusicPlanId;
  name: string;
  billingMode: MusicBillingMode;
  durationDays: number;
  engines: readonly MusicEngine[];
  priceId: string | null;
};

export const MUSIC_ENGINES: readonly MusicEngine[] = [
  "mureka",
  "eleven_music_v2_5",
  "suno_v6",
];

export const MUSIC_MONTHLY_PLAN: MusicPlan = {
  id: "music_monthly",
  name: "Salvian AI Music Monthly",
  billingMode: "monthly_pass",
  durationDays: 30,
  engines: MUSIC_ENGINES,
  priceId: null,
};

export function getMusicPlan(planId: string | null | undefined): MusicPlan | null {
  if (planId === MUSIC_MONTHLY_PLAN.id) return MUSIC_MONTHLY_PLAN;
  return null;
}

export function canUseMusicEngine(
  plan: MusicPlan | null,
  engine: string,
): engine is MusicEngine {
  return Boolean(
    plan &&
      plan.engines.includes(engine as MusicEngine),
  );
}

export function shouldChargeMusicCredits(
  billingMode: MusicBillingMode,
): boolean {
  return billingMode === "credits";
}

export function isMonthlyMusicPassActive(
  startsAt: Date | string,
  now = new Date(),
): boolean {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;

  const expiresAt = new Date(start);
  expiresAt.setDate(expiresAt.getDate() + MUSIC_MONTHLY_PLAN.durationDays);
  return now < expiresAt;
}
