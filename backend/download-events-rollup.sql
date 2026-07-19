-- ============================================================
-- Supabase Migration - Temporary Download Events for JSON Rollup
-- ============================================================
-- Safe to run on an existing project. This does not drop user history.

CREATE TABLE IF NOT EXISTS public.download_events (
  id            BIGSERIAL PRIMARY KEY,
  app_id        BIGINT NOT NULL,
  game_name     TEXT,
  download_type TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_events_created
  ON public.download_events(created_at, id);

CREATE INDEX IF NOT EXISTS idx_download_events_app
  ON public.download_events(app_id);

ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

-- No public policies for download_events. Only the service role should insert,
-- read, and delete rows for the daily GitHub Action rollup.

CREATE OR REPLACE FUNCTION public.get_popular_downloads()
RETURNS TABLE(appId TEXT, gameName TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.app_id::text AS appId,
    COALESCE(de.game_name, 'Unknown Game') AS gameName,
    COUNT(de.id) AS count
  FROM public.download_events de
  GROUP BY de.app_id, de.game_name
  ORDER BY count DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
