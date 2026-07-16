# Parte 3b — Dashboard do Contábil

**Data:** 2026-07-16
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

`/contabil` hoje é só um placeholder "Em construção" na Sidebar. O Dashboard do Fiscal (`app/fiscal/dashboard/page.tsx`) já existe e funciona: progresso geral de tarefas, contagem de clientes, progresso por responsável, e uma lista de clientes com observações — além de uma seção de Alertas de prazos hard-coded (`OBRIGACOES_CAL`).

A Peça A (já implementada) criou o Calendário real (`calendario_eventos`, com `lib/calendario.ts` calculando próxima ocorrência/dias restantes/cor de urgência). Isso muda o que a seção de Alertas do Dashboard do Contábil deve consumir: em vez de replicar um array hard-coded (como o Fiscal ainda faz, por estar fora de escopo desta parte), o Dashboard do Contábil lê os eventos reais de `calendario_eventos` do setor `contabil`.

Pedido do usuário: replicar o comportamento do Dashboard do Fiscal, adaptado pros dados do Contábil, sem inventar recursos novos.

## Objetivo

1. `app/contabil/dashboard/page.tsx` (novo): Dashboard do Contábil com as mesmas 5 seções do Fiscal (Alertas, Progresso Geral, Total de Clientes, Progresso por Responsável, Clientes com Observações), adaptadas aos dados do Contábil.
2. Sidebar do Contábil: item "Em construção" (que hoje aponta pra `/contabil`) vira "Dashboard" apontando pra `/contabil/dashboard`.

## Fora de escopo

- Migrar a seção de Alertas do Dashboard do **Fiscal** para consumir `calendario_eventos` — o Fiscal continua com seu array hard-coded `OBRIGACOES_CAL` por enquanto. Só o Dashboard do Contábil (novo) usa a tabela real, por não ter nenhum código legado a migrar.
- Peça C (Relatórios + Histórico do Contábil) — plano separado.
- Qualquer novo tipo de card, gráfico ou métrica que não exista no Dashboard do Fiscal — YAGNI, é um espelho, não uma reformulação.

## Design

### 1. Seção Alertas

Busca `calendario_eventos where setor = 'contabil'`, calcula `proximaOcorrencia`/`diasRestantes` (`lib/calendario.ts`, Peça A) pra cada evento, filtra `dias <= 10` (mesmo corte do Fiscal: `alertas.filter(a => a.diff >= 0 && a.diff <= 10)` — eventos únicos vencidos, com `dias < 0`, não entram nessa seção, mesma regra do Fiscal atual), ordena por `dias` crescente. Renderiza os mesmos "pills" coloridos do Fiscal (`alertaColor`/`alertaLabel` de `lib/calendario.ts`, já compatível em formato de classe Tailwind com o que o Dashboard do Fiscal usa localmente). Seção fica ausente (sem `<section>` renderizada) se não houver eventos dentro da janela — mesmo comportamento condicional do Fiscal (`{alertas.length > 0 && (...)}`).

### 2. Seção Progresso Geral

Idêntica em lógica ao Fiscal: busca clientes do Contábil (`SELECT_CLIENTE_CONTABIL` + `flattenClienteContabil`, de `lib/clientes-contabil.ts`) e tarefas do mês (`buscarTodasTarefasDoMes(supabase, mes, ano, 'cliente_id, concluida, tipo', 'contabil')`), calcula `totalTarefas` (soma de `tarefas_personalizadas.length` por cliente) e `concluidasTarefas` (tarefas com `concluida=true` cujo `tipo` está no conjunto de tarefas personalizadas daquele cliente), `pct = concluidas/total`. Mesmo card visual (barra de progresso + "X/Y tarefas concluídas").

### 3. Seção Total de Clientes

Só o número total (`cs.length`), sem quebra por grupo — decisão do usuário: Contábil não tem o conceito de grupo (Normal/Simples/MEI), que é exclusivo do Fiscal. Sem sub-blocos "Normal/Simples/MEI" nesse card.

### 4. Seção Progresso por Responsável

Idêntica ao Fiscal: para cada `responsavel` distinto em `clientes_contabil.responsavel`, busca o `profile` correspondente (`profiles.nome` case-insensitive) pra pegar a cor do avatar, calcula progresso (tarefas concluídas / total) só dos clientes daquele responsável, mesmo card visual (avatar colorido + nome + % + barra + "X/Y · N clientes").

### 5. Seção Clientes com Observações

Lista clientes onde `clientes_contabil.obs` não é vazio, cada linha linkando pra `/contabil/clientes/[id]` (rota já existe, da Parte 3a) — mesmo formato de card clicável do Fiscal (que linka pra `/fiscal/clientes/[id]`).

### 6. Sidebar

Em `components/fiscal/Sidebar.tsx`, `ITENS_POR_SETOR.contabil`, o item atual:

```ts
{ href: '/contabil', label: 'Em construção', icon: Wrench },
```

vira:

```ts
{ href: '/contabil/dashboard', label: 'Dashboard', icon: LayoutGrid },
```

(`LayoutGrid` já está importado no topo do arquivo — usado pelo item equivalente do Fiscal.) A rota `/contabil` (placeholder atual) deixa de ser referenciada pela Sidebar, mas o arquivo/página em si não precisa ser removido nesta parte — fora de escopo tocar nela além da referência da Sidebar.

## Critério de sucesso

- `/contabil/dashboard` renderiza as 5 seções com dados reais do Contábil, sem nenhum dado do Fiscal vazando.
- Seção Alertas aparece vazia (ausente) se não houver eventos do Contábil em `calendario_eventos` dentro de 10 dias — não quebra, não mostra erro.
- Card "Total de Clientes" mostra só o número total, sem quebra por grupo.
- Sidebar do Contábil mostra "Dashboard" (não mais "Em construção") apontando pra `/contabil/dashboard`.
- Nenhuma tela do Fiscal muda de comportamento.
