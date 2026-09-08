import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Server-only database helpers.
 * DATABASE_URL must never be exposed to the browser or NEXT_PUBLIC_* variables.
 */
function getSql() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL belum tersedia di SALVIAN AI MUSIC.");
  }
  return neon(DATABASE_URL);
}

export async function refundMusicCreditsServer(
  userId: string,
  amount: number,
  description: string
) {
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Parameter refund kredit tidak valid.");
  }

  const sql = getSql();
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

/**
 * The client is intentionally denied UPDATE on salvian_music_projects.
 * Generation status/audio/provider data therefore must be written here,
 * from the privileged server connection, and only for the authenticated user's row.
 */
export async function updateMusicProjectServer(
  userId: string,
  taskId: string,
  status: string,
  audioUrl: string | null,
  providerData: unknown
) {
  if (!userId || !taskId) {
    throw new Error("Parameter update project tidak valid.");
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE public.salvian_music_projects
    SET
      status = ${status},
      audio_url = ${audioUrl},
      provider_data = ${providerData == null ? null : JSON.stringify(providerData)}::jsonb,
      updated_at = now()
    WHERE user_id = ${userId}
      AND task_id = ${taskId}
    RETURNING id, user_id, task_id, status, audio_url, updated_at
  `;

  return rows?.[0] ?? null;
}
