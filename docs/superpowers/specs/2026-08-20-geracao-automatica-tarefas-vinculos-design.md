# Geração automática de tarefas a partir dos vínculos (Parte 2)

- Data: 2026-08-20
- Status: aprovado
- Setores afetados: Fiscal, Contábil, Pessoal

## Contexto

O spec [2026-08-14-config-grupos-regimes-atividades-tarefas-design.md](2026-08-14-config-grupos-regimes-atividades-tarefas-design.md)
(Fase 1, implementada) criou a tela `/admin/configuracoes` onde o admin
cadastra Grupos/Regimes/Atividades por setor e vincula cada um a tarefas do
catálogo (`tarefa_tipo_vinculos`). O spec
[2026-08-17-campos-cliente-usam-catalogo-design.md](2026-08-17-campos-cliente-usam-catalogo-design.md)
(PR #84) fez os campos Grupo/Regime/Atividade do cadastro de cliente
puxarem as opções desse catálogo.

Nenhum dos dois lê os vínculos pra gerar tarefa nenhuma — o usuário
cadastrou vínculos em Configurações e reportou que "o sistema não altera
as tarefas do cliente de acordo com o que foi colocado". Esta spec cobre
exatamente essa lacuna: ler os vínculos e somar à lista de tarefas
esperadas de cada cliente, nos 3 setores.

Decisão tomada com o usuário, em ordem:
1. Só a geração automática (peça A do spec de 08-14) — o mecanismo de
   snapshot mensal pra não reescrever histórico (peça B) fica pra depois.
2. Os 3 setores juntos nesta mesma spec/plano.
3. Casamento do grupo/regime/atividade do cliente com a entidade do
   catálogo por **nome** (sem coluna de ID) — aceitando o risco de um
   rename futuro no catálogo desconectar clientes com o nome antigo.
4. Aposentar os 3 mecanismos legados do Fiscal que hoje fazem algo
   parecido de forma paralela e desincronizada (`getTiposParaGrupoFiscal`,
   `atividade_templates`/`resolverTemplate`, `grupo_templates`/"Aplicar
   template").

## Fora de escopo

- Snapshot mensal (`tarefas_esperadas_mes`) — próximo projeto.
- Colunas `regime_id`/`grupo_id`/`atividade_id` — decisão explícita de
  continuar casando por nome.
- Mudar a seed de tarefas de cliente novo em Contábil/Pessoal
  (`tarefa_tipos.padrao=true` em `ClienteGeralModal.tsx`) — não é um dos
  mecanismos citados pra aposentar, continua como está.
- Financeiro e Societário — sem tabela de cliente própria, não têm
  `tarefas_personalizadas`, fora do escopo (mesmo motivo do spec de 08-14).

## Design

### Módulo compartilhado: `lib/tarefas-esperadas.ts`

Duas peças, separando I/O de lógica pura (mesmo padrão de `lib/vinculos.ts`):

```ts
export interface MapaVinculosSetor {
  porGrupo: Record<string, string[]>
  porRegime: Record<string, string[]>
  porAtividade: Record<string, string[]>
}

// Uma consulta em lote por carregamento de página (nunca por cliente) —
// junta grupos/regimes/atividades (id, nome) com tarefa_tipo_vinculos e
// tarefa_tipos (nome) do setor, monta os 3 mapas nome → [nomes de tarefa].
export async function buscarMapaVinculosSetor(
  supabase: SupabaseServer,
  setor: UserSetor,
): Promise<MapaVinculosSetor>

// Função pura, testável: soma o que os vínculos do grupo/regime/atividade
// do cliente geram com as tarefas_personalizadas dele. Nunca duplica
// (Set). Cliente sem grupo/regime/atividade preenchido simplesmente não
// contribui nada desses 3 — a lista vira só tarefas_personalizadas, igual
// hoje sem nenhum fallback.
export function calcularTarefasEsperadas(
  cliente: { grupo?: string | null; regime?: string | null; atividade?: string | null; tarefas_personalizadas: string[] },
  mapa: MapaVinculosSetor,
): string[]
```

`calcularTarefasEsperadas` faz `[grupo, regime, atividade]
.map(entidade => mapa.porX[entidade] ?? [])`, une os 3 arrays resultantes
com `tarefas_personalizadas` via `Set`, devolve `Array.from(set)`.

### Onde substitui a leitura crua de `tarefas_personalizadas`

Levantamento feito no código atual (14 pontos de leitura direta, 3
setores) — cada página abaixo passa a chamar `buscarMapaVinculosSetor`
uma vez e usar `calcularTarefasEsperadas(cliente, mapa)` no lugar do
campo cru, preservando a lógica adicional que já existe em cima (união
com tipos de parcelamento no Fiscal/Pessoal, filtro de visibilidade por
mês no Pessoal):

**Fiscal:**
- `app/fiscal/clientes/[id]/page.tsx` — `tarefasBaseFiscal`/
  `tarefasPersonalizadasEfetivas` (checklist + grid histórico de 12 meses)
- `components/fiscal/TarefaChecklist.tsx:111` — fallback interno
- `app/fiscal/clientes/page.tsx` — `progressoMap`/`tiposMap` da listagem
- `app/fiscal/dashboard/page.tsx` — contadores gerais e por responsável
- `app/fiscal/relatorios/page.tsx` — `progresso()`, filtro de tarefa, relatório impresso

**Contábil:**
- `app/contabil/clientes/[id]/page.tsx` → `TarefaChecklistContabil.tsx`
- `app/contabil/clientes/page.tsx` — `progressoMap`/`tiposMap`
- `app/contabil/dashboard/page.tsx` — contadores
- `app/contabil/relatorios/page.tsx` → `RelatoriosContabil.tsx`

**Pessoal:**
- `app/pessoal/clientes/[id]/page.tsx` → `TarefaChecklistPessoal.tsx`
  (mantém o filtro `filtrarTarefasVisiveis`/mês por cima)
- `app/pessoal/clientes/page.tsx` — `progressoMap`/`tiposMap`
- `app/pessoal/dashboard/page.tsx` — contadores
- `app/pessoal/relatorios/page.tsx` → `RelatoriosPessoal.tsx`

`app/(comum)/vinculos/page.tsx` (constrói a lista de nomes de tarefa por
setor pra tela de vínculos entre setores) e os modais de edição
(`EmpresaModal.tsx`, `EmpresaContabilModal.tsx`, `EmpresaPessoalModal.tsx`,
`ClienteGeralModal.tsx`) continuam lendo `tarefas_personalizadas` cru —
eles editam/mostram a lista *manual*, não a lista *esperada* calculada;
não são pontos deste projeto.

### Retirada dos 3 mecanismos legados (Fiscal)

- **`getTiposParaGrupoFiscal()`** (`lib/tarefa-tipos.ts`) — removida.
  Chamadores: `app/fiscal/clientes/[id]/page.tsx:60`,
  `components/fiscal/TarefaChecklist.tsx:111`. O papel de fallback fica
  coberto pela união com vínculos.
- **`atividade_templates`/`resolverTemplate`** — removidos.
  `lib/atividade-templates.ts` deixa de ser importado.
  `components/fiscal/CamposFiscais.tsx`: remove a chamada de
  `resolverTemplate` no `onChange` da Atividade e o botão "Restaurar
  padrão da atividade". `app/fiscal/parametros/actions.ts`: remove
  `salvarTemplate`/`aplicarTemplateAClientes`.
  `components/fiscal/ParametrosClient.tsx`: remove a seção de template por
  Atividade e o botão "Aplicar a todos os clientes". As 3 páginas que só
  buscam `atividade_templates` pra montar `templatesMap`
  (`fiscal/clientes/page.tsx`, `fiscal/clientes/[id]/page.tsx`,
  `(comum)/clientes/page.tsx`) param de buscar e de passar essa prop.
  **Efeito colateral aceito**: criar cliente novo deixa de pré-popular
  `tarefas_personalizadas` ao escolher Atividade — a lista de tarefas
  automáticas passa a vir só do vínculo, visível depois de salvar.
- **`grupo_templates`/`aplicarTemplateGrupoAClientes`** — removidos.
  `app/fiscal/parametros/actions.ts`: remove `salvarTemplateGrupo`/
  `aplicarTemplateGrupoAClientes`. `ParametrosClient.tsx`: remove a seção
  de template por Grupo e o botão "Aplicar a todos os clientes".

Nenhuma migration remove as tabelas `atividade_templates`/
`grupo_templates` — ficam no banco sem uso, mesmo padrão já usado com
`admin_users` (branch de remoção do step-up auth).

### Casos de borda

- Cliente sem grupo/regime/atividade preenchido: contribui zero desses 3
  — lista final = só `tarefas_personalizadas`.
- Vínculos ainda não cadastrados no momento do deploy: mesma coisa, lista
  final = só `tarefas_personalizadas` (sem o fallback legado que existia
  antes) — janela de transição até o usuário cadastrar os vínculos.

## Testes

`calcularTarefasEsperadas()` é pura — testes unitários cobrindo: sem
nenhum vínculo, vínculo só por grupo, só por regime, só por atividade,
combinação dos 3, união sem duplicar com `tarefas_personalizadas`, cliente
sem grupo/regime/atividade preenchido. `buscarMapaVinculosSetor()` não tem
teste automatizado (mesmo padrão dos helpers que tocam Supabase direto,
como `buscarPendenciasVinculoPorCliente`). Verificação manual no
navegador — 3 setores × (checklist, dashboard, relatório, listagem) — fica
reservada pro usuário.
