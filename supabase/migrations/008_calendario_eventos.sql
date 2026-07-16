-- supabase/migrations/008_calendario_eventos.sql

-- ============================================================
-- Calendário personalizável por setor: eventos cadastrados pelo
-- Admin (recorrente mensal com dia fixo, ou data única). Cor e
-- "dias restantes" são calculados em app code (lib/calendario.ts),
-- não armazenados. Único dado compartilhado entre setores no
-- projeto além do catálogo tarefa_tipos.
-- Ver docs/superpowers/specs/2026-07-16-calendario-personalizavel-design.md
-- ============================================================

create table calendario_eventos (
  id           uuid primary key default gen_random_uuid(),
  setor        user_setor not null,
  titulo       text not null,
  descricao    text,
  tipo_data    text not null check (tipo_data in ('recorrente', 'unica')),
  dia_mes      int check (dia_mes between 1 and 31),
  data         date,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  constraint tipo_data_consistente check (
    (tipo_data = 'recorrente' and dia_mes is not null and data is null) or
    (tipo_data = 'unica' and data is not null and dia_mes is null)
  )
);

create index idx_calendario_eventos_setor on calendario_eventos (setor);

alter table calendario_eventos enable row level security;

create policy "Setor le seus eventos" on calendario_eventos for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and calendario_eventos.setor = any(p.setores)
  )
);

create policy "Admin gerencia eventos" on calendario_eventos for all using (is_admin());

-- Seed: as 9 obrigações fiscais que hoje estão hard-coded em
-- components/fiscal/CalendarioFiscal.tsx e app/fiscal/calendario/page.tsx.
-- IRPJ/CSLL (trimestral) fica de fora — não se encaixa no modelo
-- recorrente-mensal (decisão do usuário, ver spec "Fora de escopo").
insert into calendario_eventos (setor, titulo, descricao, tipo_data, dia_mes) values
  ('fiscal', 'SIGET',              'Prazo interno do escritório para rotinas SIGET.',                 'recorrente', 5),
  ('fiscal', 'SPEED GOV',          'Prazo interno do escritório para rotinas Speed Gov.',              'recorrente', 10),
  ('fiscal', 'EFD-Reinf',          'Retenções na fonte, serviços tomados e prestados.',                'recorrente', 15),
  ('fiscal', 'DAS/PGDAS-D',        'Documento de Arrecadação do Simples Nacional.',                    'recorrente', 15),
  ('fiscal', 'ISS',                'Imposto Sobre Serviços.',                                          'recorrente', 15),
  ('fiscal', 'ICMS/ICMS-ST',       'ICMS e Substituição Tributária.',                                  'recorrente', 15),
  ('fiscal', 'PIS/COFINS',         'Apuração de PIS e COFINS.',                                        'recorrente', 20),
  ('fiscal', 'DCTFWeb',            'Declaração de débitos e créditos tributários federais previdenciários.', 'recorrente', 20),
  ('fiscal', 'EFD-Contribuições',  'PIS, COFINS e Contribuição Previdenciária sobre Receita.',         'recorrente', 31);
