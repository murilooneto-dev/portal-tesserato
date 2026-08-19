# Campos Grupo/Regime/Atividade do cliente passam a puxar do catálogo

- Data: 2026-08-17
- Status: aprovado
- Setores afetados: Fiscal, Contábil, Pessoal

## Contexto

O spec [2026-08-14-config-grupos-regimes-atividades-tarefas-design.md](2026-08-14-config-grupos-regimes-atividades-tarefas-design.md)
criou a tela `/admin/configuracoes` (Fase 1, já implementada) onde o admin
cadastra listas de Grupos, Regimes e Atividades por setor. Aquele spec
original previa, na sequência, trocar `clientes_fiscal.grupo/regime/atividade`
(e equivalentes em Contábil/Pessoal) por colunas `_id` com FK pra essas
tabelas, com migration de dados e uma tela de revisão manual pros valores
sem correspondência.

Esta spec é uma versão mais simples dessa segunda parte, decidida com o
usuário: **sem colunas novas, sem migração de dados**. Os campos
`grupo`/`regime`/`atividade` continuam sendo texto puro nas tabelas de
cliente — só a origem das opções do `<select>` muda, de listas fixas no
código pra consulta às tabelas `grupos`/`regimes`/`atividades` cadastradas
em Configurações.

A segunda parte do spec de 08-14 (geração automática de tarefas a partir
dos vínculos regime+grupo+atividade, somada — não substituindo —
`tarefas_personalizadas`, com snapshot mensal) fica para um projeto
seguinte, que depende desta base.

## Fora de escopo

- Colunas novas (`regime_id`/`grupo_id`/`atividade_id`), migration de
  dados, tela de revisão manual — tudo isso do spec original fica sem
  fazer. As colunas de texto atuais (`grupo`, `regime`, `atividade`)
  continuam existindo e sendo a fonte de verdade, inalteradas.
- Geração automática de tarefas a partir dos vínculos — próximo projeto.
- Criar campo Grupo em Contábil/Pessoal (eles não têm esse campo hoje;
  não é criado aqui).

## Design

### Fonte das opções do select

Cada campo passa a listar `select nome from {grupos|regimes|atividades}
where setor = '<setor>' and ativo = true order by nome`, em vez das listas
fixas atuais (`GRUPOS`/`ATIVIDADES` em `CamposFiscais.tsx`,
`REGIMES`/`ATIVIDADES` em `lib/atividades-regimes.ts`, que é removido).

Ao salvar, grava o `nome` escolhido como texto na coluna existente — mesmo
formato de hoje (nenhuma mudança no schema nem no que os outros pontos do
sistema leem desses campos).

### Campo Regime do Fiscal muda de sentido

Hoje `clientes_fiscal.regime` é texto livre decorativo (ex.: "Isenta"),
sem lista nenhuma por trás — e é conceitualmente diferente do que
Contábil/Pessoal chamam de "regime" (Normal/Simples/MEI/Isento, que no
Fiscal hoje é o campo `grupo`). Por decisão do usuário, esse campo também
vira select puxando de `regimes` (setor='fiscal') — fica consistente com
Grupo e Atividade do próprio Fiscal, mesmo que o *conceito* que a tabela
`regimes` do Fiscal vai representar dependa de como o usuário cadastrar
essa lista em Configurações (não é mais necessariamente "Isenta"-style;
cabe ao usuário decidir o que cadastrar lá).

### Valor atual fora da lista

Contábil já implementa parcialmente esse padrão pro campo Atividade
(`components/contabil/EmpresaContabilModal.tsx`): se o valor salvo do
cliente não estiver entre as opções ativas do catálogo, ele aparece como
uma opção extra `"{valor} (atual)"` no topo do select, preservando o dado
sem forçar reescolha imediata. Generaliza esse mesmo padrão pros 7 campos:

- Fiscal: Grupo, Regime, Atividade
- Contábil: Regime, Atividade
- Pessoal: Regime, Atividade

### Componentes tocados

- `components/fiscal/CamposFiscais.tsx` — recebe as 3 listas (grupos,
  regimes, atividades do setor fiscal) como prop em vez de usar as
  constantes locais `GRUPOS`/`ATIVIDADES`; campo Regime deixa de ser
  `<input>` texto livre e vira `<select>`.
- `components/contabil/EmpresaContabilModal.tsx` — recebe as 2 listas
  (regimes, atividades do setor contábil) como prop em vez de importar de
  `lib/atividades-regimes.ts`; adiciona o fallback "(atual)" que falta no
  campo Regime.
- `components/pessoal/EmpresaPessoalModal.tsx` — mesma mudança que
  Contábil, setor pessoal.
- `lib/atividades-regimes.ts` — **não é removido** (correção encontrada no
  planejamento): `components/contabil/ClientesListaContabil.tsx` e
  `components/pessoal/ClientesListaPessoal.tsx` também importam `REGIMES`
  (filtro da listagem) e `labelRegime` (badge da linha do cliente) desse
  arquivo — um consumo separado do formulário de cadastro, fora do escopo
  desta spec (fica pra um projeto futuro de "filtros também usam o
  catálogo"). Só a constante `ATIVIDADES` desse arquivo é removida (fica
  sem nenhum consumidor depois que Fiscal/Contábil/Pessoal passarem a usar
  o catálogo) — `REGIMES`/`labelRegime` continuam intactos.

### Como as listas chegam no formulário

Sem chamada nova ao banco pelo navegador: cada página de listagem de
clientes (`app/fiscal/clientes/page.tsx`, `app/contabil/clientes/page.tsx`,
`app/pessoal/clientes/page.tsx`, `app/(comum)/clientes/page.tsx`) já busca
dados auxiliares no servidor e repassa como prop pro modal — mesmo padrão
já usado hoje para `responsaveis`/`templates`. Cada uma passa a buscar
também as listas ativas de `grupos`/`regimes`/`atividades` do setor
correspondente (usando o client de sessão normal — a RLS de leitura dessas
3 tabelas já libera qualquer autenticado, migration 024) e repassa pro
modal correspondente.

`app/(comum)/clientes/page.tsx` só precisa das 3 listas do Fiscal (é o
único setor com `CamposFiscais` renderizado ali).

### Telas de detalhe read-only (badges)

`app/contabil/clientes/[id]/page.tsx` e `app/pessoal/clientes/[id]/page.tsx`
exibem `regime`/`atividade` como badges de texto (via `labelRegime()`) sem
select — como o valor salvo continua sendo texto puro, essas telas
continuam funcionando sem mudança. `labelRegime()` (que traduzia o código
`'simples'` pro rótulo "Simples Nacional") deixa de fazer sentido depois
que `lib/atividades-regimes.ts` for removido — os dois pontos que a usam
passam a exibir `cliente.regime` diretamente (já é o texto legível agora,
não mais um código).

## Testes

Sem suíte automatizada cobrindo esses formulários hoje. Verificação
manual, uma vez por setor: abrir um cliente existente cujo
grupo/regime/atividade não bate com nada cadastrado no catálogo (valor
"(atual)" deve aparecer); cadastrar um item novo em Configurações e
confirmar que aparece no select do cliente; salvar e confirmar que o valor
persiste como texto igual antes.
