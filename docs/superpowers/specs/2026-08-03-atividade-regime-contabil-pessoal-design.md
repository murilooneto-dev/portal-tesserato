# Atividade e Regime nos setores Contábil e Pessoal

**Data:** 2026-08-03
**Status:** aprovado, aguardando implementação

## Contexto

O setor Fiscal (`clientes_fiscal`) tem dois campos de classificação do cliente que
Contábil e Pessoal não têm com a mesma qualidade:

- **Atividade** — no Fiscal é um `<select>` fixo com 7 opções (combinatória de
  Serviço/Comércio/Indústria). Em Contábil e Pessoal a coluna `atividade` já
  existe no banco, mas a UI é um `<input>` de texto livre.
- **Grupo** — no Fiscal é um `<select>` fixo (Regime Normal / Simples Nacional /
  MEI), rotulado "Grupo" na tela mas representando, na prática, o regime
  tributário do cliente. Contábil e Pessoal não têm nenhuma coluna equivalente.

Pedido: replicar esses dois campos em Contábil e Pessoal. Decisões tomadas em
brainstorming:

- O campo que o usuário chama de "Regime" corresponde ao **Grupo** do Fiscal
  (select fixo Normal/Simples/MEI) — não ao campo literal "Regime" do Fiscal
  (texto livre tipo "Isenta", puramente decorativo). Em Contábil/Pessoal esse
  novo campo será chamado (coluna e label) de **Regime**.
- Atividade também vira `<select>` fixo com as mesmas 7 opções do Fiscal.
- **Sem** replicar o sistema de templates de tarefas por atividade/grupo do
  Fiscal (pré-preenchimento automático de `tarefas_personalizadas`,
  `atividade_templates`, tela de Parâmetros). Atividade e Regime servem só
  para classificação e filtro, igual o campo Responsável já funciona hoje.
- Relatórios (`RelatoriosContabil`/`RelatoriosPessoal`) ficam fora do escopo
  — já filtram por Atividade hoje; filtro de Regime lá não faz parte desta
  entrega.
- O arquivo `components/fiscal/CamposFiscais.tsx` (e o resto do Fiscal) não é
  tocado — zero risco de regressão numa área que já funciona e que não foi
  pedida para mudar. As listas de opções são duplicadas num arquivo novo, não
  extraídas do Fiscal.

## Mudanças

### 1. Banco de dados

Migration nova `supabase/migrations/018_atividade_regime_contabil_pessoal.sql`:

```sql
alter table clientes_contabil add column regime text;
alter table clientes_pessoal  add column regime text;
```

Nullable, sem enum/check — mesmo padrão da coluna `grupo` em `clientes_fiscal`.
`atividade` já existe nas duas tabelas (texto livre desde o início); não
precisa de migration, só muda a UI que a edita.

Como não há acesso ao token do Supabase CLI nesta sessão, a migration precisa
ser rodada manualmente no projeto dev (`fcpcorqquovvgtoukxry`) via SQL editor,
igual aconteceu na sessão anterior (migration 017).

### 2. Tipos (`lib/types.ts`)

Adicionar `regime: string | null` em `ClienteContabil` e `ClientePessoal`.

### 3. Constantes compartilhadas — novo arquivo `lib/atividades-regimes.ts`

```ts
export const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

export const REGIMES = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
]
```

Valores idênticos aos usados hoje em `components/fiscal/CamposFiscais.tsx`
(`ATIVIDADES` e `GRUPOS`), duplicados deliberadamente — ver Contexto.

### 4. Modais de cadastro/edição

`components/contabil/EmpresaContabilModal.tsx` e
`components/pessoal/EmpresaPessoalModal.tsx` (estruturalmente idênticos, mesma
mudança nos dois):

- `FormData`: adicionar `regime: string`.
- `emptyForm`: `regime: ''`.
- `useEffect` de carregar cliente existente: `regime: data.regime ?? ''`.
- Payload de salvar (`contabilPayload`/`pessoalPayload`): adicionar
  `regime: form.regime || null`.
- Campo "Atividade": trocar `<input>` por `<select>` usando `ATIVIDADES` de
  `lib/atividades-regimes.ts`, com opção `"Selecionar..."` (value `""`) no
  topo — mesmo padrão visual do `<select>` de Responsável já existente no
  próprio modal.
  - **Edge case de dado legado:** se `form.atividade` estiver preenchido e
    não bater com nenhuma das 7 opções fixas (cliente antigo com texto
    livre), incluir esse valor como opção extra no topo da lista (antes de
    "Selecionar..."), rotulada `"${valor} (atual)"`, para não apagar/ocultar
    silenciosamente um dado existente.
- Novo campo "Regime": `<select>` com `REGIMES`, mesmo estilo dos outros
  selects do modal (`selectCls`), posicionado ao lado do campo Atividade
  (grid de 2 colunas, mesmo padrão usado para Município/UF e
  Responsável/Prioridade nesses modais).

### 5. Listagens

`components/contabil/ClientesListaContabil.tsx` e
`components/pessoal/ClientesListaPessoal.tsx`:

- Novo filtro persistente `filtroRegime` (`useFiltroPersistente`, chave
  `clientes-contabil:regime` / `clientes-pessoal:regime`), dropdown com
  "Todos" + as 3 opções de `REGIMES` — mesmo padrão do filtro `filtroGrupo`
  em `components/fiscal/ClientesLista.tsx`.
- Badge de Regime na linha do cliente, ao lado do badge de Atividade já
  existente. Cores fixas por valor (reaproveitando as mesmas cores que o
  Fiscal já usa para essas chaves em `CORES_REGIME`):
  - `normal` → `#3b82f6` (azul)
  - `simples` → `#10b981` (verde)
  - `mei` → `#f59e0b` (âmbar)
  - Mostra o label (`Regime Normal`/`Simples Nacional`/`MEI`) via lookup em
    `REGIMES`, não o value cru.

### 6. Página de detalhe do cliente

`app/contabil/clientes/[id]/page.tsx` e `app/pessoal/clientes/[id]/page.tsx`:
adicionar o badge de Regime ao lado do badge de Atividade que já aparece no
cabeçalho (mesmo local dos badges de `cliente.atividade` / `cliente.responsavel`
/ `cliente.municipio` já existentes).

## Fora do escopo

- Templates de tarefas por atividade/grupo (automação do Fiscal) — não
  replicado.
- Filtro de Regime em Relatórios — não incluído.
- Qualquer alteração em `components/fiscal/*` — Fiscal permanece intocado.
- `ClienteGeralModal.tsx` (cadastro consolidado multi-setor) — hoje esse modal
  não seta `atividade` nem `responsavel` para Contábil/Pessoal ao provisionar
  cliente novo (só `tarefas_personalizadas`); esse comportamento não muda
  aqui. Atividade e Regime desses setores continuam sendo preenchidos só
  pelos modais próprios do Contábil/Pessoal.

## Testes manuais (dev, dado que não há suíte automatizada pra UI aqui)

- Criar cliente novo em Contábil com Atividade + Regime preenchidos, salvar,
  reabrir o modal e confirmar que os dois valores persistiram.
- Editar um cliente existente que já tinha `atividade` como texto livre (dado
  legado) e confirmar que o valor aparece como opção extra e não é apagado ao
  salvar sem mexer no campo.
- Confirmar filtro e badge de Regime na listagem de Contábil e de Pessoal.
- Repetir os três pontos acima em Pessoal.
