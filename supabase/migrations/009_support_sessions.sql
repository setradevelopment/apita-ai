-- ================================================
-- MIGRATION 009: Sessões de Suporte Temporário
-- Execute no Supabase SQL Editor
-- ================================================

CREATE TABLE IF NOT EXISTS public.support_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

-- Somente super_admin pode ler/criar/deletar sessões de suporte
CREATE POLICY "super_admin gerencia support_sessions"
  ON public.support_sessions FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- Índice para lookup rápido no proxy.ts (verificado a cada request de conta de suporte)
CREATE INDEX IF NOT EXISTS idx_support_sessions_user_id
  ON public.support_sessions(user_id);
