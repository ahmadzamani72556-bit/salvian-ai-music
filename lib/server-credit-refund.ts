import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Server-only credit refund path.
 * DATABASE_URL must never be exposed to the browser or NEXT_PUBLIC_* variables.
 */
export async function refundMusicCreditsServer(
  userId: string,
  amount: number,
  description: string
) {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL belum tersedia di SALVIAN AI MUSIC.");
  }
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Parameter refund kredit tidak valid.");
  }

  const sql = neon(DATABASE_URL);
  const rows = await sql`
    SELECT *
    FROM public.salvian_refund_credits_server(
      ${userId},
      ${Math.floor(amount)},
      ${description}
    )
  `;

  return rows?.[0] ?? null;
}
