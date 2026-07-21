# Permissão de acesso por página, por setor

**Data:** 2026-07-21
**Status:** Aprovado

## Contexto

Testando o portal, o usuário notou dois problemas relacionados a usuários/permissões:

1. **Bug (já corrigido em commit separado, `5a281cd`):** a lista "Responsável" nos formulários de cliente nunca vinha de usuários cadastrados (`profiles`) — vinha só de valores de `responsavel` já digitados em clientes existentes. Corrigido antes desta spec.
2. **Gap de design (esta spec):** a tela de cadastro de usuário (`app/fiscal/parametros/ParametrosClient.tsx`) tem uma lista de "abas" que o usuário pode marcar (`Intranet, Dashboard, Clientes, Calendários, Conferência, Relatórios, Histórico, Empresas, Parcelamentos`), salva em `profiles.abas_acesso`. Só que essa lista é genérica — não diz a qual setor cada página pertence — e, mais grave, **nunca é lida em nenhum outro lugar do código**: é uma tela que salva um dado que não tem efeito nenhum sobre o que o usuário realmente consegue acessar. O único controle de acesso real hoje é `profiles.setores` (tudo-ou-nada por setor), checado em `proxy.ts` a cada requisição.

O usuário quer: se um usuário está cadastrado em Fiscal e Contábil, poder escolher especificamente quais páginas de cada um desses setores ele acessa — e que isso realmente bloqueie, não só apareça marcado numa tela.

## Objetivo

Substituir a lista solta de "abas" por um controle de acesso por página **agrupado por setor** e **de verdade aplicado** — um usuário sem uma página marcada não consegue abrir aquela URL.

## Fora de escopo

- Societário e Financeiro — hoje são páginas únicas sem sub-navegação; entram nesse sistema quando ganharem páginas de verdade.
- `agenda`, `bots`, `tarefas` (Fiscal) — não fazem parte da navegação normal (não aparecem no menu), ficam de fora do escopo de permissão por página.
- `parametros`, `admin`, `vinculos` — já são exclusivos de admin por um mecanismo separado (`profile.role === 'admin'`, checado no próprio `Sidebar.tsx` e devem continuar assim); não entram na lista de páginas por setor.
- Migrar/dropar a coluna `abas_acesso` — fica no schema, morta, mesmo padrão adotado com as colunas do ENTRADA/SAIDAS.
- Qualquer mudança em como `profiles.setores` funciona hoje (isso continua tudo-ou-nada, tal como está).

## Design

### 1. Fonte única da lista de páginas por setor

Hoje `components/fiscal/Sidebar.tsx` já tem `ITENS_POR_SETOR: Record<UserSetor, NavItem[]>` com a lista exata de páginas navegáveis por setor (Dashboard, Clientes, Calendário, Relatórios, Histórico, e no Fiscal também Parcelamentos e Conferência). Essa constante sai do componente e vai para `lib/paginas-setor.ts`, um array simples por setor (só `slug`/`label`, sem `icon` — o ícone continua só no Sidebar):

```ts
export const PAGINAS_POR_SETOR: Record<UserSetor, { slug: string; label: string }[]> = {
  fiscal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'historico', label: 'Histórico' },
    { slug: 'parcelamentos', label: 'Parcelamentos' },
    { slug: 'conferencia', label: 'Conferência' },
  ],
  contabil: [ /* dashboard, clientes, calendario, relatorios, historico */ ],
  pessoal: [ /* mesma lista do contabil */ ],
  societario: [],
  financeiro: [],
}
```

`Sidebar.tsx` passa a importar `PAGINAS_POR_SETOR` e montar seu próprio `NavItem[]` (com ícone) a partir dela, em vez de manter a lista duplicada.

### 2. Dado: `profiles.paginas_acesso`

Nova coluna `text[]`, formato `"<setor>:<slug>"` (ex: `"fiscal:relatorios"`, `"contabil:dashboard"`). `dashboard` de cada setor **não é armazenado** — é sempre implicitamente permitido pra quem tem aquele setor, pra nunca deixar um usuário sem conseguir abrir a própria home (e cair num loop de redirecionamento, já que hoje é pra lá que `proxy.ts` manda quando barra o acesso).

Migration nova (`013_paginas_acesso.sql`) adiciona a coluna, `default '{}'`. `abas_acesso` fica no schema, sem uso — não é lida nem escrita depois desta mudança.

### 3. Aplicação real em `proxy.ts`

Depois do check de setor já existente (`podeAcessar`), um segundo check: extrai o segmento seguinte ao setor na URL (`/fiscal/relatorios/...` → `relatorios`), e — se não for `dashboard` — confere se `${setorDaRota}:${slug}` está em `profile.paginas_acesso`. Admin continua passando sempre, igual já acontece pro check de setor. Se barrado, mesmo destino de fallback que já existe hoje (primeiro setor do usuário, ou `/intranet`).

### 4. Tela de cadastro de usuário

Em `app/fiscal/parametros/ParametrosClient.tsx`, a lista fixa `ABAS` (checkbox solto, sem setor) sai. No lugar, pra cada setor que o formulário tem marcado em "Setores", aparece um bloco com o nome do setor e os checkboxes das páginas daquele setor (vindos de `PAGINAS_POR_SETOR`) — Dashboard não aparece na lista (já é implícito). Se o usuário desmarca um setor no formulário, o bloco de páginas daquele setor some (e as páginas que estavam marcadas nele são descartadas do payload salvo).

`criarUsuario`/a action de editar usuário em `app/fiscal/parametros/actions.ts` passam a gravar `paginas_acesso` em vez de `abas_acesso`.

### Erros e casos de borda

- Usuário com um setor mas nenhuma página marcada além do Dashboard implícito: só consegue abrir a home daquele setor, mais nada — comportamento esperado, não é um bug.
- Usuário perde acesso a um setor (desmarcado depois): as entradas `"<setor>:<slug>"` daquele setor ficam órfãs em `paginas_acesso` (não são limpas automaticamente) — inofensivo, porque o check de setor em `proxy.ts` já bloqueia antes de chegar no check de página.
- Admin: continua sempre passando em tudo, como hoje — essa mudança não introduz nenhuma restrição nova pra quem é admin.

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano (criar/editar um usuário de teste com Fiscal+Contábil marcados, liberar só algumas páginas de cada, confirmar no navegador que as páginas não liberadas redirecionam e as liberadas abrem normalmente, confirmar que o Dashboard de cada setor sempre abre mesmo sem estar marcado).
