-- Run this in Supabase SQL Editor AFTER supabase-schema.sql
-- Adds penalty_history table and extends daily_summary with loss columns.

-- ── 1. penalty_history table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.penalty_history (
  id                          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid    REFERENCES public.users(id) ON DELETE CASCADE,
  date                        date    NOT NULL,
  penalty_tier                integer NOT NULL DEFAULT 0,
  consecutive_failures        integer DEFAULT 0,
  xp_lost                     integer DEFAULT 0,
  stats_reduced               jsonb,
  level_before                integer,
  level_after                 integer,
  penalty_quest_assigned      boolean DEFAULT false,
  penalty_quest_completed     boolean DEFAULT false,
  penalty_zone_triggered      boolean DEFAULT false,
  penalty_zone_completed      boolean DEFAULT false,
  penalty_zone_failed         boolean DEFAULT false,
  penalty_zone_duration_seconds integer DEFAULT 0,
  notes                       text,
  created_at                  timestamptz DEFAULT now()
);

ALTER TABLE public.penalty_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own penalty history"
  ON public.penalty_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all penalty_history"
  ON public.penalty_history FOR ALL
  USING (true);

-- ── 2. Extend daily_summary with loss tracking ───────────────────────────────
ALTER TABLE public.daily_summary
  ADD COLUMN IF NOT EXISTS xp_lost       integer DEFAULT 0;

ALTER TABLE public.daily_summary
  ADD COLUMN IF NOT EXISTS stats_reduced jsonb;

ALTER TABLE public.daily_summary
  ADD COLUMN IF NOT EXISTS level_before  integer;

ALTER TABLE public.daily_summary
  ADD COLUMN IF NOT EXISTS level_after   integer;
