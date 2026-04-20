-- Migration 013: Extended coupon fields (description, observation, valid_from)
-- Adds descriptive and validity-start fields to the existing coupons table.

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS observation text,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz;

-- Index for quick filtering of currently-valid coupons
CREATE INDEX IF NOT EXISTS coupons_active_valid_idx
  ON public.coupons (active, valid_from, expires_at)
  WHERE active = true;
