# Vínculos de Tarefas entre Setores

**Data:** 2026-07-16
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

Já mencionado como escopo futuro na spec de 2026-07-14 (fundação do motor de tarefas): *"O objetivo final é um motor de dependência entre tarefas de setores diferentes com alertas — mas isso exige que qualquer setor consiga ter suas próprias tarefas primeiro."* Fiscal e Contábil agora têm sistemas de tarefas reais e independentes (Partes 1-3c já implementadas), então essa fundação está pronta.

Pedido do usuário: quando uma tarefa X de um setor é concluída pra um cliente, uma tarefa Y de outro setor (do mesmo cliente) deve mostrar um aviso — não bloqueante — indicando se está "aguardando" a origem ou "liberada" por ela.

Assimetria técnica relevante: o Fiscal não tem catálogo de tipos de tarefa (`tarefa_tipos`) — nomes de tarefa são texto livre, customizável por cliente via `tarefas_personalizadas`. Só o Contábil tem esse catálogo (com suporte a etapas nomeadas). O vínculo precisa funcionar com texto livre dos dois lados, sem exigir que o Fiscal ganhe um catálogo que nunca teve.

## Objetivo

1. Catálogo administrável de vínculos possíveis (`tarefa_vinculos`): par (setor + tipo de tarefa origem) → (setor + tipo de tarefa destino).
2. Cada cliente escolhe, individualmente, quais vínculos do catálogo se aplicam a ele (não é automático por só ter as duas tarefas atribuídas).
3. Nas checklists de tarefa do Fiscal e do Contábil, toda tarefa que é destino de um vínculo ativo daquele cliente mostra um selo: "Aguardando [Setor Origem]" (origem não concluída) ou "Liberada por [Setor Origem]" (origem concluída). Nunca bloqueia a tarefa — sempre pode ser marcada.
4. Tela de administração do catálogo em rota comum (`/vinculos`), só Admin.

## Fora de escopo

- Bloquear a tarefa destino até a origem ser concluída — decisão explícita do usuário, descartada em favor de só aviso.
- Vínculos automáticos (aplicados a todo cliente que tenha as duas tarefas, sem escolha explícita) — decisão explícita do usuário: é sempre opt-in por cliente.
- Notificações/alertas fora da própria tela de checklist (e-mail, push, etc.) — só o selo visual na tarefa, por enquanto.
- Vínculos entre mais de dois setores numa cadeia (X → Y → Z) — o catálogo suporta pares simples; encadeamentos ficam pra um pedido futuro, se necessário.
- Pessoal, Societário, Financeiro — sem sistema de tarefas ainda; o mecanismo é genérico e já funciona pra eles quando existirem, sem trabalho adicional aqui.

## Design

### 1. Modelo de dados

**`tarefa_vinculos`** (catálogo administrável, novo):

```sql
create table tarefa_vinculos (
  id             uuid primary key default gen_random_uuid(),
  setor_origem   user_setor not null,
  tipo_origem    text not null,
  setor_destino  user_setor not null,
  tipo_destino   text not null,
  created_at     timestamptz not null default now()
);
```

RLS: todo autenticado lê (`auth.uid() is not null`); só Admin gerencia (`is_admin()`) — mesmo padrão de `tarefa_tipos`.

**`clientes.tarefas_vinculadas_ativas`** (coluna nova, `uuid[] not null default '{}'`): os IDs de `tarefa_vinculos` ativos *para aquele cliente específico*. Array vazio = cliente não tem tarefas vinculadas. Referencia `tarefa_vinculos(id)` — sem FK array-level no Postgres, validação de que os IDs existem fica na aplicação (mesmo padrão informal que `tarefas_personalizadas` já usa pra nomes de tarefa, que também não tem integridade referencial forte).

### 2. Tela de administração do catálogo (`/vinculos`, rota comum, só Admin)

Nova página fora do prefixo de qualquer setor (mesmo grupo de rotas de `/intranet`, `/ferramentas`). Redireciona não-admin, mesmo padrão de `/fiscal/parametros`. Lista os vínculos cadastrados (Origem: setor + tipo → Destino: setor + tipo) com opção de excluir. Formulário "Novo vínculo": dois blocos (Origem, Destino), cada um com select de setor (5 opções do enum `user_setor`) e select de tipo — o select de tipo é populado dinamicamente com os nomes de tarefa distintos já em uso naquele setor (união de `tarefas_personalizadas` de todos os clientes do setor + nomes de `tarefa_tipos` pro Contábil), evitando erro de digitação que quebraria o cruzamento com `tarefas.tipo`.

Item "Vínculos" na Sidebar, seção Comum, só visível pra Admin (mesmo padrão dos itens "Parâmetros"/"Admin" hoje, que já são gated por `profile.role === 'admin'`).

### 3. Configuração por cliente (`components/geral/ClienteGeralModal.tsx`)

Novo bloco "Tarefas Vinculadas": toggle "Este cliente possui tarefas vinculadas entre setores?". Se marcado, mostra checkboxes dos vínculos do catálogo cujos `setor_origem` E `setor_destino` estão ambos em `cliente.setores` (não oferece um vínculo Fiscal→Contábil pra um cliente que só está no Fiscal). Se desmarcado, `tarefas_vinculadas_ativas` vira `[]`. Escrita direta via Supabase client (mesmo padrão do resto do modal), sem server action nova.

### 4. Exibição nas checklists (`components/fiscal/TarefaChecklist.tsx` e `components/contabil/TarefaChecklistContabil.tsx`)

Cada checklist, ao carregar as tarefas do cliente, também busca (quando `cliente.tarefas_vinculadas_ativas.length > 0`): os vínculos ativos daquele cliente cujo `setor_destino` é o setor da checklist atual, e as tarefas de origem correspondentes (`tarefas` onde `cliente_id` = cliente atual, `setor` = `setor_origem`, `tipo` = `tipo_origem`, mesmo `mes`/`ano` da checklist). Pra cada tarefa da checklist que é `tipo_destino` de um desses vínculos, renderiza um selo ao lado do nome:
- Laranja "⏳ Aguardando {SETOR_LABEL[setor_origem]}" se a tarefa de origem não existe ou `concluida = false`.
- Verde "✓ Liberada por {SETOR_LABEL[setor_origem]}" se `concluida = true`.

O selo é só informativo — a tarefa destino continua clicável/marcável normalmente, com ou sem selo, em qualquer estado.

### 5. Lógica de avaliação

Pura leitura, sem estado armazenado, recalculada a cada carregamento da checklist — funciona igual pra meses passados, sem lógica especial de histórico. Fluxo: `cliente.tarefas_vinculadas_ativas` → join com `tarefa_vinculos` (filtra pelos IDs ativos e por `setor_destino` = setor da checklist) → pra cada resultado, consulta `tarefas` da origem (mesmo cliente, mesmo mês/ano) → deriva o selo.

## Critério de sucesso

- Admin cria um vínculo no catálogo (`/vinculos`), ex: "Fechamento" (Fiscal) → "Movimentação" (Contábil).
- Admin marca esse vínculo como ativo pra um cliente específico que está nos dois setores (via `ClienteGeralModal`).
- Na checklist do Contábil desse cliente, "Movimentação" mostra "⏳ Aguardando Fiscal" enquanto "Fechamento" não estiver concluído no Fiscal do mesmo cliente/mês.
- Ao marcar "Fechamento" como concluído no Fiscal, a checklist do Contábil (ao recarregar) mostra "✓ Liberada por Fiscal" em "Movimentação" — sem nunca ter bloqueado o clique.
- Um cliente sem vínculos ativos (`tarefas_vinculadas_ativas = []`) não mostra nenhum selo, comportamento idêntico a antes desta feature.
- Nenhuma tela existente (Dashboard, Relatórios, Histórico, Calendário) muda de comportamento.
