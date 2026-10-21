import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL belum tersedia di SALVIAN AI MUSIC.");
  return neon(DATABASE_URL);
}

type MusicProjectBody = {
  title: string;
  lyrics: string;
  style: string;
  model: string;
  taskId: string | null;
  status: string;
  audioUrl: string | null;
  providerData: unknown;
};

function billingForModel(model: string) {
  const value = String(model || "").toLowerCase();
  if (value.includes("suno")) return { provider: "suno_v6", label: "Suno · Salvian AI Ultimate", cost: 700 };
  if (value.includes("music_v2_5") || value.includes("eleven")) return { provider: "eleven_music_v2_5", label: "Eleven Music v2.5 · Salvian AI Elite", cost: 500 };
  return { provider: "mureka", label: "Mureka · Salvian AI Pro", cost: 450 };
}

export async function createMusicProjectServer(userId: string, body: MusicProjectBody) {
  if (!userId || !body.taskId) throw new Error("Parameter create project tidak valid.");
  const sql = getSql();
  const billing = billingForModel(body.model);
  const incomingProviderData = body.providerData == null ? {} : body.providerData;
  const providerData = {
    ...(typeof incomingProviderData === "object" && incomingProviderData !== null ? incomingProviderData as Record<string, unknown> : {}),
    billingProvider: billing.provider,
    billingLabel: billing.label,
    billingCost: billing.cost,
    billingCharged: true,
    billingRefunded: false,
  };
  const description = `Pembuatan lagu SALVIAN AI MUSIC · ${billing.label}`;

  const rows = await sql`
    WITH charged AS (
      UPDATE public.salvian_profiles
      SET credits = credits - ${billing.cost}, updated_at = now()
      WHERE auth_user_id = ${userId} AND credits >= ${billing.cost}
      RETURNING auth_user_id, credits
    ),
    transaction_row AS (
      INSERT INTO public.salvian_credit_transactions
        (auth_user_id, amount, balance_after, type, description)
      SELECT auth_user_id, -${billing.cost}, credits, 'USAGE', ${description}
      FROM charged
      RETURNING id
    )
    INSERT INTO public.salvian_music_projects
      (user_id, title, lyrics, style, model, task_id, status, audio_url, provider_data, updated_at)
    SELECT
      ${userId}, ${body.title}, ${body.lyrics}, ${body.style}, ${body.model}, ${body.taskId}, ${body.status}, ${body.audioUrl}, ${JSON.stringify(providerData)}::jsonb, now()
    FROM charged
    RETURNING id, user_id, task_id, status, audio_url, updated_at
  `;

  if (!rows?.[0]) {
    throw new Error(`Kredit tidak mencukupi. Pembuatan lagu ${billing.label} membutuhkan ${billing.cost} kredit.`);
  }
  return rows[0];
}

export async function ownsMusicTaskServer(userId: string, taskId: string) {
  if (!userId || !taskId) return false;
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM public.salvian_music_projects
    WHERE user_id = ${userId} AND task_id = ${taskId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getMusicProjectServer(userId: string, taskId: string) {
  if (!userId || !taskId) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, task_id, status, audio_url, provider_data
    FROM public.salvian_music_projects
    WHERE user_id = ${userId} AND task_id = ${taskId}
    LIMIT 1
  `;
  return rows?.[0] ?? null;
}

export async function listMusicProjectsServer(userId: string) {
  if (!userId) return [];
  const sql = getSql();
  return await sql`
    SELECT id, title, lyrics, style, model, status, audio_url, created_at, updated_at
    FROM public.salvian_music_projects
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function updateMusicProjectServer(userId: string, taskId: string, status: string, audioUrl: string | null, providerData: unknown) {
  if (!userId || !taskId) throw new Error("Parameter update project tidak valid.");
  const sql = getSql();
  const incoming = typeof providerData === "object" && providerData !== null ? providerData as Record<string, unknown> : {};
  const failed = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));

  if (failed) {
    const rows = await sql`
      WITH existing AS (
        SELECT provider_data
        FROM public.salvian_music_projects
        WHERE user_id = ${userId} AND task_id = ${taskId}
        FOR UPDATE
      ),
      refunded AS (
        UPDATE public.salvian_profiles p
        SET credits = p.credits + COALESCE((e.provider_data->>'billingCost')::integer, 0), updated_at = now()
        FROM existing e
        WHERE p.auth_user_id = ${userId}
          AND COALESCE((e.provider_data->>'billingCharged')::boolean, false) = true
          AND COALESCE((e.provider_data->>'billingRefunded')::boolean, false) = false
          AND COALESCE((e.provider_data->>'billingCost')::integer, 0) > 0
        RETURNING p.credits
      ),
      refund_transaction AS (
        INSERT INTO public.salvian_credit_transactions
          (auth_user_id, amount, balance_after, type, description)
        SELECT ${userId}, COALESCE((e.provider_data->>'billingCost')::integer, 0), r.credits, 'REFUND',
          'Refund pembuatan lagu SALVIAN AI MUSIC · ' || COALESCE(e.provider_data->>'billingLabel', 'Music')
        FROM existing e CROSS JOIN refunded r
        RETURNING id
      )
      UPDATE public.salvian_music_projects m
      SET status = ${status},
          audio_url = ${audioUrl},
          provider_data = COALESCE(m.provider_data, '{}'::jsonb)
            || ${JSON.stringify(incoming)}::jsonb
            || CASE WHEN EXISTS (SELECT 1 FROM refunded) THEN '{"billingRefunded":true}'::jsonb ELSE '{}'::jsonb END,
          updated_at = now()
      WHERE m.user_id = ${userId} AND m.task_id = ${taskId}
      RETURNING id, user_id, task_id, status, audio_url, updated_at
    `;
    return rows?.[0] ?? null;
  }

  const rows = await sql`
    UPDATE public.salvian_music_projects
    SET status = ${status},
        audio_url = ${audioUrl},
        provider_data = COALESCE(provider_data, '{}'::jsonb) || ${JSON.stringify(incoming)}::jsonb,
        updated_at = now()
    WHERE user_id = ${userId} AND task_id = ${taskId}
    RETURNING id, user_id, task_id, status, audio_url, updated_at
  `;
  return rows?.[0] ?? null;
}

export async function deleteMusicProjectServer(userId: string, id: string) {
  if (!userId || !id) return false;
  const sql = getSql();
  const rows = await sql`
    DELETE FROM public.salvian_music_projects
    WHERE user_id = ${userId} AND id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}
