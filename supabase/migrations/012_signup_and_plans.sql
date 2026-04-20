-- Migration 012: Signup flow, commercial plans, coupons

-- 1. Expand organizations with commercial/signup fields
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS signup_email text;

-- Add CHECK constraints separately (so we can handle CHECK IF NOT EXISTS manually)
DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_document_type_check CHECK (document_type IN ('cpf', 'cnpj') OR document_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_subscription_status_check CHECK (subscription_status IN ('pending_payment', 'active', 'suspended', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Rename plan values to commercial names (pro → plus, enterprise → premium)
UPDATE public.organizations SET plan='plus'    WHERE plan='pro';
UPDATE public.organizations SET plan='premium' WHERE plan='enterprise';

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check CHECK (plan IN ('basic', 'plus', 'premium'));

-- 3. Backfill: existing organizations are already active (assumed paying customers)
UPDATE public.organizations
  SET subscription_status='active'
  WHERE subscription_status='pending_payment';

-- 4. Coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
  discount_value numeric NOT NULL,
  max_uses int,
  uses_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Super admin can manage everything
DROP POLICY IF EXISTS "super_admin_manage_coupons" ON public.coupons;
CREATE POLICY "super_admin_manage_coupons" ON public.coupons FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- Anyone (including anon) can read active coupons — needed for validation during signup
DROP POLICY IF EXISTS "anon_read_active_coupons" ON public.coupons;
CREATE POLICY "anon_read_active_coupons" ON public.coupons FOR SELECT
  USING (active = true);
