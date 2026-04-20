-- Aprovação de atleta pendente (via link de convite)
--
-- Contexto: atletas que se auto-cadastram via link de convite caem em estado
-- "pendente" até que contratante ou coordenador revise e aprove. Uma vez
-- aprovado, o atleta ganha acesso completo ao painel. Nessa aprovação o
-- coord também vincula categoria(s) e posição(ões) — sem isso o atleta
-- ficaria "vivo sem utilidade", nunca aparecendo em treinos.
--
-- Decisão de modelagem: coluna `approved_at timestamptz` em `members`.
--   • NULL = pendente (nunca passou pela aprovação)
--   • NOT NULL = aprovado em <timestamp>
--
-- Não usamos o `active boolean` existente porque semanticamente significa
-- "desativado/excluído", não "pendente". Separar os dois evita overload de
-- significado. Casa com o padrão já estabelecido no app (`profile_completed_at`,
-- `password_reset_at`, todos timestamps com NULL = estado pendente).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Backfill: todos os members existentes foram criados MANUALMENTE por
-- admin/coord (via /settings?section=users). Não fazia sentido fluxo de
-- aprovação pra quem o próprio admin já colocou. Stampa `created_at` pra
-- manter coerência histórica.
UPDATE public.members
SET approved_at = created_at
WHERE approved_at IS NULL;

-- Partial index: só pagamos o custo quando existe um pendente aguardando.
-- Queries de "quantos pendentes na minha org?" (sino no header, badge no
-- sidebar) batem aqui e são baratas quando 0 atletas estão pendentes.
CREATE INDEX IF NOT EXISTS idx_members_approved_at_null
  ON public.members (organization_id)
  WHERE approved_at IS NULL;

COMMENT ON COLUMN public.members.approved_at IS
  'Timestamp da aprovação pelo contratante/coordenador. NULL = cadastro pendente (chegou via link de convite e aguarda revisão). Atleta pendente vê tela especial no (dashboard)/layout.tsx até ser aprovado.';
