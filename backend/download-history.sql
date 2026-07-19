-- ============================================================
-- Supabase Schema - Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop old tables, functions and triggers if they exist
DROP TRIGGER IF EXISTS prune_downloads_trigger ON public.download_history CASCADE;
DROP FUNCTION IF EXISTS public.prune_user_download_history() CASCADE;
DROP FUNCTION IF EXISTS public.prune_download_history() CASCADE;
DROP TABLE IF EXISTS public.download_events CASCADE;
DROP TABLE IF EXISTS public.download_history CASCADE;
DROP TABLE IF EXISTS public.steam_games CASCADE;

-- 2. Create download_history table with BIGSERIAL id, game_name inline
CREATE TABLE public.download_history (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_id        BIGINT NOT NULL,
  game_name     TEXT,
  download_type TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create index for fast per-user lookups
CREATE INDEX idx_dl_history_user ON public.download_history(user_id, created_at DESC);

-- 3b. Create temporary global download event table for daily GitHub Action rollups
-- This table is written by the Cloudflare Worker with the service role key.
-- The browser never reads it directly, and processed rows are deleted after
-- data/download-counts.json has been updated and committed.
CREATE TABLE public.download_events (
  id            BIGSERIAL PRIMARY KEY,
  app_id        BIGINT NOT NULL,
  game_name     TEXT,
  download_type TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_download_events_created ON public.download_events(created_at, id);
CREATE INDEX idx_download_events_app ON public.download_events(app_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policy allowing users to read only their own history
CREATE POLICY "Users can read own history"
  ON public.download_history FOR SELECT
  USING (auth.uid() = user_id);

-- No public policies for download_events. Only the service role should insert,
-- read, and delete rows for the daily rollup job.

-- 6. Trigger to prune downloads (keep last 50 downloads per user)
CREATE OR REPLACE FUNCTION public.prune_user_download_history()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.download_history
  WHERE id IN (
    SELECT id FROM public.download_history
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 50
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prune_downloads_trigger
AFTER INSERT ON public.download_history
FOR EACH ROW
EXECUTE FUNCTION public.prune_user_download_history();

-- 7. Stored Procedure (RPC) for temporary live trending
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
