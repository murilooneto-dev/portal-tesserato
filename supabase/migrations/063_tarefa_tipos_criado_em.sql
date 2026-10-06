-- Tarefa nova não pode virar pendência de meses que já passaram. Até aqui
-- tarefa_tipos não guardava quando o tipo foi criado, então no Fiscal, no
-- Contábil e no Pessoal um tipo cadastrado em outubro aparecia também em
-- janeiro..setembro (Societário e Financeiro já têm essa trava pelo
-- created_at do vínculo com o cliente).
--   criado_em = quando o tipo foi cadastrado. A tarefa só conta a partir do
--               mês dessa data (lib/tarefas-esperadas.ts).
--   nulo      = tipo anterior a esta migration: continua valendo para
--               qualquer mês, como sempre foi.
-- Os tipos criados depois da migration 058 têm a criação registrada no
-- evento_log; esses recebem a data real. O bloco só roda quando a coluna
-- ainda não existe: rodar de novo não mexe em nada.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tarefa_tipos' and column_name = 'criado_em'
  ) then
    alter table public.tarefa_tipos add column criado_em timestamptz;
    alter table public.tarefa_tipos alter column criado_em set default now();

    update public.tarefa_tipos t
       set criado_em = e.criado
      from (
        select setor::text as setor, detalhes::jsonb->>'descricao' as nome, max(created_at) as criado
          from public.evento_log
         where tipo_evento = 'criacao' and detalhes::jsonb->>'entidade' = 'Tipo de tarefa'
         group by 1, 2
      ) e
     where e.setor = t.setor::text and e.nome = t.nome;
  end if;
end $$;
