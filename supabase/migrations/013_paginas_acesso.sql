-- supabase/migrations/013_paginas_acesso.sql

-- Substitui abas_acesso (nunca foi lida em nenhum lugar do código, só
-- salva) por um controle de acesso por página realmente aplicado no
-- proxy.ts, agora agrupado por setor. abas_acesso fica no schema, sem
-- uso — mesmo padrão adotado com as colunas do ENTRADA/SAIDAS (nunca
-- dropar coluna).
alter table profiles add column paginas_acesso text[] not null default '{}';
