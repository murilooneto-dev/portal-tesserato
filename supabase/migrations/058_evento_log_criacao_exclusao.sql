-- Log de Eventos passa a registrar CRIAÇÃO e EXCLUSÃO de tudo o que o
-- usuário pode criar/excluir no sistema, direto no banco (trigger), pra
-- cobrir igualmente o que é gravado pelo servidor e pelo navegador.
--
-- Fora de propósito (é preenchimento, não criação): tarefas, tarefa_etapas,
-- tarefa_arquivos, observacoes_clientes,
-- processo_subetapas. Clientes (clientes, clientes_<setor>) e tarefa_grupos
-- continuam registrados pelo código (já têm setor/estrutura de tarefas).
--
-- Exclusão em cascata não gera linha própria (pg_trigger_depth() > 1): excluir
-- um cliente vira um evento só. Por isso a exclusão usa trigger BEFORE (roda
-- dentro da ação em cascata, com a profundidade real); em AFTER a fila de
-- eventos adiados perde essa informação e o filho da cascata vazava no log. Falha ABERTA: erro ao registrar nunca cancela
-- a operação do usuário.

-- Eventos de itens sem cliente (ex.: tipo de tarefa, link rápido) não têm
-- cliente_nome.
alter table public.evento_log alter column cliente_nome drop not null;

create index if not exists evento_log_created_idx on public.evento_log (created_at desc);

create or replace function public.evento_log_registrar_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          jsonb;
  v_tipo     text := case tg_op when 'INSERT' then 'criacao' else 'exclusao' end;
  v_entidade text;
  v_descr    text;
  v_setor    text;
  v_cliente  uuid;
  v_cli_nome text;
  v_autor    uuid;
  v_nome     text;
  v_claims   jsonb;
  v_headers  jsonb;
begin
  -- Linha apagada/criada por outra operação (cascata de FK, trigger) não
  -- entra: o evento que importa é o da operação de origem.
  if pg_trigger_depth() > 1 then
    return old;  -- BEFORE DELETE precisa devolver OLD; em AFTER INSERT é ignorado
  end if;

  begin
    r := to_jsonb(case tg_op when 'INSERT' then new else old end);
    v_setor   := r->>'setor';
    v_cliente := nullif(r->>'cliente_id', '')::uuid;

    case tg_table_name
      when 'evento_arquivos' then
        v_entidade := 'Anexo do evento';
        v_descr := r->>'name';
        select a.cliente_id, a.setor::text into v_cliente, v_setor
          from tarefas_avulsas a where a.id = (r->>'evento_id')::uuid;
      when 'client_files' then
        v_entidade := 'Arquivo do cliente';
        v_descr := r->>'name';
      when 'procedimento_arquivos' then
        v_entidade := 'Anexo do procedimento';
        v_descr := r->>'name';
        v_setor := 'societario';
        select p.cliente_id, p.empresa into v_cliente, v_cli_nome
          from procedimentos_societario p where p.id = (r->>'procedimento_id')::uuid;
      when 'cliente_notas' then
        v_entidade := 'Nota';
        v_descr := left(r->>'texto', 80);
      when 'parcelamentos' then
        v_entidade := 'Parcelamento';
        v_descr := concat_ws(' — ', r->>'empresa', r->>'tarefa');
      when 'parcelamento_secoes' then
        v_entidade := 'Seção de parcelamento';
        v_descr := r->>'nome';
      when 'calendario_eventos' then
        v_entidade := 'Evento do calendário';
        v_descr := r->>'titulo';
      when 'tarefas_avulsas' then
        v_entidade := 'Evento';
        v_descr := r->>'titulo';
      when 'tarefa_tipos' then
        v_entidade := 'Tipo de tarefa';
        v_descr := r->>'nome';
      when 'tarefa_tipo_vinculos' then
        v_entidade := 'Vínculo de tarefa';
        select t.nome, t.setor::text into v_descr, v_setor
          from tarefa_tipos t where t.id = (r->>'tarefa_tipo_id')::uuid;
        v_descr := concat_ws(' → ', v_descr, case r->>'entidade_tipo'
          when 'atividade' then (select 'Atividade ' || a.nome from atividades a where a.id = (r->>'entidade_id')::uuid)
          when 'regime'    then (select 'Regime ' || g.nome from regimes g where g.id = (r->>'entidade_id')::uuid)
          when 'cliente'   then (select 'Cliente ' || c.nome from clientes c where c.id = (r->>'entidade_id')::uuid)
          else r->>'entidade_tipo'
        end);
        if r->>'entidade_tipo' = 'cliente' then
          v_cliente := nullif(r->>'entidade_id', '')::uuid;
        end if;
      when 'tarefa_vinculos' then
        v_entidade := 'Vínculo entre setores';
        v_descr := format('%s (%s) → %s (%s)', r->>'tipo_origem', r->>'setor_origem', r->>'tipo_destino', r->>'setor_destino');
        v_setor := r->>'setor_origem';
      when 'processo_tipos' then
        v_entidade := 'Processo';
        v_descr := r->>'nome';
        v_setor := 'societario';
      when 'procedimentos_societario' then
        v_entidade := 'Procedimento';
        v_descr := (select pt.nome from processo_tipos pt where pt.id = (r->>'processo_tipo_id')::uuid);
        v_cli_nome := r->>'empresa';
        v_setor := 'societario';
      when 'documentacao_modelos' then
        v_entidade := 'Modelo de documentação';
        v_descr := coalesce(r->>'nome', r->>'name');
        v_setor := 'societario';
      when 'atividades' then
        v_entidade := 'Atividade';
        v_descr := r->>'nome';
      when 'regimes' then
        v_entidade := 'Regime';
        v_descr := r->>'nome';
      when 'financeiro_movimentos' then
        v_entidade := 'Movimento financeiro';
        v_descr := concat_ws(' — ',
          (select ft.nome from financeiro_tipos ft where ft.id = (r->>'tipo_id')::uuid),
          'R$ ' || translate(to_char((r->>'valor')::numeric, 'FM999,999,990.00'), ',.', '.,'),
          to_char((r->>'data')::date, 'DD/MM/YYYY'));
        v_setor := 'financeiro';
      when 'financeiro_tipos' then
        v_entidade := 'Tipo financeiro';
        v_descr := r->>'nome';
        v_setor := 'financeiro';
      when 'financeiro_centros_custo' then
        v_entidade := 'Centro de custo';
        v_descr := r->>'nome';
        v_setor := 'financeiro';
      when 'links_rapidos' then
        v_entidade := 'Link rápido';
        v_descr := r->>'titulo';
      when 'agenda' then
        v_entidade := 'Compromisso na agenda';
        v_descr := r->>'titulo';
      else
        v_entidade := tg_table_name;
    end case;

    -- setor fora do enum (ex.: texto livre) vira "Geral" em vez de falhar
    if v_setor is not null and v_setor not in (select unnest(enum_range(null::user_setor))::text) then
      v_setor := null;
    end if;

    if v_cliente is not null then
      select coalesce(c.nome, v_cli_nome) into v_cli_nome from clientes c where c.id = v_cliente;
    end if;

    -- Autoria: sessão do usuário (navegador) ou header x-app-usuario das
    -- Server Actions com chave de serviço — mesmo critério da Lixeira (055).
    v_autor := auth.uid();
    if v_autor is null then
      begin
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
        if v_claims->>'role' = 'service_role' then
          v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
          v_autor := nullif(v_headers->>'x-app-usuario', '')::uuid;
        end if;
      exception when others then
        v_autor := null;
      end;
    end if;
    if v_autor is not null then
      select p.nome into v_nome from profiles p where p.id = v_autor;
    end if;

    insert into evento_log (setor, cliente_id, cliente_nome, tipo_evento, usuario_id, usuario_nome, detalhes)
    values (
      v_setor::user_setor,
      v_cliente,
      v_cli_nome,
      v_tipo,
      v_autor,
      coalesce(v_nome, case when v_autor is null then 'Sistema' else 'Desconhecido' end),
      jsonb_build_object('entidade', v_entidade, 'descricao', coalesce(nullif(v_descr, ''), '—'))
    );
  exception when others then
    raise warning 'evento_log_registrar_item(%): %', tg_table_name, sqlerrm;
  end;

  return old;
end;
$$;

revoke all on function public.evento_log_registrar_item() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'evento_arquivos', 'client_files', 'procedimento_arquivos', 'cliente_notas',
    'parcelamentos', 'parcelamento_secoes', 'calendario_eventos', 'tarefas_avulsas',
    'tarefa_tipos', 'tarefa_tipo_vinculos', 'tarefa_vinculos', 'processo_tipos',
    'procedimentos_societario', 'documentacao_modelos', 'atividades',
    'regimes', 'financeiro_movimentos', 'financeiro_tipos', 'financeiro_centros_custo',
    'links_rapidos', 'agenda'
  ] loop
    execute format('drop trigger if exists evento_log_item_criacao on public.%I', t);
    execute format('drop trigger if exists evento_log_item_exclusao on public.%I', t);
    execute format(
      'create trigger evento_log_item_criacao after insert on public.%I for each row execute function public.evento_log_registrar_item()', t);
    execute format(
      'create trigger evento_log_item_exclusao before delete on public.%I for each row execute function public.evento_log_registrar_item()', t);
  end loop;
end $$;
