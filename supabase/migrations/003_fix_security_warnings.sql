-- ================================================
-- FIX: Corrige warnings de segurança do Supabase
-- Execute no Supabase SQL Editor
-- ================================================

-- 1. Fix: Function Search Path Mutable
--    Adiciona SET search_path às funções para evitar ataques de search_path injection

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Fix: RLS Policy Always True (insert em profiles)
--    Restringe inserção apenas ao próprio user_id ou ao service_role

DROP POLICY IF EXISTS "Inserção permitida (trigger)" ON public.profiles;

CREATE POLICY "Inserção apenas pelo próprio id"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR auth.role() = 'service_role');
