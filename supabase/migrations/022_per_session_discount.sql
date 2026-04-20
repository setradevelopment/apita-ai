-- ================================================
-- MIGRATION 022: Novo tipo de desconto "per_session"
-- ================================================
--
-- Contexto: hoje o desconto para tiers no modo `avulso_x_qty` é global — um
-- valor fixo (R$) ou percentual (%) aplicado sobre o total `dropIn × qty`.
-- Isso gera um problema na mensalidade: se o mês tem 4 treinos, o desconto
-- deveria ser menor do que se tivesse 5 treinos (porque a base é maior).
--
-- Adicionamos o discount_type `per_session`, onde o desconto é definido POR
-- TREINO — então o desconto efetivo é `discount_value × qty`. Assim, um
-- mês com 5 treinos gera um desconto maior do que um com 4, automaticamente.
--
-- Aplica aos 4 tiers (weekly / monthly / semiannual / annual). Na prática,
-- o caso-de-uso mais comum é o mensal, mas a constraint é uniforme por
-- consistência (e para simplificar a UI: o mesmo menu de desconto vale em
-- qualquer tier avulso × qty).

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_weekly_discount_type_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_weekly_discount_type_check
    CHECK (weekly_discount_type IN ('none', 'fixed_amount', 'percentage', 'per_session'));

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_monthly_discount_type_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_monthly_discount_type_check
    CHECK (monthly_discount_type IN ('none', 'fixed_amount', 'percentage', 'per_session'));

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_semiannual_discount_type_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_semiannual_discount_type_check
    CHECK (semiannual_discount_type IN ('none', 'fixed_amount', 'percentage', 'per_session'));

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_annual_discount_type_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_annual_discount_type_check
    CHECK (annual_discount_type IN ('none', 'fixed_amount', 'percentage', 'per_session'));
