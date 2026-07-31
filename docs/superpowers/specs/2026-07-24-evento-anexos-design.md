# Anexar arquivos ao Evento (tarefas_avulsas)

**Data:** 2026-07-24
**Status:** Aprovado

## Contexto

"Evento" é o nome de tela pra `tarefas_avulsas`, um mecanismo genérico e setor-agnóstico (Fiscal/Contábil/Pessoal) pra registrar um item pontual num cliente: título, descrição, data. Botão "+ Evento" em `components/geral/EventosAvulsosSecao.tsx`, formulário em `components/geral/EventoAvulsoModal.tsx`, backend em `lib/tarefas-avulsas.ts`, montado nas 3 páginas de cliente (`app/fiscal/clientes/[id]/page.tsx`, `app/contabil/clientes/[id]/page.tsx`, `app/pessoal/clientes/[id]/page.tsx`).

Hoje um Evento não tem nenhum conceito de anexo. O usuário quer poder anexar arquivo(s) — tanto no momento de criar o Evento quanto depois, num Evento já existente.

Já existe um padrão consolidado de anexos no projeto, usado pelos checklists de tarefa: tabela `tarefa_arquivos` (arquivo guardado como base64 na própria linha, sem Supabase Storage), rota genérica `app/api/arquivos/[tabela]/[id]/route.ts` que serve os bytes pra abrir/baixar, e uma action de upload (`uploadArquivoTarefa` em `app/fiscal/clientes/actions.ts`) que valida tipo (`PDF`, `PNG`, `JPG/JPEG`, `XLS/XLSX`, `DOCX`) e tamanho (10MB). Este design replica esse padrão pro Evento, sem inventar mecanismo novo.

## Objetivo

Um Evento pode ter múltiplos arquivos anexados — na criação e depois, a qualquer momento, com os mesmos tipos/tamanho permitidos hoje pra anexos de tarefa. Cada anexo pode ser aberto/baixado e removido individualmente.

## Fora de escopo

- Mudar o padrão de armazenamento existente (base64 na linha) — não migra pra Supabase Storage.
- Anexos em massa / drag-and-drop avançado — só seleção múltipla via input padrão de arquivo.
- Editar título/descrição/data do Evento (já existe, não muda).
- Aplicar em produção — esta mudança é dev-only, como todo o resto da expansão multi-setor nesta branch.

## Design

### 1. Tabela `evento_arquivos` (migration nova)

Espelha `tarefa_arquivos` exatamente, trocando a FK:

```sql
create table evento_arquivos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid references tarefas_avulsas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index idx_evento_arquivos_evento_id on evento_arquivos (evento_id);

alter table evento_arquivos enable row level security;

create policy "Setor le arquivos de seus eventos" on evento_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de seus eventos" on evento_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);
```

Aplicada só no banco de dev (`fcpcorqquovvgtoukxry`), como toda migration desta expansão — é DDL (`create table`), então precisa ser rodada manualmente pelo usuário no SQL Editor do Supabase de dev (não dá pra aplicar via REST insert).

### 2. Rota de servir arquivo

`app/api/arquivos/[tabela]/[id]/route.ts` ganha uma entrada no mapa `TABELAS`:

```ts
const TABELAS: Record<string, string> = {
  tarefa: 'tarefa_arquivos',
  client: 'client_files',
  evento: 'evento_arquivos',
}
```

Nenhuma outra mudança na rota — ela já é genérica (busca `name, content_base64` por id, decide `Content-Type` pela extensão, serve com `Content-Disposition: inline`).

### 3. Constantes de validação compartilhadas

Hoje `TIPOS_PERMITIDOS_TAREFA`/`TAMANHO_MAX_ARQUIVO_TAREFA` vivem só em `app/fiscal/clientes/actions.ts`. Como passam a ser usadas em mais um lugar, viram um módulo compartilhado `lib/anexos.ts`:

```ts
export const TIPOS_ARQUIVO_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]
export const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024 // 10 MB
```

`app/fiscal/clientes/actions.ts` passa a importar dali em vez de declarar localmente (mesmos valores, sem mudança de comportamento).

### 4. Backend (`lib/tarefas-avulsas.ts`)

- `criarTarefaAvulsa` passa a retornar `{ id: string } | { error: string }` (hoje não retorna nada) — o `id` do evento recém-criado é necessário pra anexar arquivo logo em seguida, já que a FK de `evento_arquivos` exige o evento já existir.
- Nova `uploadArquivoEvento(eventoId: string, clienteId: string, setor: UserSetor, formData: FormData)`: valida tipo/tamanho com `lib/anexos.ts`, converte pra base64, insere em `evento_arquivos`, `revalidatePath` do cliente. Mesma forma de `uploadArquivoTarefa`, sem a parte de "criar tarefa se não existir" (o evento já existe antes do upload) nem a parte de marcar `concluida` (Evento tem seu próprio conceito de concluída, via checkbox, não ligado a anexo).
- Nova `excluirArquivoEvento(arquivoId: string, clienteId: string, setor: UserSetor)`: deleta a linha de `evento_arquivos`, `revalidatePath`.
- `buscarTarefasAvulsasDoMes` passa a trazer os anexos de cada evento no mesmo select (`*, profiles(nome), evento_arquivos(id, name, size)`), pra a lista já vir com os anexos sem N+1 queries.
- `TarefaAvulsaComCriador` ganha `arquivos: EventoArquivo[]`.

### 5. Tipos (`lib/types.ts`)

Novo tipo, espelhando `TarefaArquivo`:

```ts
export interface EventoArquivo {
  id: string
  evento_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}
```

(Espelha `TarefaArquivo` também no campo `content_base64` — a lista do mês nunca seleciona esse campo, usando `Omit<EventoArquivo, 'content_base64'>[]` no tipo de retorno, mesmo padrão já usado pra `tarefa_arquivos`.)

### 6. UI — criação (`components/geral/EventoAvulsoModal.tsx`)

Campo de arquivo (`<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx">`) abaixo do campo Data. Ao salvar: primeiro cria o evento via `criarTarefaAvulsa` (pegando o `id` retornado); se deu certo e há arquivos selecionados, faz upload de cada um sequencialmente via `uploadArquivoEvento`. Se algum upload falhar (tipo/tamanho inválido), mostra o erro mas mantém o evento já criado (não desfaz a criação) — consistente com o padrão de erro já usado no formulário (mensagem de erro inline, sem bloquear o restante).

### 7. UI — lista e edição posterior (`components/geral/EventosAvulsosSecao.tsx`)

Cada card de evento ganha, abaixo da linha de data/criador:
- Lista de chips de anexo (nome truncado, clicável → abre `/api/arquivos/evento/{id}` em nova aba) com um `×` de exclusão por chip (chama `excluirArquivoEvento`, mesmo padrão de confirmação inline já usado pra excluir o próprio evento).
- Se `podeEditar`: um botão pequeno "+ anexo" que abre um input de arquivo oculto (mesma técnica de clique-em-label já usada nos checklists de tarefa) — ao selecionar, faz upload direto via `uploadArquivoEvento` sem precisar reabrir o modal.

### Erros e casos de borda

- Evento sem nenhum anexo: nenhuma mudança visual (lista de chips não aparece), igual ao padrão de tarefas.
- Tipo de arquivo não permitido ou arquivo grande demais: mensagem de erro inline, mesma redação já usada em `uploadArquivoTarefa` ("Tipo de arquivo não permitido..." / "Arquivo muito grande. Máximo permitido: 10 MB.").
- Excluir o Evento inteiro (`excluirTarefaAvulsa`) já deleta seus anexos automaticamente via `on delete cascade` na FK — nenhuma mudança necessária nessa action.
- `podeEditar = false`: nem o botão "+ anexo" nem o `×` de exclusão de anexo aparecem — mesma regra de permissão já aplicada ao resto do card.

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano (criar evento com 2 anexos de tipos diferentes; abrir e baixar cada um; anexar mais um arquivo depois, num evento já existente; excluir um anexo individual; excluir o evento inteiro e confirmar que os anexos somem junto; tentar anexar um tipo não permitido e confirmar a mensagem de erro).
