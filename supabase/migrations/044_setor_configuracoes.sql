-- supabase/migrations/044_setor_configuracoes.sql
--
-- Adiciona 'configuracoes' ao enum user_setor, permitindo que o admin
-- conceda acesso granular (por paginas_acesso) às áreas de
-- /admin/configuracoes/* sem precisar dar role='admin' completo.
-- Ver lib/types.ts, lib/paginas-setor.ts, lib/route-permissions.ts.
alter type user_setor add value if not exists 'configuracoes';
