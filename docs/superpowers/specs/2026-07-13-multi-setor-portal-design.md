# Portal multi-setor — fundação de navegação e acesso

**Data:** 2026-07-13
**Status:** aprovado para planejamento

## Contexto

O portal-tesserato hoje é 100% dedicado ao setor Fiscal — todas as páginas vivem em `app/fiscal/*`, e o acesso é controlado só por autenticação (`proxy.ts`) e por `role` (admin/operador). O escritório Tesserato Contabilidade tem 5 setores no total: Fiscal (já existe), Contábil, Pessoal, Societário e Financeiro (a construir, um de cada vez, em specs futuras).

O banco já tem um campo `setor` em `profiles` (enum `user_setor`: fiscal/contabil/pessoal/societario/financeiro), mas é um valor único por usuário. Não existe hoje nenhuma tela para criar usuário dentro do portal — contas são criadas manualmente no painel do Supabase (Authentication → Users), e um trigger (`handle_new_user`) lê `raw_user_meta_data->>'setor'` para popular `profiles.setor`.

Existe um componente `TopNav.tsx` já escrito mas nunca importado em lugar nenhum — código morto, uma tentativa anterior de barra horizontal que não vingou.

## Objetivo deste spec

Construir a **fundação de navegação e controle de acesso multi-setor**: estrutura, permissões e telas de administração necessárias para que os próximos 4 setores possam ser construídos um de cada vez, cada um em seu próprio spec. Este spec **não** inclui as telas de conteúdo de nenhum setor novo (Contábil, Pessoal, Societário, Financeiro ficam com uma página placeholder "Em construção"), nem as versões "gerais" (compartilhadas entre setores) de Dashboard, Calendário e Clientes — essas ficam para specs futuros, quando fizer sentido dentro da construção de cada setor.

## Fora de escopo (explicitamente adiado)

- Conteúdo real de Contábil, Pessoal, Societário, Financeiro.
- Dashboard geral, Calendário geral, Clientes geral (versões compartilhadas entre setores).
- Qualquer refatoração das páginas fiscais existentes além do necessário para plugá-las na nova navegação.

## 1. Modelo de dados

`profiles.setor` (enum único, hoje `not null default 'fiscal'`) migra para `profiles.setores` (array do mesmo enum `user_setor[]`, `not null default '{fiscal}'`). Um usuário pode pertencer a 1 ou mais setores.

- Migração SQL: adicionar coluna `setores user_setor[] not null default '{fiscal}'`, popular com `ARRAY[setor]` a partir da coluna antiga para todo mundo já cadastrado, depois dropar a coluna antiga `setor`. Rodar como uma migration nova em `supabase/migrations/`.
- `handle_new_user()` (trigger) passa a ler `raw_user_meta_data->>'setores'` como array (ou aceitar string única e envolver em array, para não quebrar criação manual via painel do Supabase durante a transição).
- `role` (admin/operador) continua um campo à parte — é um papel transversal, não amarrado a setor nenhum.
- `lib/types.ts`: `Profile.setor: UserSetor` vira `Profile.setores: UserSetor[]`.

## 2. Controle de acesso (`proxy.ts`)

O middleware (`proxy.ts`) hoje só checa autenticação. Passa a também checar setor:

- Busca `profiles.setores` (e `role`) do usuário autenticado a cada request roteado para `/fiscal`, `/contabil`, `/pessoal`, `/societario` ou `/financeiro`.
- Se `role === 'admin'`: acesso liberado a todos os 5 prefixos, sem checagem adicional.
- Senão: se o prefixo da rota acessada não estiver em `profiles.setores`, redireciona para o primeiro setor que o usuário **tem** acesso (ex: usuário só-Contábil tentando acessar `/fiscal/relatorios` via URL direta cai em `/contabil`).
- Rotas comuns (`/intranet`, `/ferramentas`) ficam liberadas para qualquer usuário autenticado, sem checagem de setor.
- Páginas públicas (`/login`, `/auth`, etc.) continuam como estão.

## 3. Navegação: TopNav + Sidebar

**TopNav** (reaproveitando o componente já existente, hoje morto): barra horizontal fixa no topo, acima da sidebar, com uma aba por setor que o usuário tem acesso (Fiscal, Contábil, Pessoal, Societário, Financeiro — só as que o usuário possui). Regras:

- **Usuário com exatamente 1 setor: o TopNav não renderiza.** O portal fica visualmente idêntico ao de hoje — essa é a maioria esperada dos usuários.
- **Admin: sempre vê as 5 abas**, independente do que estiver em `profiles.setores` (o próprio Murilo pode ter só `{fiscal}` no banco e ainda assim ver tudo, por ser admin).
- Trocar de aba muda o "setor ativo" (guardado em cookie, mesmo padrão já usado no projeto para persistir mês/ano selecionado) e redireciona para a home daquele setor (`/fiscal`, `/contabil`, etc.).
- Cada setor tem uma cor de destaque leve na aba ativa e no header, só para orientação visual — sem redesign da paleta.
- Fiscal é tratado como só mais um setor na barra, sem tratamento especial (mesmo estilo visual que os demais). As rotas `/fiscal/*` continuam exatamente onde estão — não há migração de URL.

**Sidebar** passa a ter duas seções:

- **Comum** (fixa no topo, sempre visível, independente do setor ativo): Intranet, Ferramentas. Essas duas páginas saem de `app/fiscal/intranet` e `app/fiscal/ferramentas` para rotas sem prefixo de setor (`app/intranet`, `app/ferramentas`), com redirect 301 das URLs antigas (`/fiscal/intranet` → `/intranet`, idem Ferramentas) para não quebrar links/favoritos existentes.
- **Setor ativo** (embaixo, muda conforme a aba do TopNav): para Fiscal, os itens atuais menos Intranet/Ferramentas (que subiram para Comum) — Dashboard, Clientes, Calendário, Relatórios, Histórico, Parcelamentos, e **Conferência**, que hoje existe como rota (`/fiscal/conferencia`) mas não aparece em nenhum menu — este spec corrige esse esquecimento e a inclui. Para os outros 4 setores: um único item apontando pro placeholder "Em construção" daquele setor.
- Itens admin-only (Parâmetros, Admin) continuam como estão, na seção Comum, condicionados a `role === 'admin'` (mesmo padrão de hoje).

## 4. Administração de usuários

**Correção em relação ao levantamento inicial:** já existe um fluxo funcional de criação/edição de usuário — não em `/fiscal/admin` (que só lista perfis, read-only), mas em `/fiscal/parametros` (`ParametrosClient.tsx` + `actions.ts`, função `criarUsuario`). Hoje ele cria o usuário via `supabase.auth.admin.createUser` (service role, já usando `createAdminClient()` de `lib/supabase/server.ts`) e grava `setor: 'fiscal'` **fixo** no `profiles.update` pós-criação (`actions.ts:71`) — daí o aviso na tela, "Usuários criados aqui têm acesso apenas ao setor fiscal." Este spec **estende esse fluxo existente** em vez de criar um novo:

- Formulário "Novo Usuário" (`ParametrosClient.tsx`) ganha um multi-select de setores (5 opções do enum) no lugar do `setor: 'fiscal'` fixo.
- `criarUsuario` (`actions.ts`) passa a receber `setores: string[]` em vez de setor único, e grava em `profiles.setores` (array).
- O painel "Usuários Cadastrados" (edição inline, mesmo arquivo) ganha o mesmo multi-select de setores, além dos campos que já edita hoje (nome, role, cor) — via `atualizarPerfil`.
- O campo `abas_acesso` (checkboxes "Acesso às Abas": Intranet, Dashboard, Clientes, etc.) é uma configuração legada e não-lida em lugar nenhum do código hoje (gravada mas nunca consultada para gating) — fica como está, fora de escopo.

## 5. Placeholders dos novos setores

Cada um dos 4 setores novos ganha uma rota mínima:

- `app/contabil/page.tsx`, `app/pessoal/page.tsx`, `app/societario/page.tsx`, `app/financeiro/page.tsx` (fora de `app/fiscal/`, seguindo o padrão de pasta por setor).
- Cada uma renderiza uma tela simples "Setor em construção" dentro do mesmo layout (TopNav + Sidebar comum), sem nenhuma feature real.
- Cada setor passa a ter seu próprio `layout.tsx` (espelhando `app/fiscal/layout.tsx`) que aplica a checagem de acesso e monta TopNav + Sidebar.

## Testes e verificação

Projeto não tem suíte de testes automatizados (confirmado — sem Jest/Vitest configurado). Verificação será manual no navegador, cobrindo:

- Usuário mono-setor (Fiscal): portal deve ficar visualmente idêntico a hoje (sem TopNav visível).
- Usuário multi-setor: TopNav aparece, troca de aba muda a Sidebar e leva para a home certa.
- Usuário tentando acessar via URL direta um setor que não tem → redirecionado.
- Admin: vê as 5 abas mesmo com `setores = {fiscal}` no banco.
- Criação de usuário novo pelo Admin: usuário criado consegue logar e só vê os setores atribuídos.
- Links antigos `/fiscal/intranet` e `/fiscal/ferramentas` redirecionam para `/intranet` e `/ferramentas`.
- Conferência aparece no menu do Fiscal.

## Riscos conhecidos

- Migração de coluna (`setor` → `setores`) é uma mudança de schema em produção — precisa rodar em horário de baixo uso e ter plano de rollback (manter a coluna antiga populada em paralelo até confirmar que tudo funciona, e só dropar depois).
- Mover Intranet/Ferramentas de rota pode quebrar favoritos/links salvos por usuários — mitigado com redirect permanente.
- `auth.admin.createUser` roda com service role — precisa garantir que essa chave não vaza pro client (Server Action apenas, nunca em client component).
