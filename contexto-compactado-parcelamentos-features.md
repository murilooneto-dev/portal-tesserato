# Contexto Compactado — Features de Parcelamento (portal-tesserato)

**Data da compactação:** 2026-08-07
**Chat original:** sessão longa, múltiplas features encadeadas (~200+ mensagens)

---

## 1. Objetivo

Série de melhorias na feature "Parcelamentos" do portal-tesserato (Next.js + Supabase, setor Fiscal): (1) avisar na ficha do cliente quando há parcelamento em andamento, (2) mudar o formato dos campos de mês pra dd/mm, (3) tornar a "Seção" do parcelamento um catálogo editável em vez de lista fixa, (4) [EM ANDAMENTO] transformar o preenchimento mensal em tarefa de verdade na ficha do cliente (Fiscal e Pessoal), contando no dashboard.

## 2. Decisões Tomadas

- **Aviso de parcelamento na ficha**: pill vermelha nas fichas Fiscal/Contábil/Pessoal quando `parcelamentos.status = 'EM ANDAMENTO'` casado por CNPJ — porque não há `cliente_id` em `parcelamentos`, só CNPJ.
- **Campos de mês (`jan`..`dez`) viram `dd/mm` texto, sem ano**: decisão do usuário — o cadastro original nunca teve ano associado ao mês, forçar `date` exigiria inventar ano.
- **Texto livre antigo preservado em `*_obs`**: renomeado antes da mudança de tipo, nunca exposto na UI, só consultável via SQL direto.
- **Casamento de backfill por CNPJ + secao + jan_obs (texto original)**: não por `id` (dev/prod têm parcelamentos diferentes) nem por índice de linha — evita misturar dado de cliente errado. Script tolerante a "não encontrado" (raise notice, não aborta), só aborta se um UPDATE afeta MAIS linhas que o esperado (sinal real de match ambíguo).
- **Blank ≠ sempre NULL nos campos `*_obs`**: dado histórico misto, algumas células são `NULL`, outras `''`. Comparação precisa ser `coalesce(campo,'') = ''`, não `IS NULL`.
- **Seção de parcelamento vira catálogo (`parcelamento_secoes`)**: criar/renomear/remover pelo próprio formulário. Renomear cascata pra `parcelamentos.secao` (texto livre, não FK). Remover bloqueado se há parcelamento usando.
- **RLS na tabela nova**: qualquer autenticado lê e escreve (sem checagem de role) — mesma permissão de quem já pode cadastrar parcelamento.
- **[Feature em andamento] Tarefa automática por parcelamento**: nova coluna `tarefas.parcelamento_id` (FK opcional). Setor do parcelamento vira campo `setores text[]` (checkboxes Fiscal/Contábil/Pessoal, só Fiscal e Pessoal geram tarefa nesta entrega). Sincronização reativa (sem cron) — roda ao carregar ficha OU dashboard do setor, cria tarefa só se ainda não existe (nunca sobrescreve). Nome: `Parcelamentos (SEÇÃO)`, desambiguado com `/ LOCAL_TIPO` se duplicado. Preencher a data na tarefa grava de volta no mês certo de `parcelamentos`. Campos de mês na tela de Parcelamentos viram somente-leitura (só editável via tarefa).

## 3. Estado Atual

- ✅ **Aviso de parcelamento**: implementado, revisado (subagent-driven-development), mergeado (PR #55→dev, #56→main).
- ✅ **dd/mm + backfill**: migration final aplicada em dev E produção (com correções de tipo/RLS ao longo do caminho). Backfill de ~89 empresas rodado com sucesso nos dois bancos.
- ✅ **Hotfix "undefined/undefined"**: PR mergeada antes de eu terminar a correção dd/mm — commit fx ficou de fora do merge. Corrigido via `git worktree` + `cherry-pick` em branches novas, PRs #59(→main)/#61(→dev), mergeadas.
- ✅ **Seção customizável**: implementado, revisado, mergeado (PR #62→dev). Bug pós-merge era **env vars do Vercel** (Preview/Development apontando pra produção, não dev) — não bug de código. Corrigido pelo usuário no painel do Vercel.
- 🚧 **Tarefa automática de parcelamento**: spec aprovada e commitada. Plano de implementação **NÃO escrito ainda** — pesquisa de código feita (ver seção 5), mas havia uma questão de arquitetura em aberto no momento da compactação (ver seção 8).

## 4. Arquivos e Artefatos Relevantes

| Arquivo | Status | Descrição |
|---|---|---|
| `lib/parcelamentos-aviso.ts` | Criado | `buscarLabelsParcelamentoAtivo(supabase, cnpj)`, `SECAO_LABEL_CURTO` |
| `supabase/migrations/019_parcelamento_status_e_datas.sql` | Aplicado (dev+prod) | status + `jan`..`dez` texto dd/mm + `*_obs` preservados |
| `scripts/backfill/parcelamentos_backfill_dd_mm.sql` | Executado, **NÃO commitado** (dado real de cliente) | 89 UPDATEs, tolerante a linha ausente |
| `supabase/migrations/021_parcelamento_secoes_catalogo.sql` | Aplicado (dev), **falta produção** | tabela `parcelamento_secoes` + RLS |
| `lib/parcelamento-secoes-actions.ts` | Criado, mergeado | `criarSecaoParcelamento`, `renomearSecaoParcelamento`, `removerSecaoParcelamento` |
| `components/fiscal/GerenciarSecoesModal.tsx` | Criado, mergeado | modal listar/editar/remover seções |
| `app/fiscal/parcelamentos/page.tsx` | Muito modificado, mergeado | select de seção com "+ Criar nova...", meses ainda editáveis (vai virar somente-leitura na próxima feature) |
| `docs/superpowers/specs/2026-08-07-tarefa-automatica-parcelamento-design.md` | Aprovada, commitada | spec da feature em andamento |
| `docs/superpowers/plans/2026-08-07-secao-parcelamento-customizavel.md` | Concluído | plano já executado |

**Branches/PRs:**
- `feat/aviso-parcelamento-ficha-cliente` — mergeada (#55 dev, #56 main)
- `fix/parcelamento-dd-mm-hotfix(-dev)` — mergeadas (#59 main, #61 dev)
- `feat/secao-parcelamento-customizavel` — mergeada (#62 dev)
- `feat/tarefa-automatica-parcelamento` — **branch atual**, worktree `D:\DEV\Site Tesserato + Fiscal\portal-tesserato-tarefa-parcelamento`, empilhada sobre a branch anterior (já mergeada, então pode considerar como base = dev atual)

## 5. Código e Configurações Críticas

**Schema `tarefas` (unique: cliente_id+mes+ano+tipo+setor):**
```sql
create table tarefas (
  id uuid primary key, cliente_id uuid not null, usuario_id uuid, -- nullable
  mes smallint not null, ano smallint not null, tipo text not null,
  concluida boolean not null default false, concluida_em timestamptz,
  setor user_setor, created_at timestamptz not null default now()
);
```

**Toggle Fiscal** (`app/fiscal/clientes/[id]/page.tsx:122-147`, server action inline `toggleTarefa`):
```ts
async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
  'use server'
  // upsert por cliente_id+mes+ano+tipo+setor='fiscal'
  // concluida_em = data ? new Date(data+'T12:00:00').toISOString() : new Date().toISOString()
}
```

**Toggle Pessoal** (`app/pessoal/clientes/actions.ts:8-37`, `toggleTarefaPessoal`) — mesma lógica, `setor='pessoal'`.

**Fallback de lista de tarefas** (`components/fiscal/TarefaChecklist.tsx:119`):
```ts
const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupo(grupo)
```
⚠️ Se `tarefasPersonalizadas` estiver vazia (cliente usa fallback por grupo) e eu injetar nomes sintéticos de parcelamento nela, ela deixa de estar vazia e o cliente PERDE toda a lista de fallback — regressão séria. Ver seção 8.

**Cálculo de % no dashboard** (`app/fiscal/dashboard/page.tsx:41-43`, mesmo padrão em `app/pessoal/dashboard/page.tsx:45-46`):
```ts
const totalTarefas = cs.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
```
Só conta tarefas cujo `tipo` está em `tarefas_personalizadas` — tarefas de parcelamento (nome dinâmico) ficariam de fora a menos que o cálculo seja estendido pra incluir `t.parcelamento_id !== null` também.

**Checkbox de Setor** (padrão a replicar, `components/geral/ClienteGeralModal.tsx:376-387`):
```tsx
<div className="grid grid-cols-2 gap-2">
  {SETORES.map(setor => (
    <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={form.setores.includes(setor)} onChange={() => toggleSetor(setor)}
        className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
      <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
    </label>
  ))}
</div>
```
Pra parcelamento, usar só 3: `['fiscal','contabil','pessoal']` (sem societário/financeiro).

**`clientes_fiscal`/`clientes_pessoal`**: PK+FK `cliente_id uuid references clientes(id)` — 1:1 extensão da tabela `clientes` base. Join com `!inner` filtra só clientes realmente enrolados naquele setor.

**`buscarTodasTarefasDoMes`** (`lib/tarefas-paginacao.ts:10-37`): pagina em blocos de 1000, filtro `.eq('mes',mes).eq('ano',ano).eq('setor',setor)`, sem filtro de `concluida`.

## 6. Erros e Armadilhas Conhecidas

- **Numeração de migration colidindo**: existem DOIS arquivos `019_*.sql` no repo (de branches paralelas mergeadas independentemente) e um `020_*.sql` já ocupado. Próximo número seguro nesta sessão foi `021` — sempre conferir `ls supabase/migrations/` antes de numerar, não confiar em "última migration + 1".
- **Merge de PR não puxa commits futuros da mesma branch**: se eu continuar commitando numa branch depois que a PR já foi mergeada, o merge NÃO inclui esses commits novos. Sempre verificar com `git merge-base --is-ancestor <commit> origin/<branch>` antes de assumir que "a PR já reflete a versão atual".
- **Env vars do Vercel (Preview/Development apontando pra produção)**: pendência conhecida desde o rollout original (2026-07-31), resolvida só em 2026-08-07 depois de causar um bug real (parecia bug de UI, era 404 de tabela inexistente em produção). Se algo "não funciona" depois de mergear e o código bate com o revisado, suspeitar disso primeiro — pedir pro usuário checar o console do navegador.
- **`task-brief` (script do skill subagent-driven-development) vaza notas finais do plano** pra dentro do brief da última task, quando não há "### Task N+1" delimitando o fim — um implementador seguiu a "Nota sobre a PR" do documento e fez push+PR sozinho, fora do escopo formal da task (inofensivo no caso, mas checar isso em planos futuros).
- **Nunca mergear PRs sozinho** — só push + abrir PR, usuário sempre mergeia (regra permanente do projeto).
- **PRs sempre contra `dev`**, nunca `main` diretamente (exceto pedido explícito do usuário, como aconteceu uma vez nesta sessão).

## 7. Próximos Passos

- [ ] Resolver a questão de arquitetura da seção 8 antes de continuar o plano.
- [ ] Escrever o plano de implementação completo pra `feat/tarefa-automatica-parcelamento` (usar skill `superpowers:writing-plans`).
- [ ] Executar o plano (usuário prefere `subagent-driven-development`, usado nas features anteriores).
- [ ] Aplicar `supabase/migrations/021_parcelamento_secoes_catalogo.sql` em **produção** (só foi aplicada em dev até agora).
- [ ] Nova migration pra essa feature: `tarefas.parcelamento_id uuid references parcelamentos(id) on delete cascade` + `parcelamentos.setores text[] not null default '{}'`.

## 8. Informações Pendentes

- **Conflito de arquitetura não resolvido**: a spec aprovada diz que a tarefa de parcelamento deve contar "na % de conclusão da ficha e no dashboard, igual qualquer outra tarefa". Isso empurra pra mesclar os nomes sintéticos direto em `tarefasPersonalizadas` (prop do `TarefaChecklist`) — mas isso quebra o fallback por grupo pra clientes com `tarefas_personalizadas` vazia (ver seção 5/armadilha). A alternativa mais segura (seção separada tipo `EventosAvulsosSecao`, só lendo/escrevendo na tabela `tarefas` de verdade) resolve a contagem do **dashboard** (que já lê `tarefas` direto, sem depender de onde é renderizado), mas NÃO resolve a % de conclusão mostrada no TOPO da própria ficha (`TarefaChecklist` calcula `total`/`concluidas` internamente a partir só de `tipos`, que vem de `tarefasPersonalizadas`/fallback). Precisa decidir: (a) reproduzir a lógica de fallback do grupo ANTES de mesclar (só mescla se a lista já é efetivamente não-vazia), ou (b) aceitar que a % da ficha não conta essas tarefas (só o dashboard conta), ou (c) somar visualmente uma segunda barra de progresso separada pras tarefas de parcelamento. **Precisa perguntar pro usuário ou decidir e confirmar antes de escrever o plano.**
- Contábil tem o checkbox de setor no cadastro mas não gera tarefa nesta entrega (decisão já confirmada, não é pendência).

---

> **Instrução para o próximo chat:** Este arquivo contém o contexto compactado de um chat anterior. Use-o como base para continuar o trabalho. Não peça ao usuário para repetir informações que já estão aqui. Comece confirmando brevemente que entendeu o contexto e pergunte por onde o usuário quer continuar — provavelmente resolver a pendência da seção 8 e depois escrever o plano de implementação da tarefa automática de parcelamento.
