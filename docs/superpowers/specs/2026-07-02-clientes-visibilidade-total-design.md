# Design: Visibilidade total de Clientes, edição restrita ao responsável

**Data:** 2026-07-02
**Status:** Aprovado

---

## Objetivo

Hoje, quem não é admin só vê na tela de Clientes os clientes onde `responsavel` bate com o próprio nome, e não consegue nem abrir o detalhe de um cliente de outra pessoa (404). Isso muda: **todo mundo passa a ver todos os clientes**, mas **só o responsável (+ admin) pode editar** — quem não é responsável abre a página normalmente, mas todos os controles de alteração ficam desabilitados/ocultos.

---

## Regra de permissão

```
podeEditar = profile.role === 'admin'
          || profile.nome.toLowerCase() === cliente.responsavel?.toLowerCase()
```

Mesma comparação por nome (case-insensitive) já usada em `app/fiscal/tarefas/page.tsx` e no filtro atual da lista — não introduz relação por ID.

---

## Descoberta durante o brainstorming

As Server Actions em `app/fiscal/clientes/actions.ts` (e a função `toggleTarefa` local em `[id]/page.tsx`) **não checam papel nenhum hoje** — usam `getAuthenticatedAdmin()`, que retorna o client com service role (bypassa RLS) sempre que `SUPABASE_SERVICE_ROLE_KEY` está configurada. A única proteção hoje é a página ser inacessível pra quem não é responsável. Ao abrir a visibilidade pra todo mundo, isso vira uma brecha real: qualquer usuário logado poderia chamar essas actions diretamente (fora da UI) e alterar cliente de outra pessoa, mesmo com os botões escondidos. Por isso a checagem de permissão precisa entrar tanto na UI quanto em cada Server Action.

Também foi encontrado `export async function toggleTarefa` em `actions.ts` que não é importado em lugar nenhum — morto. O toggle real é a função local dentro de `[id]/page.tsx`. Sai junto nesta mudança pra não confundir na hora de aplicar o check.

O botão "Editar" (via `EmpresaModal`) grava direto do navegador usando o client anônimo (RLS), não passa pela service role. Hoje só existe a policy `"Admin gerencia clientes" for all using (is_admin)` — um responsável não-admin cairia em erro de RLS ao tentar salvar. Precisa de uma policy nova de `update` liberando pra quem é responsável.

---

## O que muda

### 1. Visibilidade

**`app/fiscal/clientes/page.tsx`** — remove o filtro:
```typescript
if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('responsavel', profile.nome)
```
Lista sempre busca todos os clientes, pra qualquer usuário autenticado.

**`app/fiscal/clientes/[id]/page.tsx`** — remove o gate:
```typescript
if (profile?.role !== 'admin' && cliente.responsavel?.toLowerCase() !== profile?.nome?.toLowerCase()) notFound()
```
Continua exigindo login (`if (!user) redirect('/login')`), mas não bloqueia mais por responsável. Calcula:
```typescript
const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()
```
e passa como prop pros componentes filhos que precisam.

### 2. Interface (esconder/desabilitar edição)

- **`ClienteAcoes.tsx`**: só é renderizado no cabeçalho da página quando `podeEditar` é `true` (`{podeEditar && <ClienteAcoes ... />}` em `[id]/page.tsx`). Sem mudança no componente em si.
- **`TarefaChecklist.tsx`**: novo prop `podeEditar: boolean`. Quando `false`: checkboxes de tarefa, checkboxes de sub-etapa (Recebido/Importado/Conferido), botão/fluxo de desbloqueio e campo MIT ficam `disabled`, sem disparar as actions.
- **`ClienteObs.tsx`**: novo prop `podeEditar: boolean`. Quando `false`: textarea `readOnly`, sem botão de salvar (ou botão oculto).
- **`ClienteArquivos.tsx`**: novo prop `podeEditar: boolean`. Quando `false`: esconde o controle de upload e os botões de excluir arquivo. A lista de arquivos em si continua visível pra todos (é visualização, não edição).
- **`ClienteConferencia.tsx`**: sem mudança — não grava nada no banco, é só análise local do XLSX já carregado.

### 3. Segurança no backend (obrigatório)

Novo helper, em `lib/supabase/server.ts`:
```typescript
export async function podeEditarCliente(clienteId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role,nome').eq('id', user.id).single()
  if (profile?.role === 'admin') return true
  const { data: cliente } = await supabase.from('clientes').select('responsavel').eq('id', clienteId).single()
  return !!profile?.nome && profile.nome.toLowerCase() === cliente?.responsavel?.toLowerCase()
}
```

Aplicado no início de cada Server Action que grava dado de um cliente específico, retornando erro sem gravar nada se `false`:

| Action | Arquivo | Como chega no `clienteId` |
|---|---|---|
| `toggleTarefa` (local) | `app/fiscal/clientes/[id]/page.tsx` | já é o `id` da página (fechamento) |
| `salvarMIT` | `clientes/actions.ts` | parâmetro direto |
| `salvarObs` | `clientes/actions.ts` | parâmetro direto |
| `uploadArquivo` | `clientes/actions.ts` | parâmetro direto |
| `excluirArquivo` | `clientes/actions.ts` | busca `cliente_id` da linha em `client_files` primeiro |
| `atualizarSubEtapa` | `clientes/actions.ts` | parâmetro direto |
| `desbloquearTarefa` | `clientes/actions.ts` | busca `cliente_id` da linha em `tarefas` primeiro |
| `excluirCliente` | `clientes/actions.ts` | parâmetro direto (`id`) |

Remove o `export async function toggleTarefa` morto de `clientes/actions.ts`.

### 4. Banco de dados

Nova policy de RLS (SQL a ser rodado direto no Supabase, igual foi feito nas correções anteriores; documentado como novo bloco em `supabase/migrations/001_initial.sql`):

```sql
create policy "Responsavel atualiza seu cliente"
  on clientes for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes.responsavel))
  );
```

Necessária só pro fluxo do `EmpresaModal` (único caminho que fala com o Supabase via RLS em vez de service role). A exclusão (`excluirCliente`) já passa pela Server Action com service role — protegida pelo check de código do item 3, não depende de RLS.

---

## Fora de escopo

- `app/fiscal/tarefas/page.tsx` — tela separada, já tem filtro próprio por responsável, não usa nenhuma das Server Actions tocadas aqui.
- Botão "+ Novo Cliente" — continua como está (na prática só funciona pra admin, já que a policy de `insert` em `clientes` também é admin-only). Não foi pedido pra mudar.
- Regra de match responsável↔usuário por nome — mantém como está no resto do sistema, não migra pra relação por ID.
