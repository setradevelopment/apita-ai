-- ================================================
-- RAYO APP - Schema Inicial
-- Execute este arquivo no Supabase SQL Editor
-- ================================================

-- Extensão para UUIDs
create extension if not exists "uuid-ossp";

-- ================================================
-- TABELA: profiles (espelha auth.users com dados extras)
-- ================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('coordinator', 'member')) default 'member',
  name text not null default '',
  dob date,
  cpf text,
  rg text,
  origin_street text,
  origin_neighborhood text,
  origin_zip text,
  destination_street text,
  destination_neighborhood text,
  destination_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Coordenador vê tudo; membro vê apenas o próprio perfil
create policy "Coordenadores veem todos os perfis"
  on public.profiles for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

create policy "Membro vê o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuário atualiza o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Service role insere perfil"
  on public.profiles for insert
  with check (true);

-- ================================================
-- TABELA: categories
-- ================================================
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  days_of_week text[] not null default '{}',
  start_time time not null,
  end_time time not null,
  location text not null,
  observations text,
  price_drop_in numeric(10,2) not null default 0,
  price_weekly numeric(10,2) not null default 0,
  price_monthly numeric(10,2) not null default 0,
  price_semiannual numeric(10,2) not null default 0,
  price_annual numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Todos autenticados leem categorias"
  on public.categories for select
  using (auth.role() = 'authenticated');

create policy "Coordenador gerencia categorias"
  on public.categories for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- ================================================
-- TABELA: positions
-- ================================================
create table public.positions (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

alter table public.positions enable row level security;

create policy "Todos autenticados leem posições"
  on public.positions for select
  using (auth.role() = 'authenticated');

create policy "Coordenador gerencia posições"
  on public.positions for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- Posições padrão
insert into public.positions (name) values
  ('Central'),
  ('Líbero'),
  ('Ponteiro'),
  ('Oposto'),
  ('Levantador'),
  ('Técnico');

-- ================================================
-- TABELA: user_categories (tabela ponte)
-- ================================================
create table public.user_categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  position_id uuid references public.positions(id) on delete set null,
  is_monthly_payer boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, category_id)
);

alter table public.user_categories enable row level security;

create policy "Todos autenticados leem vínculos"
  on public.user_categories for select
  using (auth.role() = 'authenticated');

create policy "Coordenador gerencia vínculos"
  on public.user_categories for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- ================================================
-- TABELA: trainings
-- ================================================
create table public.trainings (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.categories(id) on delete cascade,
  date date not null,
  status text not null check (status in ('scheduled', 'done', 'cancelled')) default 'scheduled',
  created_at timestamptz not null default now()
);

alter table public.trainings enable row level security;

create policy "Todos autenticados leem treinos"
  on public.trainings for select
  using (auth.role() = 'authenticated');

create policy "Coordenador gerencia treinos"
  on public.trainings for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- ================================================
-- TABELA: attendances
-- ================================================
create table public.attendances (
  id uuid primary key default uuid_generate_v4(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present', 'absent')) default 'absent',
  created_at timestamptz not null default now(),
  unique(training_id, user_id)
);

alter table public.attendances enable row level security;

create policy "Coordenador vê todas as presenças"
  on public.attendances for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

create policy "Membro vê próprias presenças"
  on public.attendances for select
  using (auth.uid() = user_id);

create policy "Coordenador gerencia presenças"
  on public.attendances for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- ================================================
-- TABELA: financials
-- ================================================
create table public.financials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  status text not null check (status in ('paid', 'pending', 'refunded')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category_id, month, year)
);

alter table public.financials enable row level security;

create policy "Coordenador vê todos os financeiros"
  on public.financials for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

create policy "Membro vê próprio financeiro"
  on public.financials for select
  using (auth.uid() = user_id);

create policy "Coordenador gerencia financeiros"
  on public.financials for all
  using (
    (select role from public.profiles where id = auth.uid()) = 'coordinator'
  );

-- ================================================
-- TRIGGER: updated_at automático
-- ================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger financials_updated_at
  before update on public.financials
  for each row execute function public.handle_updated_at();

-- ================================================
-- TRIGGER: cria profile automaticamente ao criar usuário
-- ================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    coalesce(new.raw_user_meta_data->>'name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
