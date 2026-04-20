-- ================================================
-- MIGRATION 023: payment_type = 'none' (sem pagamento)
-- ================================================
--
-- Contexto: o "Gerenciador de Treinos" precisa de uma 3ª opção além dos
-- tipos de pagamento configurados da categoria: "Sem pagamento" (cinza).
-- Usada para sinalizar explicitamente que aquele treino, para aquele
-- atleta, não gera pendência financeira (ex.: convidado, trial, cortesia).
--
-- Diferença em relação a `payment_type IS NULL`:
--   - NULL  = ainda não decidido / estado implícito (atleta recém-criado
--             vê "Avulso" como default visual sem row persistida)
--   - 'none' = explicitamente sem pagamento (persistido)
--
-- Dashboards/relatórios devem EXCLUIR linhas com payment_type='none' das
-- contagens de pendente/pago.

ALTER TABLE public.member_attendances
  DROP CONSTRAINT IF EXISTS member_attendances_payment_type_check;

ALTER TABLE public.member_attendances
  ADD CONSTRAINT member_attendances_payment_type_check
    CHECK (payment_type IN ('drop_in', 'weekly', 'monthly', 'semiannual', 'annual', 'none'));
