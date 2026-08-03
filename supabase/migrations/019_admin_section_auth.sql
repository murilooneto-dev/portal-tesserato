-- supabase/migrations/019_admin_section_auth.sql

-- Camada de autenticação "step-up" da seção ADMIN (Parâmetros e Vínculos),
-- independente do login do portal (Supabase Auth / profiles.role='admin').
-- Multiusuário desde o início (RC1 do SPEC): nenhuma credencial fica
-- hardcoded no código, tudo vive em admin_users. Ver ARCHITECTURE.md /
-- BACKEND.md desta feature (TES-3) para o desenho completo.
--
-- pgcrypto já habilitado (migration 002) — usado aqui para bcrypt
-- (crypt/gen_salt) e para gen_random_uuid().

create table if not exists admin_users (
  id                  uuid primary key default gen_random_uuid(),
  username            text not null unique,
  senha_hash          text not null,
  ativo               boolean not null default true,
  trocar_senha        boolean not null default false,
  tentativas_falhas   smallint not null default 0,
  bloqueado_ate       timestamptz,
  ultimo_acesso_em    timestamptz,
  created_at          timestamptz not null default now()
);

alter table admin_users enable row level security;
-- Nenhuma policy de select/insert/update para anon/authenticated: a tabela
-- só é alcançável através das RPCs SECURITY DEFINER abaixo (ou service_role).

-- Semente exigida pelo cliente. Troca obrigatória no primeiro acesso
-- (trocar_senha=true) — RC2/DP4 do SPEC.
insert into admin_users (username, senha_hash, trocar_senha)
values ('ADMIN', crypt('ADMIN@123PASSWORD', gen_salt('bf')), true)
on conflict (username) do nothing;

-- Verifica credencial (bcrypt no banco, nunca no app) e aplica lockout
-- temporário após 5 tentativas incorretas (DP5). `status` distingue
-- 'ok' | 'invalid' | 'locked' apenas para a UI escolher a mensagem certa
-- (bloqueio vs. credencial errada) — nunca revela se o usuário existe.
--
-- SECURITY_REPORT.md CRIT-1: esta função **não** é concedida a
-- `authenticated` (ver revoke abaixo) — só é chamável via `service_role`,
-- a partir da Server Action `adminLogin` (app/admin/bloqueio/actions.ts),
-- que já validou sessão do portal + `role='admin'` antes de chamar. Expor
-- via `authenticated`/anon key permitiria qualquer colaborador logado
-- tomar a credencial ADMIN direto pelo PostgREST.
create or replace function admin_login(p_username text, p_senha text)
returns table (status text, id uuid, username text, trocar_senha boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v admin_users%rowtype;
begin
  select * into v from admin_users where admin_users.username = p_username and ativo;

  if not found then
    -- SECURITY_REPORT.md BAIXA-2: paga o mesmo custo de bcrypt do caminho
    -- "usuário existe" contra um hash descartável, pra não vazar a
    -- existência do usuário por diferença de tempo de resposta (a
    -- mensagem já é genérica — RN3 — mas o tempo não era).
    perform crypt(p_senha, '$2a$06$C6UzMDM.H6dfI/f/IKcEeO');
    return query select 'invalid'::text, null::uuid, null::text, null::boolean;
    return;
  end if;

  -- SECURITY_REPORT.md MED-2: zera o contador quando o lockout anterior já
  -- expirou — sem isso, uma tentativa errada a cada 15 min mantém o admin
  -- legítimo bloqueado indefinidamente (só um login bem-sucedido zerava).
  if v.bloqueado_ate is not null and v.bloqueado_ate <= now() then
    update admin_users set tentativas_falhas = 0, bloqueado_ate = null
      where admin_users.id = v.id
      returning tentativas_falhas, bloqueado_ate into v.tentativas_falhas, v.bloqueado_ate;
  elsif v.bloqueado_ate is not null and v.bloqueado_ate > now() then
    return query select 'locked'::text, null::uuid, null::text, null::boolean;
    return;
  end if;

  if v.senha_hash = crypt(p_senha, v.senha_hash) then
    update admin_users
      set tentativas_falhas = 0, bloqueado_ate = null, ultimo_acesso_em = now()
      where admin_users.id = v.id;
    return query select 'ok'::text, v.id, v.username, v.trocar_senha;
    return;
  end if;

  update admin_users
    set tentativas_falhas = tentativas_falhas + 1,
        bloqueado_ate = case when tentativas_falhas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end
    where admin_users.id = v.id
    returning tentativas_falhas into v.tentativas_falhas;

  if v.tentativas_falhas >= 5 then
    return query select 'locked'::text, null::uuid, null::text, null::boolean;
  else
    return query select 'invalid'::text, null::uuid, null::text, null::boolean;
  end if;
end;
$$;

revoke all on function admin_login(text, text) from public;
revoke execute on function admin_login(text, text) from authenticated, anon;

-- Troca de senha (fluxo obrigatório do primeiro acesso e trocas futuras).
-- p_id vem sempre da sessão ts_admin já verificada no servidor (nunca de
-- input do cliente) — não há verificação de senha atual aqui porque quem
-- chama já passou pelo admin_login nesta mesma sessão. Comprimento mínimo
-- de 8 caracteres é regra de backend/segurança (RN — ver BACKEND.md).
--
-- SECURITY_REPORT.md CRIT-1: assim como admin_login, esta função não tem
-- `grant` para `authenticated`/anon (ver revoke abaixo) — só é chamável
-- via `service_role`, a partir de `trocarSenhaInicial`, que já resolveu
-- `p_id` da sessão `ts_admin` verificada no servidor. Sem essa restrição,
-- qualquer autenticado poderia trocar a senha de qualquer admin_users
-- passando um `p_id` arbitrário direto pelo PostgREST.
create or replace function admin_trocar_senha(p_id uuid, p_senha_nova text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_senha_nova is null or length(p_senha_nova) < 8 then
    raise exception 'A nova senha deve ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  update admin_users
    set senha_hash = crypt(p_senha_nova, gen_salt('bf')),
        trocar_senha = false
    where admin_users.id = p_id and ativo;

  return found;
end;
$$;

revoke all on function admin_trocar_senha(uuid, text) from public;
revoke execute on function admin_trocar_senha(uuid, text) from authenticated, anon;

-- RPCs de gestão para o roadmap (tela de gestão de usuários ADMIN — fora do
-- escopo desta versão). Só service_role pode chamá-las por enquanto; sem
-- grant para anon/authenticated, então novos administradores são
-- cadastrados via SQL/RPC direto no Supabase até a UI existir.
create or replace function admin_user_create(p_username text, p_senha text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_senha is null or length(p_senha) < 8 then
    raise exception 'A senha deve ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  insert into admin_users (username, senha_hash, trocar_senha)
  values (p_username, crypt(p_senha, gen_salt('bf')), true)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function admin_user_create(text, text) from public;

create or replace function admin_user_set_ativo(p_id uuid, p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update admin_users set ativo = p_ativo where admin_users.id = p_id;
  return found;
end;
$$;

revoke all on function admin_user_set_ativo(uuid, boolean) from public;
