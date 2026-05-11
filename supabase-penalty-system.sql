-- ============================================================
-- Penalty System Migration
-- Run in Supabase SQL Editor after supabase-needs-selection.sql
-- ============================================================

-- Add penalty columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS penalty_tier           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_zone_active    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_zone_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS penalty_zone_active_time integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_zone_completed boolean NOT NULL DEFAULT false;

-- Penalty quests table (separate from regular quests)
CREATE TABLE IF NOT EXISTS public.penalty_quests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  xp_reward    integer NOT NULL DEFAULT 120,
  is_completed boolean NOT NULL DEFAULT false,
  date_assigned date NOT NULL,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.penalty_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own penalty quests"
  ON public.penalty_quests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own penalty quests"
  ON public.penalty_quests FOR UPDATE USING (auth.uid() = user_id);

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at   timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- ── RPC: Decrement a single stat (with floor 0) ──────────────
CREATE OR REPLACE FUNCTION public.decrement_stat(
  p_user_id uuid,
  p_stat    text,
  p_amount  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.stats SET %I = GREATEST(0, %I - $1) WHERE user_id = $2',
    p_stat, p_stat
  )
  USING p_amount, p_user_id;
END;
$$;

-- ── RPC: Apply flat penalty to all stats ────────────────────
CREATE OR REPLACE FUNCTION public.apply_all_stat_penalty(
  p_user_id uuid,
  p_amount  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.stats SET
    strength     = GREATEST(0, strength     - p_amount),
    focus        = GREATEST(0, focus        - p_amount),
    discipline   = GREATEST(0, discipline   - p_amount),
    confidence   = GREATEST(0, confidence   - p_amount),
    intelligence = GREATEST(0, intelligence - p_amount),
    purpose      = GREATEST(0, purpose      - p_amount),
    energy       = GREATEST(0, energy       - p_amount)
  WHERE user_id = p_user_id;
END;
$$;
