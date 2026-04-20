-- Onboarding obrigatório no primeiro acesso
--
-- Contexto: o cadastro de usuários (em /settings) foi relaxado para exigir
-- apenas `email` — admin/coordenador cria só o acesso e o próprio usuário
-- preenche nome completo, DOB, CPF, RG e logística no primeiro login.
--
-- Este flag marca QUANDO o onboarding foi concluído. Enquanto `NULL`, o
-- layout `(dashboard)/layout.tsx` redireciona para `/onboarding`. Ao salvar
-- todos os campos exigidos, stampa `now()` e libera o acesso ao dashboard.
--
-- Super_admin fica isento pelo role, não por esta coluna.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- Backfill: usuários já cadastrados com dados completos (nome + DOB + CPF + RG
-- + logística inteira nos 2 lados) são considerados já "completos" — não faz
-- sentido fazê-los passar pelo onboarding ao logar de novo. Usamos
-- `created_at` como valor sentinel para manter coerência histórica.
UPDATE public.profiles
SET profile_completed_at = COALESCE(updated_at, created_at)
WHERE profile_completed_at IS NULL
  AND name IS NOT NULL AND name <> ''
  AND dob IS NOT NULL
  AND cpf IS NOT NULL AND cpf <> ''
  AND rg IS NOT NULL AND rg <> ''
  AND origin_street IS NOT NULL AND origin_street <> ''
  AND origin_neighborhood IS NOT NULL AND origin_neighborhood <> ''
  AND origin_zip IS NOT NULL AND origin_zip <> ''
  AND destination_street IS NOT NULL AND destination_street <> ''
  AND destination_neighborhood IS NOT NULL AND destination_neighborhood <> ''
  AND destination_zip IS NOT NULL AND destination_zip <> '';

-- Admins super_admin e o contratante original (criados via signup) não
-- precisam do onboarding — stampamos imediatamente para não bloqueá-los.
UPDATE public.profiles
SET profile_completed_at = COALESCE(updated_at, created_at)
WHERE profile_completed_at IS NULL
  AND role IN ('super_admin', 'admin');

-- Partial index: só paga o custo quando o profile ainda não concluiu onboarding.
CREATE INDEX IF NOT EXISTS idx_profiles_profile_completed_at_null
  ON public.profiles(id)
  WHERE profile_completed_at IS NULL;

COMMENT ON COLUMN public.profiles.profile_completed_at IS
  'Timestamp de conclusão do onboarding obrigatório (nome, DOB, CPF, RG e logística). NULL força redirect para /onboarding no (dashboard)/layout.tsx.';
