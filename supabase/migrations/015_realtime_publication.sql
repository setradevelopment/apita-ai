-- Migration 015: habilita Supabase Realtime para as tabelas que alimentam o
-- drilldown do super_admin em tempo real.
--
-- Sem adicionar as tabelas à publicação `supabase_realtime`, eventos `postgres_changes`
-- não são entregues aos clientes browser. As tabelas abaixo cobrem tudo que aparece
-- na aba de Treinos do drilldown (presença + pagamento + vínculo de categoria),
-- além de categorias/membros para refletir edições de nome/config em tempo real.

ALTER PUBLICATION supabase_realtime ADD TABLE public.trainings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_attendances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
