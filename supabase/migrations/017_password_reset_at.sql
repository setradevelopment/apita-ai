-- Forced password change after admin-initiated reset
--
-- Flow: when super_admin (or club admin) resets a user's password, we stamp
-- `password_reset_at = now()`. The dashboard/admin layouts check this column
-- and, if it is within the last 24 hours, redirect the user to a mandatory
-- "change password" page before allowing access. On successful change the
-- column is set back to NULL.
--
-- 24-hour window: if the user never logs in within 24h of the reset, the
-- gate self-expires — they can log in with the temp password normally.
-- This prevents a permanent lock-out if the reset was abandoned or the
-- flag somehow never got cleared.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz;

-- Partial index: only profiles currently flagged pay the indexing cost.
CREATE INDEX IF NOT EXISTS idx_profiles_password_reset_at
  ON public.profiles(password_reset_at)
  WHERE password_reset_at IS NOT NULL;
