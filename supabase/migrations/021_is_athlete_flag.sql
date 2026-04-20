-- PR1 do plano multi-org + coordenador-atleta.
-- Adiciona flag `is_athlete` em profiles.
-- Motivação: hoje um usuário é considerado atleta só por ter role='member' OU um
-- row em `members`. Isso levou ao bug de admins/coords virarem atletas quando
-- criados com categorias anexadas. Com a flag explícita, o guard do backend fica
-- previsível: `is_athlete === true` é a única fonte de verdade para "cria row em
-- members e participa de treinos".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_athlete boolean NOT NULL DEFAULT false;

-- Backfill:
-- 1) Todo mundo com role='member' é atleta por definição.
UPDATE public.profiles
SET is_athlete = true
WHERE role = 'member' AND is_athlete = false;

-- 2) Qualquer profile que já tem row em `members` (coord-atleta existente) também
--    é atleta, mesmo que o role seja 'coordinator' ou 'admin'.
UPDATE public.profiles p
SET is_athlete = true
WHERE is_athlete = false
  AND EXISTS (
    SELECT 1 FROM public.members m WHERE m.user_id = p.id
  );

COMMENT ON COLUMN public.profiles.is_athlete IS
  'Flag explícita: o usuário participa de treinos (aparece em /dashboard/members e tem row em public.members). Independe do role — um coordenador pode ter is_athlete=true.';
