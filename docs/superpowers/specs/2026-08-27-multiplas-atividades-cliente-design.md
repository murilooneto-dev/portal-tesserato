# Múltiplas atividades por cliente

## Contexto

Hoje o campo Atividade do cliente (Fiscal, Contábil e Pessoal) é um `<select>`
de valor único, alimentado pelo catálogo `atividades` (admin, por setor). Na
prática um cliente pode exercer mais de uma atividade (ex.: serviço e
comércio), e isso já gerou um workaround histórico: o script
`scripts/normalizar-atividades.ts` (um-off, já executado, fora de escopo aqui)
normalizava valores compostos como "SERVIÇO E COMÉRCIO" cadastrados como texto
livre por falta de opção melhor.

Pedido: trocar o seletor por checkboxes, permitindo marcar 0..N atividades do
catálogo por cliente, nos 3 setores.

`atividade` é lido em ~28 arquivos: formulários de cadastro, listagens,
filtros, relatórios, geração automática de tarefas por vínculo e
preenchimento em lote. Este spec cobre a mudança de modelo de dados e todos
os pontos de consumo levantados.

## Modelo de dados

A coluna `atividade` (hoje `text`) vira `text[]` nas três tabelas de setor:
`clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`.

Migração (nova, ex. `supabase/migrations/027_atividade_multipla.sql`):
- `alter table clientes_fiscal alter column atividade type text[] using case when atividade is null then '{}'::text[] else array[atividade] end;`
- mesmo padrão para `clientes_contabil` e `clientes_pessoal`.
- Default `'{}'::text[]` nas 3 colunas (em vez de `null`), pra evitar
  `null`-checks espalhados pelo app — cliente sem atividade vira array vazio.

O catálogo `atividades` (tabela admin, gerida em
`/admin/configuracoes`) **não muda** — continua uma lista simples de nomes
por setor. `lib/catalogo-cliente.ts` (`CatalogoCliente.atividades: string[]`)
não muda. A comparação cliente↔catálogo continua por nome (nunca por id),
mesmo padrão já usado pra grupo/regime.

## Componente de seleção

Novo componente compartilhado `components/geral/SeletorAtividades.tsx`:
lista de checkboxes (visual consistente com os outros checkboxes do form —
ver padrão "Envia ISS?"/"Confere SIGA?" em `CamposFiscais.tsx`), recebendo
`valores: string[]`, `opcoes: string[]`, `onChange`, `readOnly`. Se o cliente
tiver uma atividade salva que não existe mais no catálogo ativo, ela aparece
listada e marcada com um sufixo "(atual)", mesmo padrão hoje usado no
`<select>` de Grupo/Regime.

Substitui o `<select>` de atividade em 3 lugares que hoje duplicam
essencialmente o mesmo bloco JSX:
- `components/fiscal/CamposFiscais.tsx` (usado por `EmpresaModal.tsx` do
  Fiscal e por `ClienteGeralModal.tsx` no cadastro geral)
- `components/contabil/EmpresaContabilModal.tsx` (inline, sem componente
  compartilhado hoje)
- `components/pessoal/EmpresaPessoalModal.tsx` (idem)

Em cada um desses 3 arquivos e em `ClienteGeralModal.tsx`: o tipo do form
(`CamposFiscaisData.atividade`, `FormData.atividade`) passa de `string` para
`string[]`; `emptyForm()` inicializa `atividade: []`; o load do cliente usa
`data.atividade ?? []`; o payload de save envia `form.atividade` (array,
inclusive vazio — sem precisar de `|| null`).

`lib/types.ts`: os 3 `atividade: string | null` (linhas 51, 113, 124) viram
`atividade: string[]`.

## Listagens

`components/fiscal/ClientesLista.tsx`,
`components/contabil/ClientesListaContabil.tsx`,
`components/pessoal/ClientesListaPessoal.tsx` (mesmo padrão nas 3):
- Lista de valores distintos pro dropdown de filtro: hoje
  `clientes.map(c => c.atividade ?? '').filter(Boolean)` → passa a fazer
  `flatMap` sobre os arrays antes do `Set`.
- Filtro: hoje `c.atividade !== filtroAtividade` → vira
  `!c.atividade.includes(filtroAtividade)`.
- Badge na linha do cliente: hoje uma tag única com `cliente.atividade` →
  vira uma tag por item de `cliente.atividade` (mesmo estilo visual,
  `flex-wrap` se necessário).

## Relatórios

`app/fiscal/relatorios/page.tsx`, `components/contabil/RelatoriosContabil.tsx`,
`components/pessoal/RelatoriosPessoal.tsx`: mesmo ajuste de lista distinta
(flatMap) e filtro (`includes`). Onde há contagem/agrupamento por atividade,
um cliente com 2 atividades passa a contar nos dois grupos — comportamento
natural pra uma dimensão multivalorada, sem necessidade de "atividade
principal".

## Geração automática de tarefas (vínculos)

`lib/tarefas-esperadas.ts`:
- `calcularTarefasEsperadas`: o parâmetro `cliente.atividade` passa de
  `string | null` para `string[]`.
- Linha `...(mapa.porAtividade[cliente.atividade ?? ''] ?? [])` vira união
  sobre todas as atividades do cliente:
  `...cliente.atividade.flatMap(a => mapa.porAtividade[a] ?? [])`.
- Resultado final continua passando pelo mesmo `new Set(...)`, então não há
  duplicação de tarefa mesmo que duas atividades apontem pro mesmo tipo.
- `buscarMapaVinculosSetor` não muda — já indexa vínculos por nome de
  entidade (grupo/regime/atividade), um vínculo por atividade individual.

`tests/tarefas-esperadas.test.ts`: ajustar os casos que hoje passam
`atividade: 'X'` para `atividade: ['X']`, e adicionar um caso com 2
atividades vinculadas a tarefas diferentes (espera união das duas, sem
duplicar).

## Preenchimento rápido

`lib/preenchimento-rapido.ts`:
- `ClienteFiltro.atividade`: `string | null` → `string[]`.
- `valoresDistintos`: para `campo === 'atividade'` precisa fazer flatMap em
  vez de ler `c[campo]` direto (grupo/regime continuam valor único). Como
  `CampoFiltro` mistura os 3 campos num tipo genérico, a função ganha um
  branch explícito pro caso array em vez de generalizar `c[campo]`.
- `clientesPorValor`: mesmo branch — `atividade` usa `.includes(valor)`,
  `grupo`/`regime` continuam `===`.
- `tarefasTipoDataVinculadas` não muda (opera sobre o mapa de vínculos por
  nome, não sobre o campo do cliente).

`tests/preenchimento-rapido.test.ts`: ajustar fixtures de `atividade` pra
array e cobrir o novo branch de `.includes`.

## Fora de escopo

- Catálogo de atividades (admin, `SetorConfigClient.tsx`,
  `tarefa-tipo-vinculos-actions.ts`): continua exatamente igual — cada
  atividade do catálogo continua uma entidade própria com seu próprio
  vínculo de tarefas; a mudança é só em quantas o cliente pode marcar.
- `scripts/normalizar-atividades.ts`, `exportar-clientes.ts`,
  `seed-placeholder.ts`, `migrate.ts`: scripts de manutenção pontual, não
  fazem parte do fluxo vivo do app. Não serão atualizados neste spec; se
  algum for reexecutado depois desta migração vai precisar de ajuste manual
  na hora.
- Migração de produção: como sempre, a migration SQL é entregue pronta mas
  **não** é aplicada por mim em produção — quem roda é o usuário, no dev
  primeiro (projeto Supabase de dev) e depois em produção manualmente.
