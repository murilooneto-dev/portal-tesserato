-- supabase/tests/068_lista_tipos_de_saida.sql
--
-- Lista dos Tipos de Saída ANTES da migration 068 (só leitura). Rodar no dev
-- e, depois, em produção, e guardar o resultado: é o registro do que saiu.
--   apagado   = Avulso sem nenhum movimento (a 068 apaga)
--   historico = Avulso com pagamento registrado (fica guardado, sem tela)
--   lixeira   = Avulso só com movimento na Lixeira (fica até a Lixeira expirar)
--   conta     = Recorrente ou Prazo determinado (continua em Contas a Pagar)
select
  case
    when t.forma_pagamento <> 'avulso' then 'conta'
    when mov.total > 0 then 'historico'
    when lix.total > 0 then 'lixeira'
    else 'apagado'
  end as destino,
  t.nome,
  t.forma_pagamento,
  t.ativo,
  mov.total as movimentos,
  mov.pagos,
  to_char(mov.ultimo_pagamento, 'DD/MM/YYYY') as ultimo_pagamento
from public.financeiro_tipos t
cross join lateral (
  select count(*) as total,
         count(*) filter (where m.pago) as pagos,
         max(m.pago_em) as ultimo_pagamento
  from public.financeiro_movimentos m where m.tipo_id = t.id
) mov
cross join lateral (
  select count(*) as total
  from public.lixeira l
  where l.tabela = 'financeiro_movimentos' and l.restaurado_em is null
    and l.dados->>'tipo_id' = t.id::text
) lix
where t.natureza = 'saida'
order by 1, t.nome;
