# Abrir/baixar arquivos anexados (tarefa_arquivos e client_files)

**Data:** 2026-07-20
**Status:** Aprovado

## Contexto

Testando a feature de tarefa TEXTO (ver `2026-07-20-criar-tipo-tarefa-no-cliente-design.md`), o usuário percebeu que não dá pra abrir nem baixar um arquivo anexado a uma tarefa — o anexo aparece só como um "chip" com nome e tamanho (`📎 nome.pdf · 1.2 MB`), sem nenhum link. Investigação confirmou que isso nunca existiu: nem no mecanismo mais novo (`tarefa_arquivos`, usado pelas tarefas tipo TEXTO nos 3 setores) nem no mecanismo mais antigo e exclusivo do Fiscal (`client_files`, usado pelas planilhas de conferência DTE). Os dois guardam o arquivo como base64 direto na linha do banco (sem Supabase Storage), e por uma otimização deliberada de uma revisão anterior, `content_base64` é explicitamente excluído de toda consulta em lista (`select('id, name, size, uploaded_at')`) — só existe no banco, nunca chega ao navegador hoje.

## Objetivo

Clicar no nome de um arquivo anexado (em qualquer um dos dois mecanismos) abre numa nova aba: PDF e imagem (PNG/JPG) aparecem direto (visualização); XLS/XLSX/DOCX/CSV o navegador baixa automaticamente, por não saber renderizar esses formatos. Um clique só resolve tanto "abrir" quanto "baixar", sem UI extra.

## Fora de escopo

- Migrar `client_files`/`tarefa_arquivos` para Supabase Storage — continuam como base64 na própria linha, sem mudança de arquitetura de armazenamento.
- Botão explícito de "forçar download" separado do de abrir (decisão do usuário: um clique só).
- Qualquer mudança na lógica de upload, exclusão, ou nos dois formulários de anexo já existentes.

## Design

### Rota nova: `app/api/arquivos/[tabela]/[id]/route.ts`

Uma única rota GET compartilhada pelos dois mecanismos, diferenciados pelo segmento `tabela` (`'tarefa'` ou `'client'`, validado — qualquer outro valor retorna 400). Mapeia pra `tarefa_arquivos` ou `client_files` e busca **só essa linha** (`select('name, size, content_base64').eq('id', id).single()`) — nunca em lista, preservando a otimização existente.

Autenticação/autorização: usa o client de sessão normal (`createClient()` de `lib/supabase/server.ts`, respeita RLS), não o service role. Isso é suficiente e correto porque:
- `tarefa_arquivos` já tem RLS restringindo select a `t.setor = any(p.setores)` do usuário logado (migration `011_tipo_resposta_tarefa.sql`) — a mesma proteção por setor que já vale pra lista também vale automaticamente pra essa busca individual.
- `client_files` tem RLS mais aberta (`auth.uid() is not null`, qualquer autenticado lê) — comportamento preexistente, não é escopo desta mudança apertar isso.

Se `user` não existir (não logado) → 401. Se a linha não vier (não existe, ou RLS bloqueou) → 404. Nos dois casos, `NextResponse` com `{ error }` em JSON, sem vazar detalhe.

Se a linha vier: decodifica `content_base64` pra `Buffer`, infere `Content-Type` pela extensão do `name` (pdf/png/jpg/jpeg/xls/xlsx/docx/csv — mesmo conjunto de extensões já aceito pelos dois formulários de upload; extensão desconhecida cai em `application/octet-stream`), e responde com:

```
Content-Type: <inferido>
Content-Disposition: inline; filename="<nome ascii-safe>"; filename*=UTF-8''<nome codificado>
Cache-Control: private, no-store
```

O par `filename`/`filename*=UTF-8''...` é necessário porque nomes de arquivo em português (acentos) quebram em `filename="..."` sozinho em alguns navegadores — o `filename*` é o formato correto pra UTF-8 no header.

`Content-Disposition: inline` (não `attachment`) pros dois casos — é o que permite o navegador abrir PDF/imagem direto na aba; pra XLS/XLSX/DOCX/CSV o navegador não sabe renderizar de qualquer forma e baixa sozinho, então o mesmo header cobre os dois comportamentos pedidos sem precisar de lógica condicional.

### Mudança nos 4 pontos de UI

Nos 3 checklists (`TarefaChecklistContabil.tsx`, `TarefaChecklistPessoal.tsx`, `TarefaChecklist.tsx` do Fiscal), o texto estático `📎 {arq.name}` dentro do chip vira um link:

```tsx
<a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
  📎 {arq.name}
</a>
```

Em `components/fiscal/ClienteArquivos.tsx` (planilhas DTE, `client_files`), o `<p>{arq.name}</p>` vira o mesmo padrão de link, apontando pra `/api/arquivos/client/${arq.id}`. Em nenhum dos 4 pontos o botão de excluir (`×`/`✕`) muda — continua chamando a mesma action de sempre, só o texto do nome passa a ser clicável.

### Erros e casos de borda

- Usuário sem sessão válida clica no link (ex: sessão expirou numa aba antiga): a rota responde 401, o navegador mostra o JSON de erro na aba nova — aceitável, não é um fluxo comum o suficiente pra justificar uma página de erro dedicada.
- Arquivo excluído entre carregar a lista e clicar no link: 404, mesmo raciocínio acima.
- Nome de arquivo sem extensão ou extensão não reconhecida: `application/octet-stream` — navegador oferece download genérico, sem quebrar.

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano (subir um PDF, uma imagem e um XLSX numa tarefa TEXTO e numa planilha DTE, clicar em cada um, confirmar abre/baixa corretamente nos 2 mecanismos × 3 setores onde aplicável).
