# Abrir/baixar arquivos anexados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar no nome de um arquivo anexado (em `tarefa_arquivos` — tarefas tipo TEXTO nos 3 setores — ou em `client_files` — planilhas DTE do Fiscal) abre numa nova aba: PDF/PNG/JPG aparecem direto, XLS/XLSX/DOCX/CSV o navegador baixa sozinho.

**Architecture:** Uma rota GET nova, `app/api/arquivos/[tabela]/[id]/route.ts`, compartilhada pelos dois mecanismos (`tabela` = `'tarefa'` ou `'client'`), busca só `content_base64` da linha pedida (nunca em lista) usando o client de sessão normal — a RLS de cada tabela já decide quem pode ler. Responde o binário decodificado com `Content-Type` inferido pela extensão e `Content-Disposition: inline`, que cobre visualização e download num único clique sem lógica condicional. 4 pontos de UI (3 checklists de tarefa + a lista de planilhas do Fiscal) trocam o nome estático do arquivo por um link pra essa rota — nada mais muda.

**Tech Stack:** Next.js 16 (App Router, Route Handlers — Web Request/Response API, `params` é `Promise`), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Não migra `client_files`/`tarefa_arquivos` pra Supabase Storage — continuam como base64 na própria linha do banco.
- Sem botão de "forçar download" separado — um clique só resolve abrir e baixar (decisão do usuário).
- A rota busca `content_base64` só da linha individual pedida (`select(...).eq('id', id).single()`), nunca em lista — preserva a otimização de perf de uma revisão anterior que excluiu essa coluna de toda consulta em lista.
- Usa o client de sessão normal (`createClient()` de `lib/supabase/server.ts`), não o service role — a RLS de cada tabela já faz o controle de acesso certo (`tarefa_arquivos`: só quem tem o setor da tarefa nos `profiles.setores`; `client_files`: qualquer autenticado, comportamento preexistente que não é escopo apertar).
- Nenhuma mudança na lógica de upload, exclusão, ou nos formulários de anexo já existentes — só o nome do arquivo vira link.
- `params` em Route Handlers desta versão do Next é `Promise<{...}>` — sempre `await params`.

---

### Task 1: Rota `app/api/arquivos/[tabela]/[id]/route.ts`

**Files:**
- Create: `app/api/arquivos/[tabela]/[id]/route.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server` (já existe, client de sessão que respeita RLS).
- Produces: rota `GET /api/arquivos/{tarefa|client}/{id}` — usada pelas Tasks 2-5 como `href` de um `<a>`.

- [ ] **Step 1: Criar o arquivo**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TABELAS: Record<string, string> = {
  tarefa: 'tarefa_arquivos',
  client: 'client_files',
}

function tipoContent(nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'csv': return 'text/csv'
    default: return 'application/octet-stream'
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tabela: string; id: string }> },
) {
  const { tabela, id } = await params
  const nomeTabela = TABELAS[tabela]
  if (!nomeTabela) {
    return NextResponse.json({ error: 'Tabela inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: arquivo } = await supabase
    .from(nomeTabela)
    .select('name, content_base64')
    .eq('id', id)
    .single()

  if (!arquivo) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const nome = arquivo.name as string
  const buffer = Buffer.from(arquivo.content_base64 as string, 'base64')
  const nomeAscii = nome.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': tipoContent(nome),
      'Content-Disposition': `inline; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `app/api/arquivos/[tabela]/[id]/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/arquivos/\[tabela\]/\[id\]/route.ts
git commit -m "feat: rota para servir bytes de arquivos anexados (tarefa_arquivos e client_files)"
```

---

### Task 2: Link no checklist do Contábil

**Files:**
- Modify: `components/contabil/TarefaChecklistContabil.tsx`

**Interfaces:**
- Consumes: rota `/api/arquivos/tarefa/{id}` (Task 1).

- [ ] **Step 1: Trocar o nome estático por um link**

Substituir (linhas 302-310):

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        📎 {arq.name} · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          📎 {arq.name}
                        </a>
                        · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/contabil/TarefaChecklistContabil.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/contabil/TarefaChecklistContabil.tsx
git commit -m "feat: anexo de tarefa do Contabil abre/baixa ao clicar no nome"
```

---

### Task 3: Link no checklist do Pessoal

**Files:**
- Modify: `components/pessoal/TarefaChecklistPessoal.tsx`

**Interfaces:**
- Consumes: rota `/api/arquivos/tarefa/{id}` (Task 1).

Este arquivo é estruturalmente idêntico ao do Contábil neste trecho. Repetir o mesmo passo da Task 2.

- [ ] **Step 1: Trocar o nome estático por um link**

Substituir (linhas 306-314):

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        📎 {arq.name} · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          📎 {arq.name}
                        </a>
                        · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/pessoal/TarefaChecklistPessoal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/pessoal/TarefaChecklistPessoal.tsx
git commit -m "feat: anexo de tarefa do Pessoal abre/baixa ao clicar no nome"
```

---

### Task 4: Link no checklist do Fiscal

**Files:**
- Modify: `components/fiscal/TarefaChecklist.tsx`

**Interfaces:**
- Consumes: rota `/api/arquivos/tarefa/{id}` (Task 1).

Mesmo trecho, mesma estrutura dos outros dois setores.

- [ ] **Step 1: Trocar o nome estático por um link**

Substituir (linhas 442-450):

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        📎 {arq.name} · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

```tsx
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          📎 {arq.name}
                        </a>
                        · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/fiscal/TarefaChecklist.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/fiscal/TarefaChecklist.tsx
git commit -m "feat: anexo de tarefa do Fiscal abre/baixa ao clicar no nome"
```

---

### Task 5: Link nas planilhas DTE do Fiscal (`client_files`)

**Files:**
- Modify: `components/fiscal/ClienteArquivos.tsx`

**Interfaces:**
- Consumes: rota `/api/arquivos/client/{id}` (Task 1) — note o segmento `client`, diferente das Tasks 2-4 (`tarefa`).

- [ ] **Step 1: Trocar o nome estático por um link**

Substituir (linhas 104-110):

```tsx
              <span className="text-green-400 text-lg flex-shrink-0">📊</span>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm truncate">{arq.name}</p>
                <p className="text-[var(--fg)]/30 text-xs">
                  {formatBytes(arq.size)} · {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
```

```tsx
              <span className="text-green-400 text-lg flex-shrink-0">📊</span>
              <div className="flex-1 min-w-0">
                <a href={`/api/arquivos/client/${arq.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-[var(--fg)] text-sm truncate block hover:underline">
                  {arq.name}
                </a>
                <p className="text-[var(--fg)]/30 text-xs">
                  {formatBytes(arq.size)} · {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/fiscal/ClienteArquivos.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/fiscal/ClienteArquivos.tsx
git commit -m "feat: planilha DTE do Fiscal abre/baixa ao clicar no nome"
```

---

### Task 6: Verificação final ponta a ponta

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, incluindo a rota nova `/api/arquivos/[tabela]/[id]` na listagem de rotas, sem quebrar nenhuma das 38 rotas existentes.

- [ ] **Step 2: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Numa tarefa tipo TEXTO já com anexo (ou subir um novo PDF, uma imagem PNG/JPG e um XLSX), em cada um dos 3 setores: clicar no nome do arquivo. PDF e imagem devem abrir direto numa aba nova mostrando o conteúdo; XLSX deve iniciar o download.
2. Em `/fiscal/clientes/[id]`, na seção de planilhas DTE: subir um XLSX, clicar no nome — deve baixar (XLS/XLSX nunca abrem inline no navegador).
3. Testar com um nome de arquivo com acento (ex: `relatório-março.pdf`) — confirmar que o nome baixado/mostrado no título da aba preserva os acentos corretamente (valida o `filename*=UTF-8''...`).
4. Deslogar e tentar acessar a URL de um anexo diretamente (`/api/arquivos/tarefa/<id-conhecido>`) — deve retornar 401.
5. Testar com um usuário de um setor diferente do dono da tarefa (ex: usuário só-Pessoal tentando um `id` de anexo do Fiscal, se houver usuário de teste assim) — deve retornar 404 (RLS de `tarefa_arquivos` bloqueia).

- [ ] **Step 3: Nota final**

Sem commit nesta task (só verificação). Se o Step 1 passar limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores.
