# Observação do Cliente + Tipo de Resposta de Tarefa (DATA/TEXTO)

**Data:** 2026-07-17
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

Duas lacunas identificadas pelo usuário depois de o setor Pessoal ficar pronto:

1. Contábil e Pessoal não têm campo de observação editável por cliente — a coluna `obs` já existe em `clientes_contabil`/`clientes_pessoal` (criada junto com o resto do schema de cada setor) e já é lida pelo Dashboard ("Clientes com Observações"), mas nunca foi exposta em nenhum modal de edição.
2. Toda tarefa do catálogo (`tarefa_tipos`) hoje só aceita uma data como resposta. O usuário quer que algumas tarefas aceitem uma resposta em texto e/ou anexo de arquivo (print, foto, documento) em vez de data.

Uma terceira frente foi identificada durante o brainstorming — trazer o Fiscal para o mesmo padrão de catálogo (`tarefa_tipos`) que Contábil/Pessoal já têm — e foi deliberadamente **decomposta para fora deste spec**: o Fiscal é o único setor com dados reais em produção, e migrar seu modelo de dados merece um brainstorming e plano próprios, com atenção redobrada a não quebrar nada na sincronização com o banco real. Este spec cobre só Contábil e Pessoal.

## Objetivo

**Frente A — Observação do cliente:**
Campo de texto livre, opcional, um por cliente (não por mês/competência), editável no modal de criar/editar empresa do Contábil e do Pessoal.

**Frente B — Tipo de resposta de tarefa:**
Cada tipo de tarefa do catálogo (`tarefa_tipos`, Contábil e Pessoal) ganha um `tipo_resposta`: `'data'` (comportamento atual, default — nenhuma tarefa existente muda) ou `'texto'` (a tarefa é respondida escrevendo um texto e/ou anexando um ou mais arquivos; qualquer um dos dois já marca a tarefa como concluída; apagar/remover tudo desmarca). Tarefas com etapas continuam sempre DATA — `tipo_resposta = 'texto'` só se aplica a tarefas simples, sem etapas. Tarefas personalizadas por cliente (`tarefas_personalizadas`, texto livre digitado no modal, fora do catálogo) continuam sempre DATA, sem mudança.

## Fora de escopo

- Migrar o Fiscal para usar `tarefa_tipos` — projeto próprio, spec e plano separados, tratado com cuidado adicional por envolver dados reais de produção.
- Tela de admin para gerenciar o catálogo `tarefa_tipos` pela interface — decisão explícita do usuário: continua sendo gerenciado via migration SQL (mesmo padrão já usado para `etapas`/`meses_visiveis`), sem CRUD visual.
- Marcar qualquer tarefa existente do catálogo como `'texto'` — esta spec entrega só a capacidade; qual tarefa específica vira TEXTO é decisão de negócio, feita depois via migration pontual quando o usuário pedir.
- Observação por mês/competência (como o Fiscal tem com `observacoes_clientes`) — decisão explícita: a observação do Contábil/Pessoal é um texto único por cliente, sem dimensão de tempo.
- Selo/indicador de observação na listagem de clientes — só modal + Dashboard (que já existe), sem mudança na lista.
- Tipo de resposta por etapa individual (uma tarefa com sub-checklist ter etapas mistas DATA/TEXTO) — decisão explícita: mutuamente exclusivo, tarefa com etapas é sempre DATA em cada etapa.
- Múltiplas versões/edição do texto de uma resposta TEXTO — o campo é uma textarea simples, sobrescrita a cada salvamento, sem histórico de versões.

## Design

### Frente A — Observação do cliente

Nenhuma migration necessária. Em `components/contabil/EmpresaContabilModal.tsx` e `components/pessoal/EmpresaPessoalModal.tsx`:
- Novo campo `obs` no `FormData` da UI, populado a partir de `data.obs` no `useEffect` de carregamento (modo edição) e incluído em `contabilPayload`/`pessoalPayload` no `handleSave` (`insert`/`update` de `clientes_contabil`/`clientes_pessoal`).
- Renderizado como `<textarea>` (mesmo estilo visual dos demais campos do modal), rótulo "Observação", opcional, sem validação de tamanho.
- Sem mudança em nenhuma outra tela — o Dashboard já lê `c.obs` e passa a mostrar dado real assim que preenchido.

### Frente B — Tipo de resposta de tarefa

#### 1. Modelo de dados (migration `011_tipo_resposta_tarefa.sql`)

```sql
alter table tarefa_tipos add column tipo_resposta text not null default 'data'
  check (tipo_resposta in ('data', 'texto'));

alter table tarefas add column resposta_texto text;

create table tarefa_arquivos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid references tarefas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index idx_tarefa_arquivos_tarefa_id on tarefa_arquivos (tarefa_id);

alter table tarefa_arquivos enable row level security;

create policy "Setor le arquivos de suas tarefas" on tarefa_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas t join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de suas tarefas" on tarefa_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas t join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);
```

Todo catálogo existente recebe `tipo_resposta = 'data'` pelo default — nenhuma tarefa muda de comportamento. `tarefa_arquivos` segue exatamente o padrão de `tarefa_etapas` (RLS via join com `tarefas`+`profiles.setores`) e o mesmo modelo de armazenamento do `client_files` do Fiscal (base64 direto na tabela, sem Supabase Storage), mesmo limite de 10MB por arquivo.

Tipos de arquivo aceitos: PDF, PNG, JPG/JPEG, XLS/XLSX, DOCX (mesma lista de validação do `client_files`, mais DOCX).

#### 2. Renderização na checklist (`TarefaChecklistContabil.tsx`/`TarefaChecklistPessoal.tsx`)

`tarefaTipos` passa a carregar `tipoResposta: 'data' | 'texto'` além de `etapas`/`mesesVisiveis`. Quando `tipoResposta === 'texto'` (só ocorre em tarefas sem etapas, por construção da migration/seed futura), a célula da tarefa substitui o input de data por:
- `<textarea>` pequena, auto-salva no `onBlur` (mesmo padrão de debounce-on-blur já usado pelos inputs de data).
- Botão "+ Anexar" + lista de arquivos já anexados (nome, tamanho formatado, botão de excluir), mesmo padrão visual do `ClienteArquivos.tsx` do Fiscal.
- Tarefa fica **concluída** automaticamente assim que `resposta_texto` for não-vazio **ou** existir ao menos 1 registro em `tarefa_arquivos`; volta a **pendente** se ambos ficarem vazios.

#### 3. Server actions (uma versão por setor, mesmo padrão de `toggleTarefaContabil`/`atualizarEtapa`)

Em `app/contabil/clientes/actions.ts` e `app/pessoal/clientes/actions.ts`, três funções novas em cada:
- `salvarRespostaTexto(clienteId, tipo, mes, ano, texto)` — acha/cria a linha de `tarefas` (mesmo padrão de `atualizarEtapa`), grava `resposta_texto`, recalcula `concluida`/`concluida_em` (texto não-vazio OU existe arquivo).
- `uploadArquivoTarefa(tarefaId, formData)` — mesma validação de tipo/tamanho do `uploadArquivo` do Fiscal, insere em `tarefa_arquivos`, recalcula `concluida` da tarefa pai.
- `excluirArquivoTarefa(arquivoId)` — apaga o arquivo, recalcula `concluida` da tarefa pai.

Todas checam `podeEditarClienteContabil`/`podeEditarClientePessoal` antes de agir (mesmo padrão das funções existentes) e usam `getAuthenticatedAdmin()` para bypass de RLS na escrita, igual `toggleTarefaContabil`.

#### 4. Páginas de detalhe

`app/contabil/clientes/[id]/page.tsx` e `app/pessoal/clientes/[id]/page.tsx` passam a:
- Buscar `tarefa_tipos.tipo_resposta` junto com `nome`/`etapas`/`meses_visiveis` (já buscados hoje).
- Buscar `tarefa_arquivos` das tarefas do mês (mesmo padrão de busca de `tarefa_etapas` via `.in('tarefa_id', tarefaIds)`).
- Passar `salvarRespostaTexto`/`uploadArquivoTarefa`/`excluirArquivoTarefa` como closures `'use server'` pro checklist, mesmo padrão de `onToggleSimples`/`onAtualizarEtapa` hoje.

## Critério de sucesso

- Admin edita um cliente do Contábil ou do Pessoal, escreve uma observação, salva — reabre o modal e o texto continua lá; o Dashboard do setor mostra o cliente na seção "Clientes com Observações".
- Uma tarefa do catálogo marcada como `tipo_resposta = 'texto'` (via migration futura, fora deste spec) aparece na checklist do cliente como caixa de texto + anexo, em vez de campo de data.
- Escrever um texto na tarefa TEXTO marca ela como concluída; apagar o texto (sem nenhum arquivo anexado) desmarca.
- Anexar um arquivo na tarefa TEXTO (sem nenhum texto) também marca ela como concluída; excluir o último arquivo (sem texto) desmarca.
- Uma tarefa TEXTO aceita múltiplos arquivos anexados simultaneamente, cada um exclusível individualmente.
- Nenhuma tarefa existente do catálogo (Contábil/Pessoal) muda de comportamento — todas continuam DATA por default.
- Nenhuma tela do Fiscal é tocada nesta spec.
