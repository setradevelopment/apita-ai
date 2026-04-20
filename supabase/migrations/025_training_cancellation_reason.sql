-- ================================================
-- MIGRATION 025: motivo do feriado em trainings
-- ================================================
--
-- Contexto: ao marcar um treino como feriado no Gerenciador de Treinos, o
-- admin informa o motivo (ex.: "Tiradentes", "Quadra interditada",
-- "Confraternização"). Esse texto fica disponível em relatórios futuros
-- para dar contexto sobre queda de atendimento num determinado mês.
--
-- Column opcional — treinos cancelados sem motivo explícito ficam com NULL
-- (simplesmente "feriado / sem treino").

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
