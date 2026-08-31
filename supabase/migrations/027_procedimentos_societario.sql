-- supabase/migrations/027_procedimentos_societario.sql

-- Procedimentos do setor Societário (abertura, alteração, encerramento,
-- etc.) — cada um referencia um tipo cadastrado em `processo_tipos`
-- (026_societario_processos_documentacoes.sql) e opcionalmente um modelo
-- de documento (`documentacao_modelos`) usado como referência pro PDF
-- gerado no botão "Gerar".
--
-- `campos` guarda, em jsonb, um valor de texto por etapa do tipo escolhido
-- (chave = nome da etapa, valor = texto digitado) — evita precisar de uma
-- tabela de colunas dinâmicas, já que a decisão foi tratar cada etapa como
-- um campo de texto simples nessa versão.
--
-- Ao contrário de processo_tipos/documentacao_modelos (catálogos de
-- configuração, só admin escreve), esta é uma tabela operacional — qualquer
-- autenticado gerencia, mesmo padrão de `observacoes_clientes`
-- (001_initial.sql), já que qualquer operador do setor pode abrir/editar um
-- procedimento.

create type status_procedimento as enum ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

create table procedimentos_societario (
  id                     uuid primary key default gen_random_uuid(),
  processo_tipo_id       uuid not null references processo_tipos(id),
  empresa                text not null,
  status                 status_procedimento not null default 'ABERTO',
  campos                 jsonb not null default '{}',
  documentacao_modelo_id uuid references documentacao_modelos(id),
  responsavel            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_procedimentos_societario_status on procedimentos_societario (status);

alter table procedimentos_societario enable row level security;

create policy "Autenticados leem procedimentos_societario" on procedimentos_societario for select using (auth.uid() is not null);
create policy "Autenticados gerenciam procedimentos_societario" on procedimentos_societario for all using (auth.uid() is not null);
