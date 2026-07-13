-- supabase/migrations/004_multi_setor.sql

alter table profiles add column if not exists setores user_setor[];
update profiles set setores = array[setor] where setores is null;
alter table profiles alter column setores set not null;
alter table profiles alter column setores set default '{fiscal}';
alter table profiles drop column if exists setor;

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
