# Design: Seletor Global de Mês/Ano

**Data:** 2026-07-01
**Status:** Aprovado

---

## Objetivo

Adicionar um seletor de mês/ano no Sidebar que permita a qualquer usuário navegar entre os meses do sistema, controlando quais dados são exibidos nas principais páginas de progresso fiscal — sem precisar de um filtro separado em cada página.

---

## Escopo

### Quem usa
Todos os usuários autenticados (admin ou não). Não há restrição por `role`.

### Persistência
Cookie de **sessão** (sem `maxAge`/`expires`) chamado `mes_selecionado`, com valor `"MM-YYYY"`. Expira quando o navegador fecha — cada novo login/sessão volta para o mês atual do sistema.

### Páginas afetadas (leem o cookie em vez de `new Date()`)
- `app/fiscal/dashboard/page.tsx`
- `app/fiscal/clientes/page.tsx`
- `app/fiscal/tarefas/page.tsx`
- `app/fiscal/relatorios/page.tsx`
- `app/fiscal/historico/page.tsx`
- `app/fiscal/parcelamentos/page.tsx`

### Fora de escopo
- `app/fiscal/calendario/page.tsx` e `app/fiscal/agenda/page.tsx` mantêm a navegação de mês própria (client-side, `useState` local), sem relação com o cookie global. Confirmado com o usuário.
- Não há seleção de intervalo (só um mês por vez).
- Não há persistência entre sessões — resetar sempre para o mês atual no login é intencional.

---

## Componentes

### `lib/mes-atual.ts` (novo)

Helper server-side usado por todas as páginas afetadas.

```typescript
import { cookies } from 'next/headers'

export async function getMesAno(): Promise<{ mes: number; ano: number }> {
  const cookieStore = await cookies()
  const valor = cookieStore.get('mes_selecionado')?.value

  if (valor) {
    const [mesStr, anoStr] = valor.split('-')
    const mes = parseInt(mesStr, 10)
    const ano = parseInt(anoStr, 10)
    if (mes >= 1 && mes <= 12 && ano > 2000) {
      return { mes, ano }
    }
  }

  const hoje = new Date()
  return { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() }
}
```

Cada página troca seu cálculo local (`const mes = hoje.getMonth() + 1`, etc.) por `const { mes, ano } = await getMesAno()`.

### `components/fiscal/MesSeletor.tsx` (novo, client component)

- Renderizado no topo do `Sidebar.tsx`, na área ao lado do logo/nome.
- Exibe o mês/ano atual formatado (ex: "Junho · 2026") com setas ‹ › para retroceder/avançar um mês.
- Ao clicar em uma seta, chama a server action `definirMesAno(novoMes, novoAno)` e, ao retornar, executa `router.refresh()` para que as páginas server-rendered releiam o cookie.
- Recebe `mes`/`ano` iniciais via prop, calculados no layout (`app/fiscal/layout.tsx` ou onde o `Sidebar` já é montado) usando o mesmo `getMesAno()`.

### Server action: `definirMesAno` (novo, em `lib/mes-atual.ts` ou arquivo de actions dedicado)

```typescript
'use server'

export async function definirMesAno(mes: number, ano: number) {
  const cookieStore = await cookies()
  cookieStore.set('mes_selecionado', `${mes}-${ano}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // sem maxAge -> cookie de sessão
  })
  revalidatePath('/fiscal', 'layout')
}
```

---

## Fluxo de dados

1. Usuário abre o sistema → sem cookie → `getMesAno()` retorna o mês atual real.
2. Usuário clica em ‹ no `MesSeletor` → chama `definirMesAno(mesAnterior, anoAnterior)`.
3. Server action grava o cookie e revalida o layout `/fiscal`.
4. Todas as páginas afetadas, no próximo render, chamam `getMesAno()` e recebem o novo mês/ano — a lista de tarefas, progresso, relatórios etc. mudam de acordo.
5. Fechar o navegador e abrir de novo → cookie de sessão já não existe → volta ao mês atual.

---

## Testes / Verificação manual

- Trocar o mês no Sidebar e confirmar que Dashboard, Clientes, Tarefas, Relatórios, Histórico e Parcelamentos passam a mostrar dados do mês selecionado.
- Confirmar que Calendário e Agenda **não** mudam ao trocar o seletor global (continuam com sua navegação própria).
- Fechar e reabrir o navegador (ou limpar cookies de sessão) e confirmar que volta ao mês atual.
- Testar limites: dezembro → janeiro do ano seguinte, e janeiro → dezembro do ano anterior.

---

## Fora de escopo (explícito)

- Restringir o seletor por `role` (todos os usuários podem usar).
- Sincronizar Calendário/Agenda com o seletor global.
- Persistência de longo prazo (cookie permanente) da seleção.
- Seleção de múltiplos meses ou intervalo de datas.
