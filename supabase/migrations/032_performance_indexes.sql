-- Índices de performance adicionados após diagnóstico de latência no
-- gerenciador de treinos (branch dev).
--
-- As UNIQUE constraints existentes já cobrem os hot paths principais:
--   • member_attendances UNIQUE(training_id, member_id) — auto-indexed
--   • monthly_payments   UNIQUE(member_id, category_id, month, year) — auto-indexed
--   • trainings          UNIQUE(category_id, date) — auto-indexed
--
-- Estes dois índices adicionais cobrem cenários faltantes:
--
-- 1) /financials e relatórios "ações de um atleta específico" dentro da org
--    (filtro: organization_id + member_id, sem training_id conhecido).
--    Antes: scan em idx_member_attendances_org (1 coluna) + filtro linear.
--    Depois: seek direto pelo composto.
--
-- 2) Relatórios por categoria+mês onde não se filtra por atleta primeiro
--    (ex: "quantos mensalistas ativos em abril/2026 na categoria X").
--    A UNIQUE existente começa com member_id, então não ajuda nesse padrão.

CREATE INDEX IF NOT EXISTS idx_member_attendances_org_member
  ON public.member_attendances(organization_id, member_id);

CREATE INDEX IF NOT EXISTS idx_monthly_payments_category_month
  ON public.monthly_payments(category_id, month, year);
