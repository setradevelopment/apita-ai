-- ────────────────────────────────────────────────────────────────────────────
-- Migration 020: positions por categoria
--
-- Substitui a tabela global `member_positions (member_id, position_id)` por
-- `member_category_positions (member_id, category_id, position_id, organization_id)`,
-- permitindo que o mesmo atleta jogue posições distintas em categorias
-- diferentes (ex.: Volante no Sub-20, Zagueiro no Amador).
--
-- Backfill: para cada (member, position) existente, replica a linha para cada
-- categoria em que o membro já está. Membros com positions sem categoria
-- perdem essas associações (verificado em 2026-04-15: 0 registros afetados).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_category_positions (
  member_id       uuid NOT NULL REFERENCES public.members(id)       ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES public.categories(id)    ON DELETE CASCADE,
  position_id     uuid NOT NULL REFERENCES public.positions(id)     ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, category_id, position_id)
);

-- Backfill (no-op hoje, mas idempotente)
INSERT INTO public.member_category_positions (member_id, category_id, position_id, organization_id)
SELECT mp.member_id, mc.category_id, mp.position_id, mp.organization_id
FROM public.member_positions mp
JOIN public.member_categories mc ON mc.member_id = mp.member_id
ON CONFLICT DO NOTHING;

-- Indexes para queries frequentes
CREATE INDEX IF NOT EXISTS idx_member_category_positions_org
  ON public.member_category_positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_category_positions_member
  ON public.member_category_positions(member_id);
CREATE INDEX IF NOT EXISTS idx_member_category_positions_category
  ON public.member_category_positions(category_id, position_id);

-- RLS espelhando o padrão de member_categories (010_multi_tenant_isolation)
ALTER TABLE public.member_category_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_member_category_positions"
  ON public.member_category_positions FOR SELECT
  USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "org_manage_member_category_positions"
  ON public.member_category_positions FOR ALL
  USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('coordinator', 'admin'))
    OR public.get_my_role() = 'super_admin'
  );

-- Remove a tabela legada (RLS, policies e FKs caem com ela via CASCADE)
DROP TABLE IF EXISTS public.member_positions;
