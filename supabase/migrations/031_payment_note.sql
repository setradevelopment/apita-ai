-- ================================================
-- MIGRATION 031: observação do atleta no pagamento
-- ================================================
--
-- Quando o atleta clica "Paguei" na tela /financials (visão dele), agora
-- aparece um dialog perguntando "Alguma observação para adicionar? :D" —
-- ex: "paguei via PIX pra conta X", "depositei na segunda", etc. A
-- observação fica gravada junto ao pagamento e aparece na listagem de
-- confirmações pendentes do contratante/coordenador, ajudando o coord
-- a decidir se confirma ou rejeita.
--
-- Campo opcional (text NULL). Substituído/apagado pela próxima vez que
-- o atleta marcar como pago — não é um histórico de notas, é a nota do
-- pagamento atual.

ALTER TABLE public.member_attendances
  ADD COLUMN IF NOT EXISTS payment_note text;

ALTER TABLE public.monthly_payments
  ADD COLUMN IF NOT EXISTS payment_note text;

-- Atualiza policy de UPDATE do atleta: ele agora pode setar payment_note
-- junto com payment_status='awaiting_confirmation'. Outros campos continuam
-- bloqueados (role='member' não mexe em payment_type, member_id, etc —
-- o postgres não restringe por coluna via RLS, mas a action valida).
--
-- Não precisa alterar a policy em si — o USING/WITH CHECK continuam OK.
-- Só adicionamos o comentário pra deixar claro a intenção.

COMMENT ON COLUMN public.member_attendances.payment_note IS
  'Observação que o atleta escreveu ao marcar o pagamento como pago (ex: "PIX via conta X"). Exibida ao coord na lista de confirmações pendentes.';

COMMENT ON COLUMN public.monthly_payments.payment_note IS
  'Observação que o atleta escreveu ao marcar a mensalidade como paga. Exibida ao coord na lista de confirmações pendentes.';
