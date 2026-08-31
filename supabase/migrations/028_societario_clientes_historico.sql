-- supabase/migrations/028_societario_clientes_historico.sql

-- Liga procedimentos_societario a um cliente de verdade (opcional — fica
-- null quando o procedimento é de uma empresa avulsa, ainda não cadastrada
-- como cliente, ex.: Abertura de empresa) e adiciona anexos por
-- procedimento, mesmo padrão de tarefa_arquivos/evento_arquivos.

alter table procedimentos_societario add column cliente_id uuid references clientes(id);

create index idx_procedimentos_societario_cliente_id on procedimentos_societario (cliente_id);

create table procedimento_arquivos (
  id              uuid primary key default gen_random_uuid(),
  procedimento_id uuid references procedimentos_societario(id) on delete cascade not null,
  name            text not null,
  size            integer not null,
  content_base64  text not null,
  uploaded_at     timestamptz not null default now()
);

alter table procedimento_arquivos enable row level security;

create policy "Autenticados leem procedimento_arquivos" on procedimento_arquivos for select using (auth.uid() is not null);
create policy "Autenticados gerenciam procedimento_arquivos" on procedimento_arquivos for all using (auth.uid() is not null);
