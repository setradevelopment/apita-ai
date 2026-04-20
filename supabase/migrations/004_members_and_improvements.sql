-- ================================================
-- MIGRATION 004: Members table + category improvements
-- Execute no Supabase SQL Editor
-- ================================================

-- ------------------------------------------------
-- 1. Adicionar toggles de preços nas categorias
-- ------------------------------------------------
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS has_drop_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_weekly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_monthly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_semiannual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_annual boolean NOT NULL DEFAULT false;

-- ------------------------------------------------
-- 2. Adicionar constraint única em trainings (necessário para upsert)
-- ------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trainings_category_date_unique'
  ) THEN
    ALTER TABLE public.trainings
      ADD CONSTRAINT trainings_category_date_unique UNIQUE (category_id, date);
  END IF;
END$$;

-- ------------------------------------------------
-- 3. Remover posições padrão (começa limpo)
-- ------------------------------------------------
DELETE FROM public.positions;

-- ------------------------------------------------
-- 3. Tabela: members (gerenciada pelo coordenador, não requer conta auth)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  dob date,
  cpf text,
  rg text,
  origin_type text CHECK (origin_type IN ('casa', 'trabalho', 'faculdade', 'outros')),
  origin_street text,
  origin_neighborhood text,
  origin_zip text,
  destination_type text CHECK (destination_type IN ('casa', 'trabalho', 'faculdade', 'outros')),
  destination_street text,
  destination_neighborhood text,
  destination_zip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordenador gerencia membros"
  ON public.members FOR ALL
  USING (public.get_my_role() = 'coordinator');

CREATE POLICY "Autenticados leem membros"
  ON public.members FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------
-- 4. Tabela: member_categories (membro → categoria)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, category_id)
);

ALTER TABLE public.member_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordenador gerencia vínculos membro-categoria"
  ON public.member_categories FOR ALL
  USING (public.get_my_role() = 'coordinator');

CREATE POLICY "Autenticados leem vínculos"
  ON public.member_categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- ------------------------------------------------
-- 5. Tabela: member_positions (membro → posições, N:N)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_positions (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, position_id)
);

ALTER TABLE public.member_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordenador gerencia posições de membros"
  ON public.member_positions FOR ALL
  USING (public.get_my_role() = 'coordinator');

CREATE POLICY "Autenticados leem posições de membros"
  ON public.member_positions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ------------------------------------------------
-- 6. Tabela: monthly_payments (controle mensal de pagamento)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL,
  is_monthly_payer boolean NOT NULL DEFAULT false,
  payment_status text CHECK (payment_status IN ('pending', 'paid', 'refunded')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, category_id, month, year)
);

ALTER TABLE public.monthly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordenador gerencia pagamentos"
  ON public.monthly_payments FOR ALL
  USING (public.get_my_role() = 'coordinator');

CREATE TRIGGER monthly_payments_updated_at
  BEFORE UPDATE ON public.monthly_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------
-- 7. Tabela: member_attendances (presença de membros nos treinos)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_attendances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent')) DEFAULT 'absent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(training_id, member_id)
);

ALTER TABLE public.member_attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordenador gerencia presenças de membros"
  ON public.member_attendances FOR ALL
  USING (public.get_my_role() = 'coordinator');

CREATE POLICY "Autenticados leem presenças"
  ON public.member_attendances FOR SELECT
  USING (auth.role() = 'authenticated');
