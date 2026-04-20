-- ================================================
-- MIGRATION 030: módulo financeiro completo
-- ================================================
--
-- Três blocos independentes mas aplicados juntos pra a feature /financials:
--
-- 1. Novo status `awaiting_confirmation` em payment_status
--    • Atleta marca "já paguei" → status 'awaiting_confirmation'
--    • Coord confirma → 'paid'  |  Coord rejeita → volta 'pending'
--    Aplica-se tanto em `member_attendances` quanto em `monthly_payments`.
--
-- 2. Tabelas manuais de receita/despesa por categoria
--    `manual_revenues` — "outras receitas" fora dos treinos (ex: patrocínio,
--                        evento beneficente, kit esportivo vendido).
--    `manual_expenses` — "despesas" (ex: aluguel da quadra, material,
--                        arbitragem). Sempre vinculadas a uma categoria;
--                        rateio entre categorias vira responsabilidade do
--                        usuário (cria múltiplos rows).
--
-- 3. Fix de RLS: atletas (`role='member'`) podiam SELECT TUDO da org em
--    `member_attendances` e `monthly_payments`. Agora só veem os próprios.
--    Coord/admin continuam vendo tudo da org.

-- ── 1. awaiting_confirmation status ────────────────────────────────────

-- member_attendances: aceita o novo status
ALTER TABLE public.member_attendances
  DROP CONSTRAINT IF EXISTS member_attendances_payment_status_check;

ALTER TABLE public.member_attendances
  ADD CONSTRAINT member_attendances_payment_status_check
    CHECK (
      payment_status IS NULL
      OR payment_status IN ('pending', 'awaiting_confirmation', 'paid', 'no_payment', 'refunded')
    );

-- monthly_payments: idem. O CHECK original em 004 era ('pending','paid','refunded').
ALTER TABLE public.monthly_payments
  DROP CONSTRAINT IF EXISTS monthly_payments_payment_status_check;

ALTER TABLE public.monthly_payments
  ADD CONSTRAINT monthly_payments_payment_status_check
    CHECK (
      payment_status IS NULL
      OR payment_status IN ('pending', 'awaiting_confirmation', 'paid', 'refunded')
    );

-- ── 2. manual_revenues / manual_expenses ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.manual_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL
    REFERENCES public.categories(id) ON DELETE CASCADE,
  -- Descrição obrigatória — caixa sem descrição é ingerenciável.
  description text NOT NULL,
  -- Valor em BRL, duas casas decimais. Positivo (zero ou negativo seria
  -- estranho pra "receita" — pra contrapartida o user usa manual_expenses).
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  -- Data do evento (ex: "dia que recebi o PIX"). Default hoje.
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_revenues_category
  ON public.manual_revenues (category_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_manual_revenues_org
  ON public.manual_revenues (organization_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS public.manual_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL
    REFERENCES public.categories(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_expenses_category
  ON public.manual_expenses (category_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_manual_expenses_org
  ON public.manual_expenses (organization_id, occurred_on DESC);

-- RLS: só admin/coord da org gerenciam. Atleta não vê nem lista.
ALTER TABLE public.manual_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_revenues_crud_admin_coord"
  ON public.manual_revenues
  FOR ALL
  USING (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  )
  WITH CHECK (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  );

CREATE POLICY "manual_expenses_crud_admin_coord"
  ON public.manual_expenses
  FOR ALL
  USING (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  )
  WITH CHECK (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  );

-- ── 3. RLS fix: atleta só vê os próprios pagamentos ───────────────────
-- O modelo de 010_multi_tenant_isolation.sql dava acesso SELECT pra
-- qualquer user da org (inclusive members). Agora separamos:
--   • admin/coord/super_admin → SELECT toda a org (como antes)
--   • member/atleta → SELECT apenas seus próprios rows (via members.user_id)

-- member_attendances
DROP POLICY IF EXISTS "member_attendances_select_by_org" ON public.member_attendances;
DROP POLICY IF EXISTS "member_attendances_select_scoped" ON public.member_attendances;

CREATE POLICY "member_attendances_select_scoped"
  ON public.member_attendances
  FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      organization_id = public.get_my_org()
      AND (
        public.get_my_role() IN ('admin', 'coordinator')
        OR EXISTS (
          SELECT 1 FROM public.members m
          WHERE m.id = member_attendances.member_id
            AND m.user_id = auth.uid()
        )
      )
    )
  );

-- monthly_payments
DROP POLICY IF EXISTS "monthly_payments_select_by_org" ON public.monthly_payments;
DROP POLICY IF EXISTS "monthly_payments_select_scoped" ON public.monthly_payments;

CREATE POLICY "monthly_payments_select_scoped"
  ON public.monthly_payments
  FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      organization_id = public.get_my_org()
      AND (
        public.get_my_role() IN ('admin', 'coordinator')
        OR EXISTS (
          SELECT 1 FROM public.members m
          WHERE m.id = monthly_payments.member_id
            AND m.user_id = auth.uid()
        )
      )
    )
  );

-- UPDATE específico do atleta: ele pode mudar payment_status de 'pending'
-- pra 'awaiting_confirmation' apenas NO SEU próprio row. Admin/coord
-- continua com acesso total via as policies existentes.

DROP POLICY IF EXISTS "member_attendances_athlete_mark_paid" ON public.member_attendances;
CREATE POLICY "member_attendances_athlete_mark_paid"
  ON public.member_attendances
  FOR UPDATE
  USING (
    organization_id = public.get_my_org()
    AND public.get_my_role() = 'member'
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_attendances.member_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = public.get_my_org()
    AND public.get_my_role() = 'member'
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_attendances.member_id
        AND m.user_id = auth.uid()
    )
    -- Atleta só pode setar pra 'awaiting_confirmation'. Outros status
    -- (paid, refunded) continuam reservados pro coord.
    AND payment_status = 'awaiting_confirmation'
  );

DROP POLICY IF EXISTS "monthly_payments_athlete_mark_paid" ON public.monthly_payments;
CREATE POLICY "monthly_payments_athlete_mark_paid"
  ON public.monthly_payments
  FOR UPDATE
  USING (
    organization_id = public.get_my_org()
    AND public.get_my_role() = 'member'
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = monthly_payments.member_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = public.get_my_org()
    AND public.get_my_role() = 'member'
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = monthly_payments.member_id
        AND m.user_id = auth.uid()
    )
    AND payment_status = 'awaiting_confirmation'
  );

-- ── Comments pra auditoria futura ─────────────────────────────────────
COMMENT ON TABLE public.manual_revenues IS
  'Receitas avulsas do clube, vinculadas a uma categoria. Somam ao caixa junto com as receitas automáticas geradas por attendances/monthly_payments pagos.';

COMMENT ON TABLE public.manual_expenses IS
  'Despesas do clube, vinculadas a uma categoria. Subtraem do caixa da categoria.';
