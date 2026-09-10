import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL belum tersedia di SALVIAN AI MUSIC.");
  return neon(DATABASE_URL);
}

export async function refundMusicCreditsServer(userId: string, amount: number, description: string) {
  if (!userId || !Number.isFinite(amount) || amount <= 0) throw new Error("Parameter refund kredit tidak valid.");
  const sql = getSql();
  const rows = await sql`SELECT * FROM public.salvian_refund_credits_server(${userId}, ${Math.floor(amount)}, ${description})`;
  return rows?.[0] ?? null;
}

export async function createMusicProjectServer(userId: string, body: { title: string; lyrics: string; style: string; model: string; taskId: string | null; status: string; audioUrl: string | null; providerData: unknown }) {
  if (!userId || !body.taskId) throw new Error("Parameter create project tidak valid.");
  const sql = getSql();
  const rows = await sql`
    INSERT INTO public.salvian_music_projects
      (user_id, title, lyrics, style, model, task_id, status, audio_url, provider_data, updated_at)
    VALUES
      (${userId}, ${body.title}, ${body.lyrics}, ${body.style}, ${body.model}, ${body.taskId}, ${body.status}, ${body.audioUrl}, ${body.providerData == null ? null : JSON.stringify(body.providerData)}::jsonb, now())
    RETURNING id, user_id, task_id, status, audio_url, updated_at
  `;
  return rows?.[0] ?? null;
}

export async function ownsMusicTaskServer(userId: string, taskId: string) {
  if (!userId || !taskId) return false;
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM public.salvian_music_projects
    WHERE user_id = ${userId} AND task_id = ${taskId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function listMusicProjectsServer(userId: string) {
  if (!userId) return [];
  const sql = getSql();
  return await sql`
    SELECT id, title, lyrics, style, model, task_id, status, audio_url, created_at, updated_at
    FROM public.salvian_music_projects
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function updateMusicProjectServer(userId: string, taskId: string, status: string, audioUrl: string | null, providerData: unknown) {
  if (!userId || !taskId) throw new Error("Parameter update project tidak valid.");
  const sql = getSql();
  const failed = ["failed", "failure", "timeouted", "timeout", "timedout", "timed_out", "cancelled", "canceled", "error"].some(v => status === v || status.includes(v));
  if (!failed) {
    const rows = await sql`
      UPDATE public.salvian_music_projects
      SET status = ${status}, audio_url = ${audioUrl}, provider_data = ${providerData == null ? null : JSON.stringify(providerData)}::jsonb, updated_at = now()
      WHERE user_id = ${userId} AND task_id = ${taskId}
      RETURNING id, user_id, task_id, status, audio_url, updated_at
    `;
    return rows?.[0] ?? null;
  }
  const refundAmount = Math.max(1, Number(process.env.SALVIAN_MUSIC_CREDIT_COST || 100));
  const refundDescription = "Refund otomatis karena task Mureka SALVIAN AI MUSIC gagal";
  const baseProviderData = providerData && typeof providerData === "object" && !Array.isArray(providerData) ? providerData as Record<string, unknown> : {};
  const failedProviderData = { ...baseProviderData, credit_refunded: true, credit_refunded_at: new Date().toISOString() };
  const rows = await sql`
    WITH marked AS (
      UPDATE public.salvian_music_projects
      SET status = ${status}, audio_url = ${audioUrl}, provider_data = ${JSON.stringify(failedProviderData)}::jsonb, updated_at = now()
      WHERE user_id = ${userId} AND task_id = ${taskId} AND COALESCE(provider_data->>'credit_refunded', 'false') <> 'true'
      RETURNING id
    ), refunded AS (
      SELECT public.salvian_refund_credits_server(${userId}, ${Math.floor(refundAmount)}, ${refundDescription}) AS result
      FROM marked
    )
    SELECT p.id, p.user_id, p.task_id, p.status, p.audio_url, p.updated_at
    FROM public.salvian_music_projects p
    WHERE p.user_id = ${userId} AND p.task_id = ${taskId}
  `;
  return rows?.[0] ?? null;
}
