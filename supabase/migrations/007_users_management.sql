-- ================================================
-- MIGRATION 007: Users management
-- Execute no Supabase SQL Editor
-- ================================================

-- Add missing fields to profiles (logistics type + club)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin_type text
    CHECK (origin_type IN ('casa', 'trabalho', 'faculdade', 'outros')),
  ADD COLUMN IF NOT EXISTS destination_type text
    CHECK (destination_type IN ('casa', 'trabalho', 'faculdade', 'outros')),
  ADD COLUMN IF NOT EXISTS club text;

-- Link members to their auth account (optional, nullable)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.members(user_id);

-- Allow coordinator to update any profile (needed for admin user management)
DROP POLICY IF EXISTS "Coordenador atualiza qualquer perfil" ON public.profiles;
CREATE POLICY "Coordenador atualiza qualquer perfil"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'coordinator');
