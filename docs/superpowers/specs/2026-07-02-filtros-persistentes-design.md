# Design: Filtros persistentes por sessão

**Data:** 2026-07-02
**Status:** Aprovado

---

## Objetivo

Todo filtro de listagem do sistema hoje é `useState` puro — reseta pro valor default assim que o usuário troca de tela e volta. Passa a persistir: trocar de tela e voltar mantém o filtro como estava; só reseta se o usuário for lá e mudar de novo, ou fechar a aba/navegador (persistência via `sessionStorage`, escopo por aba).

---

## Abordagem

Hook único reutilizável, `useFiltroPersistente`, que se comporta como `useState` mas sincroniza com `sessionStorage`:

```typescript
// lib/use-filtro-persistente.ts
import { useEffect, useState } from 'react'

export function useFiltroPersistente<T>(chave: string, valorInicial: T): [T, (valor: T) => void] {
  const [valor, setValorState] = useState<T>(valorInicial)

  useEffect(() => {
    const salvo = sessionStorage.getItem(chave)
    if (salvo === null) return
    try {
      setValorState(JSON.parse(salvo))
    } catch {
      // valor corrompido no storage — ignora, mantém o default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setValor(novoValor: T) {
    setValorState(novoValor)
    sessionStorage.setItem(chave, JSON.stringify(novoValor))
  }

  return [valor, setValor]
}
```

Cada filtro troca sua linha `useState(default)` por `useFiltroPersistente('chave:unica', default)`. Nenhuma outra mudança na lógica de filtragem (os `.filter(...)` já existentes continuam iguais).

**Trade-off aceito:** como a leitura do `sessionStorage` acontece em `useEffect` (só roda no client, depois do primeiro render), há um flash de um frame com o valor default antes de aplicar o valor salvo. Evitar isso exigiria lazy initializer com checagem de `typeof window`, o que gera mismatch de hidratação em componente SSR — não vale a complexidade pra um filtro.

**Alternativas descartadas:** query params na URL (mais complexo pra sincronizar entre telas diferentes, e não bate com "só na aba atual" que foi a escolha explícita); Context global tipo `MesAnoProvider` (não sobrevive a um refresh de página, e a escolha foi explicitamente por `sessionStorage`).

---

## Filtros migrados (14)

| Tela | Arquivo | Variável | Chave sessionStorage | Default |
|---|---|---|---|---|
| Clientes | `components/fiscal/ClientesLista.tsx` | `busca` | `clientes:busca` | `''` |
| Clientes | `components/fiscal/ClientesLista.tsx` | `filtroResponsavel` | `clientes:responsavel` | `'TODOS'` |
| Clientes | `components/fiscal/ClientesLista.tsx` | `filtroGrupo` | `clientes:grupo` | `'TODOS'` |
| Clientes | `components/fiscal/ClientesLista.tsx` | `filtroAtividade` | `clientes:atividade` | `'TODOS'` |
| Clientes | `components/fiscal/ClientesLista.tsx` | `filtroPendencia` | `clientes:pendencia` | `false` |
| Relatórios | `app/fiscal/relatorios/page.tsx` | `filtroResp` | `relatorios:responsavel` | `'TODOS'` |
| Relatórios | `app/fiscal/relatorios/page.tsx` | `filtroGrupo` | `relatorios:grupo` | `'TODOS'` |
| Relatórios | `app/fiscal/relatorios/page.tsx` | `filtroAtividade` | `relatorios:atividade` | `'TODAS'` |
| Relatórios | `app/fiscal/relatorios/page.tsx` | `apenasP` | `relatorios:pendencia` | `false` |
| Parcelamentos | `app/fiscal/parcelamentos/page.tsx` | `search` | `parcelamentos:busca` | `''` |
| Parcelamentos | `app/fiscal/parcelamentos/page.tsx` | `secaoFiltro` | `parcelamentos:secao` | `'TODOS'` |
| Parcelamentos | `app/fiscal/parcelamentos/page.tsx` | `respFiltro` | `parcelamentos:responsavel` | `'TODOS'` |
| Conferência | `app/fiscal/conferencia/page.tsx` | `busca` | `conferencia:busca` | `''` |
| Histórico | `app/fiscal/historico/page.tsx` | `selectedResp` | `historico:responsavel` | `null` |

---

## Fora de escopo

- Filtro de busca dentro de Ferramentas (`FerramentasClient.tsx`) — excluído a pedido.
- `mes`/`ano` (Agenda, Calendário, seletor global) — não são filtro de lista, são navegação/competência; o seletor global já persiste via cookie.
- Toggle de card aberto em Ferramentas — estado de UI (accordion), não filtro.
- Qualquer mudança na lógica de filtragem em si — só a persistência do valor.
