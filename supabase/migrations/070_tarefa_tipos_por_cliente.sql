-- supabase/migrations/070_tarefa_tipos_por_cliente.sql

-- Tarefa personalizada do Contábil passa a ser do cliente: tarefa_tipos ganha
-- cliente_id. Nulo = tipo do setor (padrão, ligado a vínculo, e todos os
-- outros setores). Preenchido = tarefa criada na ficha daquele cliente, com
-- formato e criado_em próprios; mesmo nome em outro cliente é outro tipo.
-- Antes, o catálogo era único por (setor, nome) e digitar um nome que outro
-- cliente já usava reaproveitava o tipo dele (formato e data de quem criou).
--
-- ORDEM EM PRODUÇÃO: esta migration (só esquema + Lixeira) é aplicada ANTES do
-- deploy do código novo. Com todas as linhas ainda cliente_id nulo, o índice
-- parcial equivale à restrição antiga e o código antigo segue funcionando.
-- A separação dos dados é a 071, aplicada DEPOIS do deploy ficar "Ready".
-- Idempotente.
begin;
set local lock_timeout = '5s';

alter table public.tarefa_tipos
  add column if not exists cliente_id uuid references public.clientes(id) on delete cascade;

alter table public.tarefa_tipos drop constraint if exists tarefa_tipos_setor_nome_key;
-- Conferência: se em produção a restrição antiga tiver outro nome, o drop acima
-- não faria nada; aborta aqui em vez de falhar obscuramente na 071.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.tarefa_tipos'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (setor, nome)'
  ) then
    raise exception '070: ainda existe UNIQUE (setor, nome) em tarefa_tipos com outro nome; remova-a antes';
  end if;
end $$;

create unique index if not exists tarefa_tipos_setor_nome_uniq
  on public.tarefa_tipos (setor, nome) where cliente_id is null;
create unique index if not exists tarefa_tipos_cliente_nome_uniq
  on public.tarefa_tipos (setor, cliente_id, nome) where cliente_id is not null;

-- ===== Lixeira: tipo de cliente apagado (cascata ao excluir o cliente, ou ao
-- tirar o cliente do Contábil) entra na Lixeira e volta na restauração.
-- Tipo do setor (cliente_id nulo) segue fora da Lixeira, como antes.
drop trigger if exists lixeira_capturar on public.tarefa_tipos;
create trigger lixeira_capturar before delete on public.tarefa_tipos
  for each row when (old.cliente_id is not null) execute function public.lixeira_capturar();

-- Mesma função da 055 (a última definição), com tarefa_tipos na ordem depois
-- do cliente e da ficha do Contábil e antes das tarefas.
create or replace function public.lixeira_restaurar(p_grupo bigint, p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem  text[] := array[
    'clientes', 'parcelamentos', 'clientes_fiscal', 'clientes_contabil', 'tarefa_tipos', 'clientes_pessoal',
    'cliente_responsavel_historico', 'cliente_notas', 'observacoes_clientes', 'tarefa_grupos',
    'client_files', 'procedimentos_societario', 'tarefas', 'tarefas_avulsas', 'tarefa_etapas',
    'tarefa_arquivos', 'evento_arquivos', 'procedimento_arquivos', 'financeiro_movimentos'
  ];
  v_tab    text;
  v_reg    record;
  v_resumo jsonb := '{}'::jsonb;
  v_n      integer;
  v_setor  text;
begin
  if not exists (select 1 from public.profiles where id = p_usuario and role = 'admin') then
    raise exception 'Somente administradores podem restaurar exclusões.';
  end if;
  if not exists (select 1 from public.lixeira where grupo = p_grupo) then
    raise exception 'Exclusão não encontrada (talvez já tenha expirado).';
  end if;
  if exists (select 1 from public.lixeira where grupo = p_grupo and restaurado_em is not null) then
    raise exception 'Esta exclusão já foi restaurada.';
  end if;
  if exists (select 1 from public.lixeira where grupo = p_grupo and tabela <> all (v_ordem)) then
    raise exception 'Esta exclusão contém uma tabela sem regra de restauração.';
  end if;

  foreach v_tab in array v_ordem loop
    v_n := 0;
    for v_reg in
      select l.dados from public.lixeira l where l.grupo = p_grupo and l.tabela = v_tab order by l.id
    loop
      begin
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', v_tab, v_tab)
          using v_reg.dados;
      exception
        when unique_violation then
          raise exception 'Não foi possível restaurar: já existe um registro igual (%). Talvez esta exclusão já tenha sido desfeita por outro caminho.', v_tab;
        when foreign_key_violation then
          raise exception 'Não foi possível restaurar: falta um registro do qual "%" depende (por exemplo, o cliente, o parcelamento, um usuário ou um item de catálogo também foi apagado). Restaure primeiro a exclusão dele.', v_tab;
      end;
      v_n := v_n + 1;
    end loop;
    if v_n > 0 then
      v_resumo := v_resumo || jsonb_build_object(v_tab, v_n);
    end if;
  end loop;

  -- "Remover do setor" apaga a ficha do setor e depois faz UPDATE em clientes.setores
  -- (o UPDATE nao passa pela lixeira): ao restaurar a ficha, reinclui o setor.
  for v_reg in
    select l.tabela, l.dados->>'cliente_id' as cliente_id
      from public.lixeira l
     where l.grupo = p_grupo and l.tabela in ('clientes_fiscal', 'clientes_contabil', 'clientes_pessoal')
  loop
    v_setor := case v_reg.tabela
                 when 'clientes_fiscal'   then 'fiscal'
                 when 'clientes_contabil' then 'contabil'
                 else 'pessoal'
               end;
    update public.clientes
       set setores = array_append(setores, v_setor::public.user_setor)
     where id = v_reg.cliente_id::uuid
       and not (v_setor::public.user_setor = any(setores));
  end loop;

  update public.lixeira
     set restaurado_em = now(), restaurado_por = p_usuario
   where grupo = p_grupo;

  return jsonb_build_object('restaurado', v_resumo);
end;
$$;

revoke all on function public.lixeira_restaurar(bigint, uuid) from public, anon, authenticated;
grant execute on function public.lixeira_restaurar(bigint, uuid) to service_role;

commit;
