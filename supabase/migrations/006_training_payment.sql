-- ================================================
-- MIGRATION 006: Pagamento por treino em member_attendances
-- Execute no Supabase SQL Editor
-- ================================================

ALTER TABLE public.member_attendances
  ADD COLUMN IF NOT EXISTS payment_type text
    CHECK (payment_type IN ('drop_in', 'weekly', 'monthly', 'semiannual', 'annual')),
  ADD COLUMN IF NOT EXISTS payment_status text
    CHECK (payment_status IN ('pending', 'paid')) DEFAULT 'pending';
