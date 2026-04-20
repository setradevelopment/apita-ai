-- ================================================
-- MIGRATION 024: status de pagamento expandido
-- ================================================
--
-- Contexto: no Gerenciador de Treinos, "Sem pagamento" deixa de ser um
-- `payment_type` (substituindo o 'none' introduzido em 023) e passa a ser um
-- `payment_status` junto de Pago e Pendente. Adicionamos também o status
-- 'refunded' (Estornado) — mesmo conceito já usado em `monthly_payments`.
--
-- `payment_type` volta a representar APENAS a tier de preço configurada na
-- categoria (drop_in, weekly, monthly, semiannual, annual).
-- `payment_status` agora tem 4 valores: pending, paid, no_payment, refunded.
--
-- Dashboards/relatórios devem EXCLUIR `payment_status IN ('no_payment',
-- 'refunded')` das contagens de pendente/pago, mantendo o comportamento
-- equivalente ao filtro que existia pra `payment_type='none'`.

-- 1. Backfill: rows marcadas com payment_type='none' viram payment_status
--    'no_payment' + payment_type limpo. Idempotente — só atinge rows nessa
--    situação legada.
UPDATE public.member_attendances
   SET payment_type = NULL,
       payment_status = 'no_payment'
 WHERE payment_type = 'none';

-- 2. Amplia o check de payment_status. NULL permanece válido (defaults
--    implícitos). Atenção ao OR explícito pra manter compatibilidade com
--    rows pré-existentes sem payment_status definido.
ALTER TABLE public.member_attendances
  DROP CONSTRAINT IF EXISTS member_attendances_payment_status_check;

ALTER TABLE public.member_attendances
  ADD CONSTRAINT member_attendances_payment_status_check
    CHECK (
      payment_status IS NULL
      OR payment_status IN ('pending', 'paid', 'no_payment', 'refunded')
    );

-- 3. Restringe payment_type aos valores de tier. Tira 'none' porque o
--    backfill do passo 1 garante que nenhuma row usa mais esse valor.
ALTER TABLE public.member_attendances
  DROP CONSTRAINT IF EXISTS member_attendances_payment_type_check;

ALTER TABLE public.member_attendances
  ADD CONSTRAINT member_attendances_payment_type_check
    CHECK (
      payment_type IS NULL
      OR payment_type IN ('drop_in', 'weekly', 'monthly', 'semiannual', 'annual')
    );
