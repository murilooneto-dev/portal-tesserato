-- supabase/migrations/070_tarefa_tipos_por_cliente.sql

-- Tarefa personalizada do Contábil passa a ser do cliente: tarefa_tipos ganha
-- cliente_id. Nulo = tipo do setor (padrão, ligado a vínculo, e todos os
-- outros setores). Preenchido = tarefa criada na ficha daquele cliente, com
-- formato e criado_em próprios; mesmo nome em outro cliente é outro tipo.
-- Antes, o catálogo era único por (setor, nome) e digitar um nome que outro
-- cliente já usava reaproveitava o tipo dele (formato e data de quem criou).
--
-- Separação dos dados do Contábil: tipo não-padrão e sem vínculo vai para o
-- cliente que o tem em tarefas_personalizadas; com vários clientes, o de
-- menor cliente_id fica com o registro original e os demais ganham cópias
-- idênticas. Personalizado sem nenhum cliente é apagado.
--
-- Autoverificação: para cada cliente do Contábil e cada nome da ficha, o
-- tipo resolvido (do cliente, senão do setor) tem que ter exatamente o mesmo
-- formato e as mesmas datas de antes. Qualquer diferença aborta tudo.
begin;
set local lock_timeout = '5s';

create temp table _antes on commit drop as
select c.cliente_id, n.nome, t.tipo_resposta, t.etapas, t.meses_visiveis, t.criado_em, t.vigente_ate, t.ativo
from public.clientes_contabil c
cross join lateral (select distinct unnest(c.tarefas_personalizadas) as nome) n
left join public.tarefa_tipos t on t.setor = 'contabil' and t.nome = n.nome;

alter table public.tarefa_tipos
  add column if not exists cliente_id uuid references public.clientes(id) on delete cascade;

alter table public.tarefa_tipos drop constraint if exists tarefa_tipos_setor_nome_key;
create unique index if not exists tarefa_tipos_setor_nome_uniq
  on public.tarefa_tipos (setor, nome) where cliente_id is null;
create unique index if not exists tarefa_tipos_cliente_nome_uniq
  on public.tarefa_tipos (setor, cliente_id, nome) where cliente_id is not null;

-- As cópias não são criação de verdade: não registrar no log de eventos.
alter table public.tarefa_tipos disable trigger evento_log_item_criacao;
alter table public.tarefa_tipos disable trigger evento_log_item_exclusao;

create temp table _donos on commit drop as
select t.id as tipo_id, c.cliente_id,
       row_number() over (partition by t.id order by c.cliente_id) as rn
from public.tarefa_tipos t
join public.clientes_contabil c on c.tarefas_personalizadas @> array[t.nome]
where t.setor = 'contabil' and not t.padrao and t.cliente_id is null
  and not exists (select 1 from public.tarefa_tipo_vinculos v where v.tarefa_tipo_id = t.id);

update public.tarefa_tipos t set cliente_id = d.cliente_id
from _donos d where d.tipo_id = t.id and d.rn = 1;

insert into public.tarefa_tipos
  (setor, nome, etapas, ativo, meses_visiveis, tipo_resposta, padrao, responsavel_id, criado_em, vigente_ate, cliente_id)
select t.setor, t.nome, t.etapas, t.ativo, t.meses_visiveis, t.tipo_resposta, t.padrao, t.responsavel_id, t.criado_em, t.vigente_ate, d.cliente_id
from _donos d join public.tarefa_tipos t on t.id = d.tipo_id
where d.rn > 1;

delete from public.tarefa_tipos t
where t.setor = 'contabil' and not t.padrao and t.cliente_id is null
  and not exists (select 1 from public.tarefa_tipo_vinculos v where v.tarefa_tipo_id = t.id);

alter table public.tarefa_tipos enable trigger evento_log_item_criacao;
alter table public.tarefa_tipos enable trigger evento_log_item_exclusao;

do $$
declare diferencas int;
begin
  with depois as (
    select a.cliente_id, a.nome,
           coalesce(proprio.tipo_resposta, setor.tipo_resposta) as tipo_resposta,
           case when proprio.id is not null then proprio.etapas else setor.etapas end as etapas,
           case when proprio.id is not null then proprio.meses_visiveis else setor.meses_visiveis end as meses_visiveis,
           case when proprio.id is not null then proprio.criado_em else setor.criado_em end as criado_em,
           case when proprio.id is not null then proprio.vigente_ate else setor.vigente_ate end as vigente_ate,
           coalesce(proprio.ativo, setor.ativo) as ativo
    from _antes a
    left join public.tarefa_tipos proprio
      on proprio.setor = 'contabil' and proprio.cliente_id = a.cliente_id and proprio.nome = a.nome
    left join public.tarefa_tipos setor
      on setor.setor = 'contabil' and setor.cliente_id is null and setor.nome = a.nome
  )
  select count(*) into diferencas
  from _antes a join depois d using (cliente_id, nome)
  where a.tipo_resposta is distinct from d.tipo_resposta
     or a.etapas is distinct from d.etapas
     or a.meses_visiveis is distinct from d.meses_visiveis
     or a.criado_em is distinct from d.criado_em
     or a.vigente_ate is distinct from d.vigente_ate
     or a.ativo is distinct from d.ativo;

  if diferencas > 0 then
    raise exception '070: % tarefa(s) de cliente mudariam de formato ou data; nada aplicado', diferencas;
  end if;

  if exists (select 1 from public.tarefa_tipos where cliente_id is not null and setor <> 'contabil') then
    raise exception '070: tipo de cliente fora do Contábil';
  end if;
end $$;

commit;
