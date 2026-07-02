# Design: Mover Editar/Excluir de Empresas para Clientes

**Data:** 2026-07-02
**Status:** Aprovado

---

## Objetivo

A página `/fiscal/empresas` (lista com editar/excluir via `EmpresaModal`) deixa de existir. Essas ações passam a viver na página de detalhe do cliente (`/fiscal/clientes/[id]`), e o cadastro de cliente novo passa a viver na página de Clientes (`/fiscal/clientes`).

---

## Descoberta durante o brainstorming

Além da página `/fiscal/empresas` (lista, usada de fato), existem rotas órfãs não linkadas de lugar nenhum na aplicação: `/fiscal/empresas/novo`, `/fiscal/empresas/[id]/editar`, e o componente `components/fiscal/EmpresaForm.tsx` que elas usam — um formulário de página cheia mais antigo, substituído pelo `EmpresaModal` mas nunca removido. Esse código morto sai junto nesta mudança.

---

## O que remove

- `app/fiscal/empresas/page.tsx` e `app/fiscal/empresas/EmpresasClient.tsx`
- `app/fiscal/empresas/novo/page.tsx`, `app/fiscal/empresas/[id]/editar/page.tsx`
- `components/fiscal/EmpresaForm.tsx`
- `app/fiscal/empresas/actions.ts` (`criarEmpresa`/`atualizarEmpresa` só serviam o form órfão; `excluirEmpresa` migra pra `clientes/actions.ts` como `excluirCliente`)
- Item "Empresas" do `components/fiscal/Sidebar.tsx`

## O que adiciona

### Botão "+ Novo Cliente" em `ClientesLista.tsx`

Mesmo padrão do antigo "+ Nova Empresa": abre `EmpresaModal` com `clienteId={null}`. Precisa de `responsaveis` e `templates` (atividade) como novas props vindas de `app/fiscal/clientes/page.tsx`, que passa a buscar `atividade_templates` também (igual `empresas/page.tsx` fazia).

### Botões "Editar" / "Excluir" em `/fiscal/clientes/[id]`

Novo componente client `components/fiscal/ClienteAcoes.tsx`, renderizado no cabeçalho da página de detalhe, ao lado do nome do cliente:

```tsx
interface Props {
  cliente: Cliente
  responsaveis: string[]
  templates: Record<string, string[]>
}

export default function ClienteAcoes({ cliente, responsaveis, templates }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  async function handleExcluir() {
    if (!confirm(`Excluir "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return
    await excluirCliente(cliente.id)
    router.push('/fiscal/clientes')
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => setModalOpen(true)} className="...">Editar</button>
        <button onClick={handleExcluir} className="...">Excluir</button>
      </div>
      {modalOpen && (
        <EmpresaModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          templates={templates}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
```

`app/fiscal/clientes/[id]/page.tsx` passa a buscar `atividade_templates` e a lista de responsáveis (distinct de `clientes.responsavel`, igual já é feito em `EmpresasClient.tsx`), e renderiza `<ClienteAcoes cliente={cliente} responsaveis={responsaveis} templates={templatesMap} />` no cabeçalho.

### `excluirCliente` em `app/fiscal/clientes/actions.ts`

```typescript
export async function excluirCliente(id: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/clientes')
}
```

Sem `redirect()` na action (diferente da antiga `excluirEmpresa`) — o redirecionamento pra `/fiscal/clientes` acontece no client, via `router.push()`, depois da chamada.

---

## Fora de escopo

- Mudanças no `EmpresaModal.tsx` em si (reaproveitado como está)
- Qualquer alteração de permissão (segue exigindo `role=admin`, igual hoje)
