-- supabase/migrations/052_rls_setor_tarefas_e_operacionais.sql
--
-- Aperta RLS de escrita em 4 tabelas que hoje permitem acesso cruzado entre
-- setores (achado da auditoria de risco de 2026-09-28):
--  * tarefas: a policy de escrita ("Usuário gerencia próprias tarefas")
--    checava só o dono do registro, sem exigir que o setor da tarefa
--    bata com o setor do usuário. Trocada por uma checagem de setor,
--    igual à policy de leitura já existente (migration 006).
--  * observacoes_clientes: só o Fiscal escreve (salvarObs usa service role,
--    que ignora RLS de qualquer forma), mas Fiscal, Contábil E Pessoal leem
--    essa tabela de verdade nas próprias páginas de relatório
--    (app/fiscal|contabil|pessoal/relatorios/page.tsx), via client SSR
--    ligado a RLS. A policy de escrita antiga liberava qualquer autenticado,
--    de qualquer setor — isso é apertado. Mas apertar demais pra só-fiscal
--    (como as outras 3 tabelas desta migration) bloquearia leitura
--    legítima de Contábil/Pessoal. Por isso aqui a escrita fica restrita a
--    fiscal/admin (for all) e é somada uma policy de SELECT à parte, mais
--    ampla, cobrindo os 3 setores leitores — policies permissivas somam por
--    OR, então fiscal/admin continuam com CRUD completo (pela "for all") e
--    contábil/pessoal ganham só leitura (pela SELECT extra). A policy de
--    leitura residual antiga ("Autenticados leem observacoes_clientes")
--    ainda é removida, porque ela liberava QUALQUER autenticado (não só os
--    3 setores certos).
--  * procedimentos_societario / procedimento_arquivos: exclusivos do
--    Societário; a policy de escrita liberava qualquer autenticado. Mesmo
--    problema e mesma correção da policy de leitura residual acima.
--
-- Não mexe em tarefa_etapas/tarefa_arquivos (já filtram por setor via join
-- com tarefas desde as migrations 007/011) nem em client_files (decisão já
-- aceita conscientemente antes, fora do escopo desta correção).

drop policy if exists "Usuário gerencia próprias tarefas" on tarefas;
create policy "Setor gerencia tarefas" on tarefas for all using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
) with check (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
);

drop policy if exists "Autenticados gerenciam observacoes_clientes" on observacoes_clientes;
drop policy if exists "Autenticados leem observacoes_clientes" on observacoes_clientes;
create policy "Setor fiscal gerencia observacoes_clientes" on observacoes_clientes for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'fiscal'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'fiscal'::user_setor = any(p.setores))
  )
);
create policy "Setores leitores leem observacoes_clientes" on observacoes_clientes for select using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (
      p.role = 'admin' or p.setores && array['fiscal', 'contabil', 'pessoal']::user_setor[]
    )
  )
);

drop policy if exists "Autenticados gerenciam procedimentos_societario" on procedimentos_societario;
drop policy if exists "Autenticados leem procedimentos_societario" on procedimentos_societario;
create policy "Setor societario gerencia procedimentos_societario" on procedimentos_societario for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
);

drop policy if exists "Autenticados gerenciam procedimento_arquivos" on procedimento_arquivos;
drop policy if exists "Autenticados leem procedimento_arquivos" on procedimento_arquivos;
create policy "Setor societario gerencia procedimento_arquivos" on procedimento_arquivos for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
);
