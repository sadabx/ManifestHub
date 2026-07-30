-- Forum admin labels and moderation using the existing public.admins table.
-- Safe to rerun after the main backend/forum.sql migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_forum_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_forum_admin_ids(candidate_ids UUID[])
RETURNS TABLE(user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT users.id
  FROM auth.users AS users
  JOIN public.admins AS admins
    ON lower(admins.email) = lower(users.email)
  WHERE users.id = ANY(candidate_ids);
$$;

REVOKE ALL ON FUNCTION public.is_forum_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_forum_admin_ids(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_forum_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_forum_admin_ids(UUID[])
  TO anon, authenticated;

ALTER TABLE public.forum_replies
  DROP CONSTRAINT IF EXISTS forum_replies_parent_id_fkey;
ALTER TABLE public.forum_replies
  ADD CONSTRAINT forum_replies_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.forum_replies(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Users delete own forum posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Owners and admins delete forum posts" ON public.forum_posts;
CREATE POLICY "Owners and admins delete forum posts"
  ON public.forum_posts FOR DELETE
  USING (auth.uid() = author_id OR public.is_forum_admin());

DROP POLICY IF EXISTS "Users delete own forum replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Owners and admins delete forum replies" ON public.forum_replies;
CREATE POLICY "Owners and admins delete forum replies"
  ON public.forum_replies FOR DELETE
  USING (auth.uid() = author_id OR public.is_forum_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';
