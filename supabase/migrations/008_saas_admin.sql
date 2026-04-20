-- ================================================
-- MIGRATION 008: SaaS Multi-tenant Admin Panel
-- Execute no Supabase SQL Editor
-- ================================================

-- 1. Expandir o CHECK de role para incluir super_admin e admin
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('super_admin', 'admin', 'coordinator', 'member'));

-- 2. Criar tabela de organizações
CREATE TABLE IF NOT EXISTS public.organizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  owner_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan           text NOT NULL DEFAULT 'basic'
                   CHECK (plan IN ('basic', 'pro', 'enterprise')),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. organization_id em profiles (nullable — super_admin não pertence a nenhum clube)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 4. organization_id em members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. RLS para organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- super_admin vê e gerencia tudo
CREATE POLICY "super_admin full access on organizations"
  ON public.organizations FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- admin vê apenas a própria organização
CREATE POLICY "admin reads own organization"
  ON public.organizations FOR SELECT
  USING (
    id = (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- 6. super_admin pode ler e editar qualquer profile
DROP POLICY IF EXISTS "super_admin acessa todos os profiles" ON public.profiles;
CREATE POLICY "super_admin acessa todos os profiles"
  ON public.profiles FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- 7. Recriar get_my_role() — suporta os 4 roles agora
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;
