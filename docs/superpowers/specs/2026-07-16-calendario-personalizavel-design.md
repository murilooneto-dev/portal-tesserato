# Peça A — Calendário personalizável por setor

**Data:** 2026-07-16
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

O Calendário hoje existe só pro Fiscal (`components/fiscal/CalendarioFiscal.tsx`), como uma lista hard-coded de 9 obrigações fixas (`OBRIGACOES`: SIGET, SPEED GOV, EFD-Reinf, DAS/PGDAS-D, ISS, ICMS/ICMS-ST, PIS/COFINS, DCTFWeb, EFD-Contribuições), cada uma com nome, dia do mês, cor (hex fixa) e descrição. O cálculo de "dias faltando" (`alertaColor`/`alertaLabel`) não vive nesse componente — está hard-coded no Dashboard do Fiscal (`app/fiscal/dashboard/page.tsx`), duplicando as mesmas 9 obrigações num array separado (`OBRIGACOES_CAL`).

Com o Contábil (e futuramente Pessoal/Societário/Financeiro) ganhando seus próprios setores operacionais, essa abordagem hard-coded não escala: cada setor novo precisaria duplicar o componente e o array. Esta parte transforma o Calendário num sistema real, com eventos cadastrados pelo Admin no banco, compartilhando um único componente entre setores — a única exceção documentada à regra "cada setor tem seus próprios componentes de UI", porque a lógica de exibição (dias faltando, cores por urgência) é idêntica entre setores; só os dados mudam.

## Objetivo

1. Tabela `calendario_eventos`: eventos de calendário por setor, cadastrados pelo Admin, com dois tipos — recorrente mensal (dia fixo do mês) ou data única (evento pontual).
2. Cor do card derivada automaticamente da quantidade de dias restantes até a próxima ocorrência — não é mais um campo manual.
3. Componente genérico `CalendarioSetor`, usado em `/fiscal/calendario` e `/contabil/calendario`.
4. CRUD completo pelo Admin (criar, editar, excluir); demais usuários só visualizam.
5. Migração das 9 obrigações fiscais atuais para registros reais na tabela nova, sem perda de dados.

## Fora de escopo

- Peças B (Dashboard do Contábil) e C (Relatórios + Histórico do Contábil) — planos separados, não tocam o Calendário.
- Migrar o cálculo de "dias faltando" que aparece no Dashboard do Fiscal para consumir a tabela nova — o Dashboard continua com seu array próprio por enquanto; só o Calendário em si migra nesta parte. (Reavaliar quando a Peça B for desenhada.)
- Notificações, lembretes ou qualquer envio automático quando um evento fica vermelho/vencido.
- Categorias, tags, anexos ou qualquer campo além de título/descrição/tipo de data — YAGNI até haver necessidade real.
- Pessoal/Societário/Financeiro — sem tarefas definidas ainda; usarão o mesmo `CalendarioSetor` quando existirem, sem trabalho adicional aqui.

## Design

### 1. Modelo de dados (migration `008_calendario_eventos.sql`)

```sql
create table calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  titulo text not null,
  descricao text,
  tipo_data text not null check (tipo_data in ('recorrente', 'unica')),
  dia_mes int check (dia_mes between 1 and 31),
  data date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint tipo_data_consistente check (
    (tipo_data = 'recorrente' and dia_mes is not null and data is null) or
    (tipo_data = 'unica' and data is not null and dia_mes is null)
  )
);

create index idx_calendario_eventos_setor on calendario_eventos(setor);

alter table calendario_eventos enable row level security;

create policy "setor le seus eventos" on calendario_eventos
  for select using (setor = any(select unnest(setores) from perfis where id = auth.uid()) or (select role from perfis where id = auth.uid()) = 'admin');

create policy "admin gerencia eventos" on calendario_eventos
  for all using ((select role from perfis where id = auth.uid()) = 'admin')
  with check ((select role from perfis where id = auth.uid()) = 'admin');
```

(RLS segue o mesmo padrão já usado em `tarefa_tipos` — ajustar nomes exatos de tabela/coluna de perfil/role durante a implementação, consultando o schema real.)

Obrigações "último dia do mês" (caso da EFD-Contribuições) usam `dia_mes = 31`; a função de próxima ocorrência (seção 2) normaliza automaticamente para o último dia real de meses mais curtos.

### 2. Lógica de cálculo (`lib/calendario.ts`, novo, compartilhado)

- `proximaOcorrencia(evento, hoje)`:
  - `recorrente`: se `hoje.dia <= dia_mes` (normalizado pro mês corrente), retorna a data desse dia neste mês; senão, retorna o dia normalizado do mês seguinte. Nunca fica no passado — sempre rola pra frente.
  - `unica`: retorna `evento.data` diretamente, mesmo que já tenha passado (fica negativo).
- `diasRestantes(dataAlvo, hoje)`: diferença em dias, pode ser negativo só para eventos únicos vencidos.
- `alertaColor(dias)` / `alertaLabel(dias)`: migram do Dashboard do Fiscal pra este arquivo compartilhado, com a régua nova:
  - **Vermelho**: `dias <= 1` (inclui vencido e "vence hoje/amanhã")
  - **Laranja**: `2 <= dias <= 5`
  - **Azul**: `6 <= dias <= 10`
  - **Neutro** (sem alerta): `dias > 10`
  - Evento único vencido exibe rótulo "Vencido há Nd" em vez de "Nd restantes", mas usa a mesma cor vermelha.

### 3. Componente genérico (`components/calendario/CalendarioSetor.tsx`, novo)

- Recebe `setor` como prop. Busca `calendario_eventos where setor = :setor`, calcula `proximaOcorrencia`/`diasRestantes`/cor pra cada um, ordena por `diasRestantes` crescente (mais urgente primeiro).
- Renderiza cards com título, descrição, rótulo de dias, borda/fundo colorido conforme a régua.
- Se `role === 'admin'`: mostra botão "+ Novo evento" e, em cada card, ações de editar/excluir. Outros usuários veem só os cards, sem nenhuma ação.
- Único componente do projeto compartilhado entre setores — decisão explícita, documentada aqui e no histórico do projeto.

### 4. Modal de administração (`components/calendario/CalendarioEventoModal.tsx`, novo)

- Formulário: `título` (obrigatório), `descrição` (opcional), toggle `tipo_data` ("Recorrente mensal" / "Data única") que troca o campo condicional entre seletor de dia do mês (1–31) e seletor de data.
- Usado tanto para criar quanto editar (mesmo padrão dos outros modais do projeto). Exclusão é uma ação direta com confirmação, sem modal próprio.
- Server actions em `app/calendario/actions.ts` (novo, compartilhado — não é por setor, já que a tabela e o componente também não são): `criarEvento`, `atualizarEvento`, `excluirEvento`, todas checando `role === 'admin'` no servidor antes de escrever (RLS já bloqueia no banco, mas a action retorna erro amigável antes de tentar).

### 5. Rotas e navegação

- `app/fiscal/calendario/page.tsx`: passa a renderizar só `<CalendarioSetor setor="fiscal" />`. `components/fiscal/CalendarioFiscal.tsx` é removido.
- `app/contabil/calendario/page.tsx` (novo): `<CalendarioSetor setor="contabil" />`.
- Sidebar de cada setor já tem (ou ganha, no caso do Contábil) o item "Calendário" apontando pra rota correspondente — sem mudança estrutural na sidebar em si.

### 6. Seed das 9 obrigações fiscais

A migration `008_calendario_eventos.sql` inclui os `insert` das 9 obrigações atuais, todas `setor = 'fiscal'`, `tipo_data = 'recorrente'`:

| Título | dia_mes |
|---|---|
| SIGET | 5 |
| SPEED GOV | 10 |
| EFD-Reinf | 15 |
| DAS/PGDAS-D | 15 |
| ISS | 15 |
| ICMS/ICMS-ST | 15 |
| PIS/COFINS | 20 |
| DCTFWeb | 20 |
| EFD-Contribuições | 31 (normaliza pro último dia real do mês) |

A cor hex antiga de cada uma é descartada — cor agora é 100% derivada de `diasRestantes`.

## Critério de sucesso

- `/fiscal/calendario` mostra os 9 eventos migrados, com cor/dias corretos, idêntico em conteúdo ao que existia antes (só sem cor manual).
- `/contabil/calendario` existe e funciona vazio (ou com eventos que o Admin cadastrar), usando o mesmo componente.
- Admin consegue criar, editar e excluir eventos em qualquer setor; usuário não-admin não vê nenhuma ação de escrita e não consegue escrever via RLS mesmo tentando direto.
- Evento recorrente cujo dia já passou neste mês aparece com a data do próximo mês, nunca vencido.
- Evento único cuja data já passou continua aparecendo, vermelho, com "Vencido há Nd", até o Admin excluir.
