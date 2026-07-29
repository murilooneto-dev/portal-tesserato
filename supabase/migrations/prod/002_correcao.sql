-- supabase/migrations/prod/002_correcao.sql
--
-- Fase de CORREÇÃO da promoção da expansão multi-setor para produção.
-- Rodar IMEDIATAMENTE ANTES do deploy do código novo (Parte 2, item 3 do
-- runbook) — não horas/dias antes. O objetivo desta fase é minimizar a
-- janela entre "copiar/trocar algo que o código antigo ainda usa" e
-- "código novo assume que já está copiado/trocado".
--
-- Cada statement aqui foi classificado explicitamente como seguro sob o
-- código antigo (não quebra nada rodando agora) mas envolve DROP+CREATE
-- ou re-sincronização de algo que a fase aditiva deixou pendente de
-- propósito.

-- ============================================================
-- Cópia final de clientes -> clientes_fiscal (dados frescos)
-- ============================================================
--
-- A fase aditiva (001) criou clientes_fiscal vazia de propósito — o
-- código antigo continuou escrevendo nas colunas antigas de `clientes`
-- entre a aditiva e agora. Esta cópia roda o mais perto possível do
-- deploy para minimizar o quanto ela fica desatualizada antes do
-- código novo começar a ler clientes_fiscal.
insert into clientes_fiscal (
  cliente_id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
)
select
  id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
from clientes
on conflict (cliente_id) do update set
  cod = excluded.cod,
  regime = excluded.regime,
  atividade = excluded.atividade,
  responsavel = excluded.responsavel,
  grupo = excluded.grupo,
  obs = excluded.obs,
  prioridade = excluded.prioridade,
  envia_iss = excluded.envia_iss,
  confere_siga = excluded.confere_siga,
  login_iss = excluded.login_iss,
  senha_iss = excluded.senha_iss,
  email_envio_iss = excluded.email_envio_iss,
  declaracao_anual = excluded.declaracao_anual,
  tarefas_personalizadas = excluded.tarefas_personalizadas;

-- Mesma lógica para clientes_contabil/clientes_pessoal, caso algum
-- cliente já tenha sido marcado com esses setores entre a aditiva e
-- agora (hoje não há nenhum em produção, mas o backfill é barato e
-- mantém a mesma disciplina de "copiar o mais tarde possível").
insert into clientes_contabil (cliente_id, tarefas_personalizadas)
select c.id, (select array_agg(nome order by nome) from tarefa_tipos where setor = 'contabil')
from clientes c
where 'contabil' = any(c.setores)
  and not exists (select 1 from clientes_contabil cc where cc.cliente_id = c.id);

insert into clientes_pessoal (cliente_id, tarefas_personalizadas)
select c.id, (select array_agg(nome order by nome) from tarefa_tipos where setor = 'pessoal')
from clientes c
where 'pessoal' = any(c.setores)
  and not exists (select 1 from clientes_pessoal cp where cp.cliente_id = c.id);

-- ============================================================
-- Re-backfill de profiles.setores
-- ============================================================
--
-- Se algum admin trocou o setor de um usuário pelo código antigo (que só
-- sabe escrever `setor` singular) entre a aditiva e agora, `setores`
-- ficaria desatualizado. Re-roda o backfill só para quem realmente
-- divergiu.
update profiles
set setores = array[setor]
where setor is not null and setores is distinct from array[setor];

-- ============================================================
-- tarefas: troca a constraint UNIQUE para incluir setor
-- ============================================================
--
-- Seguro: nenhum código do app faz upsert em `tarefas` com onConflict
-- baseado nessa constraint (confirmado por grep no código-fonte) — só
-- INSERTs simples, que continuam funcionando igual (o escopo de
-- unicidade efetivo não muda enquanto `setor` for sempre 'fiscal', que é
-- o caso de toda tarefa existente e de todo INSERT do código antigo).
--
-- ATENÇÃO: produção real tem DUAS constraints UNIQUE equivalentes em
-- `tarefas` (drift real, confirmado com
-- `select conname from pg_constraint where conrelid='tarefas'::regclass and contype='u'`)
-- — `tarefas_cliente_id_mes_ano_tipo_key` e `tarefas_cliente_mes_ano_tipo_key`,
-- ambas `UNIQUE (cliente_id, mes, ano, tipo)`. O dev só conhecia uma
-- (`tarefas_cliente_mes_ano_tipo_key`); dropar só essa deixaria a outra
-- viva, mascarando o "sucesso" desta migration sem realmente trocar a
-- constraint efetiva. Dropar as duas antes de criar a nova.
alter table tarefas drop constraint if exists tarefas_cliente_id_mes_ano_tipo_key;
alter table tarefas drop constraint if exists tarefas_cliente_mes_ano_tipo_key;
alter table tarefas add constraint tarefas_cliente_mes_ano_tipo_setor_key
  unique (cliente_id, mes, ano, tipo, setor);

-- ============================================================
-- tarefas: troca a policy de leitura pra filtrar por setor
-- ============================================================
--
-- Seguro pela mesma razão: hoje toda `tarefas.setor` é 'fiscal' e todo
-- `profiles.setores` inclui 'fiscal' — a nova policy aprova exatamente
-- os mesmos casos que a antiga aprovava, só que já pronta para quando
-- existirem tarefas de outros setores.
drop policy if exists "Autenticados leem tarefas" on tarefas;
create policy "Setor le suas tarefas" on tarefas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
);
