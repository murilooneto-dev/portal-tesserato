-- Centro de custo passa a poder ser separado por natureza (entrada/saída),
-- igual financeiro_tipos. Nullable: centros de custo já cadastrados ficam
-- sem natureza definida e continuam aparecendo nas duas listas (recebimento
-- e pagamento) -- não perde nem esconde dado já em uso.
alter table financeiro_centros_custo add column natureza text check (natureza in ('entrada', 'saida'));

-- Além de admin, qualquer usuário do setor financeiro passa a poder criar
-- (não renomear/ativar/excluir, que continuam só admin) um novo tipo ou
-- centro de custo -- pra não precisar sair da tela de lançamento pra
-- Configurações só pra cadastrar um item novo. Policies são somadas (OR)
-- por tipo de comando, então isso só abre criação pra mais gente.
create policy "Setor financeiro cria financeiro_tipos" on financeiro_tipos for insert with check (
  is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'financeiro' = any(p.setores))
);
create policy "Setor financeiro cria financeiro_centros_custo" on financeiro_centros_custo for insert with check (
  is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'financeiro' = any(p.setores))
);
