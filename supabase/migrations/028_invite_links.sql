-- Link de convite para cadastro de atletas
--
-- Contexto: antes, admin/coord criava cada atleta manualmente via
-- `adminCreateUser`. Agora ganham a opção de gerar um LINK de convite que
-- pode ser enviado pros atletas (WhatsApp, e-mail) — cada atleta preenche
-- o próprio cadastro (nome, DOB, CPF, RG, logística, senha).
--
-- Decisões (alinhadas com o owner via AskUserQuestion):
--   • 1 link ATIVO por org por vez — gerar um novo REVOGA o antigo
--     (unique partial index em `revoked_at IS NULL`).
--   • Validade: 7 dias. `expires_at = created_at + interval '7 days'`.
--   • Reutilizável: N atletas podem usar o MESMO link enquanto ativo.
--   • Atleta NÃO escolhe categoria — admin vincula depois em
--     /settings?section=users.
--   • Auto-login pós-cadastro (já digitou senha — não faz sentido jogar
--     em /login e pedir de novo).

CREATE TABLE IF NOT EXISTS public.invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Token opaco (base64url de 24 bytes ≈ 32 chars). Gerado na action em
  -- `src/app/actions/invite-links.ts` via crypto.randomBytes. NÃO é o UUID
  -- do row pra não expor PK no URL.
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- `revoked_at != NULL` = link desativado. Mantemos o row pra auditoria
  -- (quando foi gerado, quando foi revogado, por quem). GET em UI filtra
  -- sempre `revoked_at IS NULL AND expires_at > now()`.
  revoked_at timestamptz
);

-- Unique partial: no máximo 1 link NÃO-revogado por org. Forçar novo
-- link = revogar o antigo na mesma transação (action faz isso).
CREATE UNIQUE INDEX IF NOT EXISTS invite_links_one_active_per_org
  ON public.invite_links (organization_id)
  WHERE revoked_at IS NULL;

-- Lookup por token — rota pública `/join/[token]` bate aqui.
CREATE INDEX IF NOT EXISTS invite_links_token_idx
  ON public.invite_links (token);

-- RLS — ligado por padrão. Policies:
--   • admin/coord da org fazem CRUD.
--   • Rota pública (/join/[token]) usa service_role client, que bypassa
--     RLS — então NÃO criamos policy pública pra SELECT (evita vazamento
--     de tokens de outras orgs se alguém chamar a tabela via REST).
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_links_crud_admin_coord"
  ON public.invite_links
  FOR ALL
  USING (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  )
  WITH CHECK (
    organization_id = public.get_my_org()
    AND public.get_my_role() IN ('admin', 'coordinator')
  );

COMMENT ON TABLE public.invite_links IS
  'Links de convite pra cadastro de atletas. 1 ativo por org (unique partial). Validade 7 dias. Revogável pelo admin/coord.';
COMMENT ON COLUMN public.invite_links.token IS
  'Token opaco base64url(24 bytes). NUNCA expor via RLS pública — sempre via service_role + validação na action signupViaInvite.';
