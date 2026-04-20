-- Migration 014: SaaS subscription invoices (parcelas do contratante)
--
-- Tabela para o super_admin gerir as parcelas que cada organização contratante paga
-- ao dono do SaaS (Apita aí). Distinta de `monthly_payments`, que é para os atletas
-- pagarem suas mensalidades para o clube.

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issue_date      date,
  due_date        date NOT NULL,
  amount          numeric(10,2) NOT NULL CHECK (amount > 0),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_org_due_date
  ON public.subscription_invoices (organization_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status
  ON public.subscription_invoices (organization_id, status);

-- Trigger reutilizando a função handle_updated_at() já existente (migration 001)
DROP TRIGGER IF EXISTS subscription_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS: apenas super_admin tem acesso (contratante não vê suas próprias parcelas no v1)
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_subscription_invoices" ON public.subscription_invoices;
CREATE POLICY "super_admin_manage_subscription_invoices"
  ON public.subscription_invoices FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');
