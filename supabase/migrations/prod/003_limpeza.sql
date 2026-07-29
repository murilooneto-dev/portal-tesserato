-- supabase/migrations/prod/003_limpeza.sql
--
-- Fase de LIMPEZA da promoção da expansão multi-setor para produção.
-- PONTO DE NÃO-RETORNO: depois desta fase não existe reversão graciosa
-- — colunas removidas aqui só voltam restaurando o clone completo tirado
-- antes do rollout (ver docs/runbook-rollout-producao.md, 1.6/Parte 2
-- item 1). Só rodar depois que o deploy do código novo estiver
-- confirmado estável em produção (checklist de perfis, navegação real).

-- Trava real: aborta a migration inteira se o marco não existir. Rodar
-- `psql -v ON_ERROR_STOP=1 --single-transaction` (não só `psql -f`) é o
-- que garante que o abort realmente impede os DROPs abaixo — ver
-- docs/runbook-rollout-producao.md.
select exigir_marco('deploy_novo_validado');

-- ============================================================
-- clientes: troca a policy que dependia da coluna responsavel
-- ============================================================

drop policy if exists "Responsavel atualiza seu cliente" on clientes;
create policy "Responsavel atualiza seu cliente" on clientes for update using (
  exists (
    select 1 from clientes_fiscal cf
    join profiles p on p.id = auth.uid()
    where cf.cliente_id = clientes.id and lower(p.nome) = lower(cf.responsavel)
  )
);

-- ============================================================
-- clientes: remove as 14 colunas já migradas para clientes_fiscal
-- ============================================================

alter table clientes
  drop column if exists cod,
  drop column if exists regime,
  drop column if exists atividade,
  drop column if exists responsavel,
  drop column if exists grupo,
  drop column if exists obs,
  drop column if exists prioridade,
  drop column if exists envia_iss,
  drop column if exists confere_siga,
  drop column if exists login_iss,
  drop column if exists senha_iss,
  drop column if exists email_envio_iss,
  drop column if exists declaracao_anual,
  drop column if exists tarefas_personalizadas;

-- ============================================================
-- profiles: remove setor (singular) — só setores (array) continua
-- ============================================================

alter table profiles drop column if exists setor;

-- ============================================================
-- tarefas: remove o DEFAULT de setor
-- ============================================================
--
-- Mantido durante aditiva/correção para não quebrar INSERTs do código
-- antigo (ver comentário em 001_aditiva.sql). Removido agora porque o
-- código novo sempre especifica `setor` explicitamente, e remover o
-- default é o que faz o schema final bater exatamente com o do dev
-- (verificação do runbook, passo 1.9/equivalente da Parte 2).

alter table tarefas alter column setor drop default;

-- ============================================================
-- handle_new_user(): versão final (sem dual-write)
-- ============================================================
--
-- A partir daqui só existe `profiles.setores` — a versão de transição
-- escrevia `setor` também porque a coluna ainda existia; agora ela não
-- existe mais, então essa function precisa parar de tentar escrever
-- nela. Idêntica à versão final do dev.

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, role, setores, cor)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operador'),
    coalesce(
      (select array_agg(x::user_setor) from jsonb_array_elements_text(new.raw_user_meta_data->'setores') as x),
      '{fiscal}'
    ),
    coalesce(new.raw_user_meta_data->>'cor', '#6366f1')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
