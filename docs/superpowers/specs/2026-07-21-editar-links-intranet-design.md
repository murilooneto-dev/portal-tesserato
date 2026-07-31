# Links da Intranet editáveis, sem ícones

**Data:** 2026-07-21
**Status:** Aprovado

## Contexto

Os cards de "Links Úteis" na página `/intranet` (`components/fiscal/LinksRapidos.tsx`) vêm de uma tabela `links_rapidos` que nunca teve nenhuma tela de gestão — os 10 links atuais foram inseridos direto por SQL na migration inicial (`001_initial.sql`). Cada card hoje mostra um favicon buscado do Google (`https://www.google.com/s2/favicons?domain=...`), o título, o domínio como subtítulo, e um ícone de seta/link externo. RLS já restringe escrita (`insert`/`update`/`delete`) a admin, leitura a qualquer autenticado — a tabela já foi desenhada pra isso, só faltava a tela.

## Objetivo

Admin consegue criar, editar e excluir os cards de link direto na página `/intranet`, sem sair dela. Os cards perdem o favicon e o ícone de seta — ficam só com o título e o domínio como texto.

## Fora de escopo

- Reordenar links por arraste — novos links sempre entram no final (maior `ordem` + 1).
- Reativar/desativar via `ativo` (soft toggle) — exclusão é definitiva, mesmo padrão de "excluir" já usado no resto do app (anexos, clientes, etc.).
- Mexer na tabela `app_settings`/comunicado ou em `AgendaPessoal` — só a seção de Links Úteis muda.
- Qualquer setor específico — `links_rapidos` continua global, compartilhado entre todos os setores.

## Design

### Cards sem ícone

Em `components/fiscal/LinksRapidos.tsx`, cada card deixa de renderizar a caixa de favicon (`<img src="https://www.google.com/s2/favicons...">`) e o `<svg>` de seta/link externo. Sobra só `link.titulo` (texto principal) e o domínio derivado da URL (texto pequeno, como já é hoje) — sem nenhum elemento visual além de texto.

### Edição inline, só pra admin

`app/(comum)/intranet/page.tsx` passa a buscar `profile.role` do usuário logado (mesmo padrão usado em outras páginas: `supabase.from('profiles').select('role').eq('id', user.id).single()`) e repassa `isAdmin` pro componente.

`LinksRapidos` ganha um botão "Editar links" (só renderiza se `isAdmin`). Ao ativar o modo de edição:
- Cada card existente vira um miniformulário inline: campos de texto pra Título e URL, botão Salvar e botão Excluir (com confirmação, mesmo padrão `confirm()` já usado em outros "excluir" do app).
- Um card adicional "+ Novo link" aparece no final da grade, com os mesmos dois campos e um botão Adicionar.
- Fora do modo de edição, os cards continuam clicáveis normalmente (abrem o link numa aba nova) pra qualquer usuário, admin ou não.

### Server actions novas

`app/(comum)/intranet/actions.ts` (arquivo novo):
- `criarLink(titulo: string, url: string)` — insere com `ordem` = maior `ordem` atual + 1 (ou 0 se a tabela estiver vazia).
- `atualizarLink(id: string, titulo: string, url: string)` — atualiza só título/URL, não mexe em `ordem`/`ativo`.
- `excluirLink(id: string)` — delete definitivo.

As três seguem o padrão já usado no projeto: `getAuthenticatedAdmin()` (service role) + checagem explícita de `profiles.role === 'admin'` do usuário chamador antes de mutar (mesmo padrão de `criarUsuario`/`atualizarPerfil` em `app/fiscal/parametros/actions.ts`). `revalidatePath('/intranet')` ao final de cada uma.

### Erros e casos de borda

- Título ou URL vazios: botão Salvar/Adicionar fica desabilitado até os dois campos terem conteúdo (mesmo padrão de validação simples já usado em outros formulários do app, ex: criar tarefa/tipo).
- URL sem `http(s)://`: `getDomain()` já trata isso hoje (adiciona `https://` antes de tentar `new URL()`) — mantido como está, nenhuma mudança na função existente.
- `logo_url` (coluna que já existia mas nunca foi lida em lugar nenhum, nem antes desta mudança) continua no schema, sem uso — não faz parte do formulário novo, não é exibida em lugar nenhum.

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano (logar como admin, entrar em modo de edição, criar um link de teste, editar o título dele, excluir, confirmar que um usuário não-admin não vê o botão "Editar links" e os cards continuam clicáveis normalmente).
