-- ================================================
-- MIGRATION 005: Configuração de precificação inteligente
-- Execute no Supabase SQL Editor
-- ================================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS weekly_method text NOT NULL DEFAULT 'fixed'
    CHECK (weekly_method IN ('fixed', 'avulso_x_qty')),
  ADD COLUMN IF NOT EXISTS weekly_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weekly_discount_type text NOT NULL DEFAULT 'none'
    CHECK (weekly_discount_type IN ('none', 'fixed_amount', 'percentage')),
  ADD COLUMN IF NOT EXISTS weekly_discount_value numeric(10,2) NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS monthly_method text NOT NULL DEFAULT 'fixed'
    CHECK (monthly_method IN ('fixed', 'avulso_x_qty')),
  ADD COLUMN IF NOT EXISTS monthly_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS monthly_discount_type text NOT NULL DEFAULT 'none'
    CHECK (monthly_discount_type IN ('none', 'fixed_amount', 'percentage')),
  ADD COLUMN IF NOT EXISTS monthly_discount_value numeric(10,2) NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS semiannual_method text NOT NULL DEFAULT 'fixed'
    CHECK (semiannual_method IN ('fixed', 'avulso_x_qty')),
  ADD COLUMN IF NOT EXISTS semiannual_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS semiannual_discount_type text NOT NULL DEFAULT 'none'
    CHECK (semiannual_discount_type IN ('none', 'fixed_amount', 'percentage')),
  ADD COLUMN IF NOT EXISTS semiannual_discount_value numeric(10,2) NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS annual_method text NOT NULL DEFAULT 'fixed'
    CHECK (annual_method IN ('fixed', 'avulso_x_qty')),
  ADD COLUMN IF NOT EXISTS annual_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS annual_discount_type text NOT NULL DEFAULT 'none'
    CHECK (annual_discount_type IN ('none', 'fixed_amount', 'percentage')),
  ADD COLUMN IF NOT EXISTS annual_discount_value numeric(10,2) NOT NULL DEFAULT 0;
