-- ================================================
-- FIX: Remove recursão infinita nas políticas RLS
-- Execute no Supabase SQL Editor
-- ================================================

-- 1. Remove todas as políticas antigas da tabela profiles
drop policy if exists "Coordenadores veem todos os perfis" on public.profiles;
drop policy if exists "Membro vê o próprio perfil" on public.profiles;
drop policy if exists "Usuário atualiza o próprio perfil" on public.profiles;
drop policy if exists "Service role insere perfil" on public.profiles;

-- 2. Cria função auxiliar com SECURITY DEFINER (bypassa RLS ao consultar role)
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid()
$$ language sql security definer stable;

-- 3. Recria políticas da tabela profiles SEM referenciar profiles internamente
create policy "Usuário lê o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Coordenador lê todos os perfis"
  on public.profiles for select
  using (public.get_my_role() = 'coordinator');

create policy "Usuário atualiza o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Inserção permitida (trigger)"
  on public.profiles for insert
  with check (true);

-- 4. Corrige políticas das demais tabelas para usar a função auxiliar
-- categories
drop policy if exists "Coordenador gerencia categorias" on public.categories;
create policy "Coordenador gerencia categorias"
  on public.categories for all
  using (public.get_my_role() = 'coordinator');

-- positions
drop policy if exists "Coordenador gerencia posições" on public.positions;
create policy "Coordenador gerencia posições"
  on public.positions for all
  using (public.get_my_role() = 'coordinator');

-- user_categories
drop policy if exists "Coordenador gerencia vínculos" on public.user_categories;
create policy "Coordenador gerencia vínculos"
  on public.user_categories for all
  using (public.get_my_role() = 'coordinator');

-- trainings
drop policy if exists "Coordenador gerencia treinos" on public.trainings;
create policy "Coordenador gerencia treinos"
  on public.trainings for all
  using (public.get_my_role() = 'coordinator');

-- attendances
drop policy if exists "Coordenador vê todas as presenças" on public.attendances;
drop policy if exists "Coordenador gerencia presenças" on public.attendances;
create policy "Coordenador gerencia presenças"
  on public.attendances for all
  using (public.get_my_role() = 'coordinator');

-- financials
drop policy if exists "Coordenador vê todos os financeiros" on public.financials;
drop policy if exists "Coordenador gerencia financeiros" on public.financials;
create policy "Coordenador gerencia financeiros"
  on public.financials for all
  using (public.get_my_role() = 'coordinator');
