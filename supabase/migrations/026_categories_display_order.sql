-- ================================================
-- MIGRATION 026: ordem visual das categorias
-- ================================================
--
-- Contexto: admin quer arrastar os cards de categoria em /settings para
-- reordenar, e essa ordem precisa valer em TODA listagem de categorias
-- (Gerenciador de Treinos, Membros, dashboard sidebar, etc.).
--
-- `display_order` é NOT NULL com default 0 — backfill faz row_number() por
-- organization_id pra preservar a ordenação alfabética atual como ponto de
-- partida (ninguém perde referência). Gaps são OK: nova categoria entra com
-- `MAX(display_order)+1` e o usuário reordena à vontade depois.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill: numera as categorias existentes em ordem alfabética dentro da
-- mesma org (1, 2, 3, …). Só roda em rows com display_order=0 (default),
-- então é idempotente.
WITH numbered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY organization_id ORDER BY name) AS rn
  FROM public.categories
  WHERE display_order = 0
)
UPDATE public.categories c
   SET display_order = n.rn
  FROM numbered n
 WHERE c.id = n.id;

-- Índice para a query mais comum: `ORDER BY display_order` dentro da org.
CREATE INDEX IF NOT EXISTS idx_categories_org_order
  ON public.categories(organization_id, display_order);
