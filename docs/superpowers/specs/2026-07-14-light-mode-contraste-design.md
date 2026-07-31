# Contraste no Light Mode + Modal da Agenda

## Contexto

Dois problemas de tema reportados pelo usuário:

1. No modo claro (`:root.light`), textos secundários ficam claros demais / lavados, dificultando a leitura.
2. O modal da Agenda Pessoal (Intranet) permanece com fundo escuro mesmo com o modo claro ativo.

## Causa raiz

### 1. Contraste no light mode

`app/globals.css` define os temas assim:

```css
:root {
  --bg-page: #111e3a;
  --bg-surface: #162444;
  --bg-surface-2: #0b1019;
  --fg: #ffffff;
  --accent: #00CCEB;
  --accent-hover: #00b3d4;
}

:root.light {
  --bg-page: #f4f6fb;
  --bg-surface: #ffffff;
  --bg-surface-2: #eef1f7;
  --fg: #111e3a;
  --accent: #00A8C4;
  --accent-hover: #008fac;
}
```

O app inteiro usa a classe utilitária `text-[var(--fg)]/NN` (opacidade do Tailwind sobre `--fg`) para texto secundário/terciário — 251 ocorrências em 36 arquivos, com NN variando entre `15` e `80`. Essas opacidades foram calibradas visualmente para o modo escuro, onde `--fg` é branco puro: mesmo em opacidades baixas (ex: `/20`), o branco sobre o fundo azul-marinho ainda gera contraste aceitável.

No modo claro, `--fg` vira `#111e3a` (azul-marinho bem escuro). A mesma opacidade baixa sobre um fundo claro (`--bg-page: #f4f6fb` / `--bg-surface: #ffffff`) produz uma cor final muito mais próxima do fundo (cinza-azulado claro), porque a matemática de mistura por opacidade não preserva contraste simetricamente entre fundos claros e escuros. Resultado: texto secundário quase ilegível no modo claro.

### 2. Modal da Agenda

`components/fiscal/AgendaPessoal.tsx`, linhas 268 e 339, usam `bg-[#0f1623]` (hex fixo) em vez de `bg-[var(--bg-surface)]` nos dois modais (detalhe do dia e formulário de compromisso). Por serem cor fixa, não respondem à troca de tema.

## Escopo

- Corrigir os 2 modais da Agenda para usar `bg-[var(--bg-surface)]`.
- Adicionar um bloco de CSS em `app/globals.css`, sob o seletor `:root.light`, que sobrescreve as 11 variantes de opacidade usadas (`/15` a `/80`) para produzir texto mais escuro/legível apenas no modo claro. O modo escuro permanece inalterado.

## Fora de escopo

- Refatorar as 251 ocorrências individualmente para uma escala semântica própria (`--fg-muted-1`, etc.) — pode ser considerado depois se o override global não for suficiente para casos específicos.
- Alterar as cores de status fixas da Agenda (`--accent`, verde, cinza, âmbar dos badges "Pendente/Concluído/Cancelado") — não fazem parte do bug de tema, são intencionalmente fixas.

## Detalhes de implementação

### 1. `components/fiscal/AgendaPessoal.tsx`
Trocar `bg-[#0f1623]` por `bg-[var(--bg-surface)]` nas linhas 268 e 339.

### 2. `app/globals.css`
Adicionar, após o bloco `:root.light` existente, um override de contraste:

```css
:root.light .text-\[var\(--fg\)\]\/15 { color: color-mix(in oklab, var(--fg) 55%, transparent); }
:root.light .text-\[var\(--fg\)\]\/20 { color: color-mix(in oklab, var(--fg) 58%, transparent); }
:root.light .text-\[var\(--fg\)\]\/25 { color: color-mix(in oklab, var(--fg) 60%, transparent); }
:root.light .text-\[var\(--fg\)\]\/30 { color: color-mix(in oklab, var(--fg) 63%, transparent); }
:root.light .text-\[var\(--fg\)\]\/35 { color: color-mix(in oklab, var(--fg) 66%, transparent); }
:root.light .text-\[var\(--fg\)\]\/40 { color: color-mix(in oklab, var(--fg) 68%, transparent); }
:root.light .text-\[var\(--fg\)\]\/45 { color: color-mix(in oklab, var(--fg) 70%, transparent); }
:root.light .text-\[var\(--fg\)\]\/50 { color: color-mix(in oklab, var(--fg) 72%, transparent); }
:root.light .text-\[var\(--fg\)\]\/60 { color: color-mix(in oklab, var(--fg) 76%, transparent); }
:root.light .text-\[var\(--fg\)\]\/70 { color: color-mix(in oklab, var(--fg) 80%, transparent); }
:root.light .text-\[var\(--fg\)\]\/80 { color: color-mix(in oklab, var(--fg) 85%, transparent); }
```

Cada linha mantém a mesma hierarquia relativa (tons mais opacos continuam mais escuros que os menos opacos) mas eleva o piso de legibilidade no modo claro. A implementação precisa primeiro confirmar, inspecionando o CSS gerado pelo Tailwind v4 (ex: build local ou devtools), que a sintaxe de opacidade arbitrária realmente compila para `color-mix(in oklab, var(--fg) NN%, transparent)` — se o formato gerado for diferente, ajustar a sintaxe do override para bater exatamente com o seletor e a propriedade gerados, mantendo os mesmos 11 níveis e valores-alvo de porcentagem.

Como o seletor `:root.light .text-\[var\(--fg\)\]\/NN` tem mais especificidade que a classe gerada pelo Tailwind (`.text-\[var\(--fg\)\]\/NN` sozinha), o override vence independente da ordem no arquivo — mas ainda assim deve ficar depois do `@import "tailwindcss"` por clareza.

## Testes / verificação

- Alternar para modo claro em páginas com bastante texto secundário (ex: Parcelamentos, Relatórios) e confirmar que os textos com opacidade baixa ficam legíveis contra fundo claro, sem perder a hierarquia visual entre níveis.
- Alternar de volta para modo escuro e confirmar que nada mudou visualmente (override só se aplica sob `:root.light`).
- Abrir a Agenda Pessoal na Intranet em modo claro, abrir o modal de um dia e o modal de novo/editar compromisso, confirmar que o fundo agora é claro (`--bg-surface`) e não mais o hex fixo escuro.
