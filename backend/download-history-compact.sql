-- ============================================================
-- Supabase Migration - Compact User Download History
-- ============================================================
-- Safe to run on an existing project. This keeps only one profile-history row
-- per user/app/download_type, so repeated downloads refresh the timestamp
-- instead of creating duplicate rows.

WITH ranked_history AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, app_id, download_type
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM public.download_history
)
DELETE FROM public.download_history
WHERE id IN (
  SELECT id
  FROM ranked_history
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_download_history_user_app_type
  ON public.download_history(user_id, app_id, download_type);
