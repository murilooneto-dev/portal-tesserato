# Modo claro/escuro para o portal

## Contexto

O portal é hoje inteiramente estilizado com Tailwind usando cores fixas
espalhadas por ~36 arquivos (`bg-[#111e3a]`, `text-white/70`,
`border-white/10`, etc.), sem nenhuma variável de tema. O pedido é um botão
que alterna entre modo escuro (aparência atual) e modo claro, aplicado ao
portal inteiro.

## Escopo

Todas as páginas e componentes listados abaixo (achados via busca por
`bg-[#`, `text-white`, `border-white` em `app/` e `components/`):

```
app/auth/reset-password/page.tsx
app/fiscal/admin/page.tsx
app/fiscal/agenda/page.tsx
app/fiscal/bots/page.tsx
app/fiscal/calendario/page.tsx
app/fiscal/clientes/[id]/page.tsx
app/fiscal/conferencia/page.tsx
app/fiscal/dashboard/page.tsx
app/fiscal/ferramentas/FerramentasClient.tsx
app/fiscal/historico/page.tsx
app/fiscal/intranet/page.tsx
app/fiscal/layout.tsx
app/fiscal/parametros/ParametrosClient.tsx
app/fiscal/parcelamentos/page.tsx
app/fiscal/relatorios/page.tsx
app/fiscal/tarefas/page.tsx
app/login/page.tsx
components/auth/LoginForm.tsx
components/fiscal/AdminUsuarios.tsx
components/fiscal/AgendaPessoal.tsx
components/fiscal/BotsConfigForm.tsx
components/fiscal/CalendarioFiscal.tsx
components/fiscal/ClienteAcoes.tsx
components/fiscal/ClienteArquivos.tsx
components/fiscal/ClienteConferencia.tsx
components/fiscal/ClienteObs.tsx
components/fiscal/ClientesLista.tsx
components/fiscal/CorrigirAtividadesClient.tsx
components/fiscal/CorrigirTarefasClient.tsx
components/fiscal/DevLock.tsx
components/fiscal/EmpresaModal.tsx
components/fiscal/LinksRapidos.tsx
components/fiscal/MesSeletor.tsx
components/fiscal/Sidebar.tsx
components/fiscal/TarefaChecklist.tsx
components/fiscal/TopNav.tsx
```

Essa é a lista completa retornada pela busca; `app/fiscal/clientes/page.tsx`
não usa cores fixas diretamente (delega a UI a `ClientesLista.tsx`, já
listado acima) e por isso não precisa de alteração própria.

### Fora do escopo

- Badges de status (verde/vermelho/âmbar de "concluído", "cancelado",
  "pendente" etc.) continuam usando as classes atuais do Tailwind
  (`bg-green-500/20 text-green-300` etc.) em ambos os temas. Funcionam nos
  dois, mas não foram otimizadas pixel a pixel para fundo claro. Ajuste fica
  para uma iteração futura, se necessário.
- Preferência de tema não é salva no banco de dados — fica só no navegador
  (`localStorage`), por dispositivo.

## Paleta

Aprovada: **Neutro frio**.

| Token             | Escuro (atual, default) | Claro (novo)  |
| ------------------ | ------------------------ | -------------- |
| `--bg-page`        | `#111e3a`                | `#f4f6fb`      |
| `--bg-surface`      | `#162444`                | `#ffffff`      |
| `--bg-surface-2`    | `#0b1019`                | `#eef1f7`      |
| `--fg`              | `#ffffff`                | `#111e3a`      |
| `--accent`          | `#00CCEB`                | `#00A8C4`      |
| `--accent-hover`    | `#00b3d4`                | `#008fac`      |

`--fg` é reaproveitado tanto para texto quanto para bordas, usando os
modificadores de opacidade do Tailwind já existentes no código
(`text-[var(--fg)]/70`, `border-[var(--fg)]/10` etc.) — não precisa de um
token separado por variação de opacidade.

## Infraestrutura de tema

1. **`app/globals.css`**: define os tokens acima em `:root` (escuro,
   default) e sobrescreve em `:root.light` (claro). `body` passa a usar
   `background: var(--bg-page); color: var(--fg);`.

2. **`lib/theme.ts`** (novo arquivo): hook `useTheme()` que:
   - Lê a classe `light` presente ou não em `document.documentElement` no
     mount, para saber o tema atual (`'dark' | 'light'`).
   - Expõe `toggleTheme()`, que alterna a classe `light` em `<html>` e
     grava a escolha em `localStorage` (chave `tesserato-theme`).

3. **`app/layout.tsx`**: adiciona um `<script>` inline (antes de qualquer
   conteúdo) que lê `localStorage.getItem('tesserato-theme')` e, se for
   `'light'`, aplica `document.documentElement.classList.add('light')`
   sincronamente — evita flash do tema errado ao carregar a página. Sem
   valor salvo, nada é feito (padrão continua escuro).

## Botão de alternância

Fica em `components/fiscal/Sidebar.tsx`, próximo ao botão "Sair →". Usa
`useTheme()` e mostra o modo para o qual o clique vai mudar:

- Portal em modo claro → botão mostra ícone de lua + texto "Dark Mode".
- Portal em modo escuro → botão mostra ícone de sol + texto "Light Mode".

## Conversão das classes existentes

Trabalho mecânico por arquivo, seguindo o mapeamento:

| Padrão atual                              | Novo padrão                                  |
| ------------------------------------------ | ---------------------------------------------- |
| `bg-[#111e3a]`                              | `bg-[var(--bg-page)]`                           |
| `bg-[#162444]`                              | `bg-[var(--bg-surface)]`                        |
| `bg-[#0b1019]`                              | `bg-[var(--bg-surface-2)]`                      |
| `text-white`, `text-white/NN`               | `text-[var(--fg)]`, `text-[var(--fg)]/NN`       |
| `border-white`, `border-white/NN`           | `border-[var(--fg)]/NN`                         |
| `bg-[#00CCEB]`, `text-[#00CCEB]`, etc.      | `bg-[var(--accent)]`, `text-[var(--accent)]`... |
| `hover:bg-[#00b3d4]`                        | `hover:bg-[var(--accent-hover)]`                |

Cada arquivo listado no escopo é revisado individualmente — alguns podem
ter variações do padrão (ex. cores usadas dentro de template strings de
HTML para impressão/relatório, que não passam pelo Tailwind e precisam de
tratamento à parte ou ficam de fora por não fazerem parte da UI do
portal em si).

### Caso especial: HTML de impressão

Páginas como Parcelamentos e Relatórios geram HTML via `window.open` para
impressão (strings de template com CSS inline). Esse HTML é isolado do
portal (abre em nova aba, só para impressão em papel) e **fica fora do
escopo** — mantém sempre a paleta clara que já usa hoje para impressão,
independente do tema escolhido no portal.

## Testes / verificação

Sem testes automatizados novos (não há suíte de testes no projeto). A
verificação é manual, via navegador de preview: alternar o botão em pelo
menos 3 páginas representativas (Intranet, Clientes, Parcelamentos) e
conferir contraste/legibilidade em ambos os temas, além de confirmar que a
preferência persiste após recarregar a página.
