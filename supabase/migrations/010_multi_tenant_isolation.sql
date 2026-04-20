-- ============================================================================
-- Migration 010: Multi-Tenant Data Isolation
--
-- Adds organization_id to ALL data tables, backfills existing data,
-- and rewrites RLS policies to enforce per-organization isolation.
-- ============================================================================

-- ── 1. Helper function: get_my_org() ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 2. Add organization_id to all data tables ──────────────────────────────

-- Core entities
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Junction / child tables (denormalized for fast RLS evaluation)
ALTER TABLE public.member_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.member_positions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.member_attendances
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.monthly_payments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Legacy tables
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.financials
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.user_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ── 3. Backfill: assign orphan data to the first organization ───────────────

DO $$
DECLARE
  default_org uuid;
BEGIN
  SELECT id INTO default_org FROM public.organizations LIMIT 1;
  IF default_org IS NOT NULL THEN
    UPDATE public.categories SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.trainings SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.positions SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.members SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.member_categories SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.member_positions SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.member_attendances SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.monthly_payments SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.attendances SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.financials SET organization_id = default_org WHERE organization_id IS NULL;
    UPDATE public.user_categories SET organization_id = default_org WHERE organization_id IS NULL;
    -- Profiles (skip super_admin — they don't belong to any org)
    UPDATE public.profiles SET organization_id = default_org
      WHERE organization_id IS NULL AND role != 'super_admin';
  END IF;
END $$;

-- ── 4. Constraints & indexes ────────────────────────────────────────────────

-- Positions: unique per org (not globally)
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_name_key;
ALTER TABLE public.positions
  ADD CONSTRAINT positions_name_org_unique UNIQUE (name, organization_id);

-- Performance indexes for RLS
CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_trainings_org ON public.trainings(organization_id);
CREATE INDEX IF NOT EXISTS idx_positions_org ON public.positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_categories_org ON public.member_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_positions_org ON public.member_positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_attendances_org ON public.member_attendances(organization_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_org ON public.monthly_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_members_org ON public.members(organization_id);

-- ── 5. Rewrite RLS Policies ────────────────────────────────────────────────
--
-- Pattern for every data table:
--   SELECT: user's org OR super_admin
--   ALL:    (user's org AND coordinator/admin role) OR super_admin
-- ────────────────────────────────────────────────────────────────────────────

-- ─── categories ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Todos autenticados leem categorias" ON public.categories;
DROP POLICY IF EXISTS "Coordenador gerencia categorias" ON public.categories;

CREATE POLICY "org_read_categories" ON public.categories FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_categories" ON public.categories FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── trainings ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Todos autenticados leem treinos" ON public.trainings;
DROP POLICY IF EXISTS "Coordenador gerencia treinos" ON public.trainings;

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_trainings" ON public.trainings FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_trainings" ON public.trainings FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── positions ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Todos autenticados leem posições" ON public.positions;
DROP POLICY IF EXISTS "Coordenador gerencia posições" ON public.positions;
DROP POLICY IF EXISTS "Todos autenticados leem posi\u00e7\u00f5es" ON public.positions;
DROP POLICY IF EXISTS "Coordenador gerencia posi\u00e7\u00f5es" ON public.positions;

CREATE POLICY "org_read_positions" ON public.positions FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_positions" ON public.positions FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── members ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Autenticados leem membros" ON public.members;
DROP POLICY IF EXISTS "Coordenador gerencia membros" ON public.members;

CREATE POLICY "org_read_members" ON public.members FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_members" ON public.members FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── member_categories ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Autenticados leem vínculos" ON public.member_categories;
DROP POLICY IF EXISTS "Coordenador gerencia vínculos membro-categoria" ON public.member_categories;
DROP POLICY IF EXISTS "Autenticados leem v\u00ednculos" ON public.member_categories;
DROP POLICY IF EXISTS "Coordenador gerencia v\u00ednculos membro-categoria" ON public.member_categories;

CREATE POLICY "org_read_member_categories" ON public.member_categories FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_member_categories" ON public.member_categories FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── member_positions ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Autenticados leem posições de membros" ON public.member_positions;
DROP POLICY IF EXISTS "Coordenador gerencia posições de membros" ON public.member_positions;
DROP POLICY IF EXISTS "Autenticados leem posi\u00e7\u00f5es de membros" ON public.member_positions;
DROP POLICY IF EXISTS "Coordenador gerencia posi\u00e7\u00f5es de membros" ON public.member_positions;

CREATE POLICY "org_read_member_positions" ON public.member_positions FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_member_positions" ON public.member_positions FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── member_attendances ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Autenticados leem presenças" ON public.member_attendances;
DROP POLICY IF EXISTS "Coordenador gerencia presenças de membros" ON public.member_attendances;
DROP POLICY IF EXISTS "Autenticados leem presen\u00e7as" ON public.member_attendances;
DROP POLICY IF EXISTS "Coordenador gerencia presen\u00e7as de membros" ON public.member_attendances;

CREATE POLICY "org_read_member_attendances" ON public.member_attendances FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_member_attendances" ON public.member_attendances FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── monthly_payments ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coordenador gerencia pagamentos" ON public.monthly_payments;

CREATE POLICY "org_read_monthly_payments" ON public.monthly_payments FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_monthly_payments" ON public.monthly_payments FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── attendances (legacy) ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coordenador gerencia presenças" ON public.attendances;
DROP POLICY IF EXISTS "Membro vê próprias presenças" ON public.attendances;
DROP POLICY IF EXISTS "Coordenador gerencia presen\u00e7as" ON public.attendances;
DROP POLICY IF EXISTS "Membro v\u00ea pr\u00f3prias presen\u00e7as" ON public.attendances;

CREATE POLICY "org_read_attendances" ON public.attendances FOR SELECT
  USING (
    organization_id = public.get_my_org()
    OR auth.uid() = user_id
    OR public.get_my_role() = 'super_admin'
  );

CREATE POLICY "org_manage_attendances" ON public.attendances FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── financials (legacy) ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coordenador gerencia financeiros" ON public.financials;
DROP POLICY IF EXISTS "Membro vê próprio financeiro" ON public.financials;
DROP POLICY IF EXISTS "Coordenador gerencia financeiros" ON public.financials;
DROP POLICY IF EXISTS "Membro v\u00ea pr\u00f3prio financeiro" ON public.financials;

CREATE POLICY "org_read_financials" ON public.financials FOR SELECT
  USING (
    organization_id = public.get_my_org()
    OR auth.uid() = user_id
    OR public.get_my_role() = 'super_admin'
  );

CREATE POLICY "org_manage_financials" ON public.financials FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── user_categories (legacy) ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Todos autenticados leem vínculos" ON public.user_categories;
DROP POLICY IF EXISTS "Coordenador gerencia vínculos" ON public.user_categories;
DROP POLICY IF EXISTS "Todos autenticados leem v\u00ednculos" ON public.user_categories;
DROP POLICY IF EXISTS "Coordenador gerencia v\u00ednculos" ON public.user_categories;

CREATE POLICY "org_read_user_categories" ON public.user_categories FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_user_categories" ON public.user_categories FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- ─── profiles (update coordinator policy to be org-scoped) ──────────────────

DROP POLICY IF EXISTS "Coordenador lê todos os perfis" ON public.profiles;
DROP POLICY IF EXISTS "Coordenador atualiza qualquer perfil" ON public.profiles;
DROP POLICY IF EXISTS "Coordenador l\u00ea todos os perfis" ON public.profiles;
DROP POLICY IF EXISTS "Coordenador atualiza qualquer perfil" ON public.profiles;

CREATE POLICY "org_read_profiles" ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR organization_id = public.get_my_org()
    OR public.get_my_role() = 'super_admin'
  );

CREATE POLICY "org_manage_profiles" ON public.profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    id = auth.uid()
    OR (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- Keep existing self-read and self-update policies
-- "Usuário lê o próprio perfil" and "Usuário atualiza o próprio perfil" remain
-- "super_admin acessa todos os profiles" remains
-- "Inserção apenas pelo próprio id" remains
