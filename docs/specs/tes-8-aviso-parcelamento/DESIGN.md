# DESIGN — Aviso de "Cliente possui parcelamento" na ficha do cliente

> Issue: TES-8 · Setor: Fiscal · Base: `docs/specs/tes-8-aviso-parcelamento/SPEC.md` (READY) e `docs/specs/tes-8-aviso-parcelamento/ARCHITECTURE.md` (READY)
> Componente-alvo: `components/fiscal/ClienteParcelamentoAviso.tsx`, renderizado no cabeçalho de `app/fiscal/clientes/[id]/page.tsx`.

# Visão Geral da Interface

O recurso adiciona um único elemento visual — um selo de aviso — ao cabeçalho já existente da ficha do cliente (`/fiscal/clientes/[id]`). Não há tela nova, não há navegação nova e não há interação nova: é um indicador **somente leitura**, que aparece ou não aparece conforme os dados do cliente.

O cabeçalho da ficha já exibe uma linha de selos neutros (regime, atividade, responsável, município). O aviso de parcelamento entra nessa mesma linha, mas com tratamento visual distinto — precisa **chamar atenção**, porque comunica uma condição financeira relevante do cliente (algo que o operador deve saber antes de agir), enquanto os selos existentes são apenas metadados descritivos.

# Perfil dos Usuários

- **Operador do Fiscal**: abre a ficha do cliente no dia a dia para executar tarefas do mês. Precisa notar o aviso rapidamente, sem precisar procurar.
- **Administrador do Fiscal**: mesma ficha, mesmas permissões de leitura do aviso; sem diferença de apresentação por papel (SPEC §Perfis de Acesso — sem novos perfis).

Ambos os perfis já possuem acesso à ficha; o aviso não introduz controle de acesso novo e é visível para quem já vê a ficha.

# Fluxo de Navegação

Não há fluxo novo. O aviso é um estado visual dentro do fluxo já existente:

```
[Lista de clientes] → abre ficha → [Ficha do cliente /fiscal/clientes/[id]]
                                          │
                                          ├─ possui parcelamento → selo visível no cabeçalho
                                          └─ não possui parcelamento → nada é renderizado (ficha idêntica a hoje)
```

O selo não é clicável e não navega para lugar nenhum nesta versão (fora de escopo por SPEC — "Alterações na tela de Parcelamentos" está fora do escopo). O usuário que quiser ver o detalhe dos parcelamentos continua indo à tela Parcelamentos pelo menu, como hoje.

# Estrutura das Telas

Uma única tela é afetada:

## Ficha do Cliente (`/fiscal/clientes/[id]`)

Estrutura atual do cabeçalho (não muda):

```
← [Nome do cliente]                              [Mês/Ano]  [Ações]
   CNPJ
   [Regime] [Atividade] [Responsável] [Município/UF]
```

Estrutura com o aviso (aditiva — os selos existentes não mudam de posição, ordem ou estilo):

```
← [Nome do cliente]                              [Mês/Ano]  [Ações]
   CNPJ
   [Regime] [Atividade] [Responsável] [Município/UF] [🔶 Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)]
```

O selo de parcelamento entra **depois** dos selos neutros existentes, na mesma linha `flex gap-2 flex-wrap` — em telas estreitas ele quebra para a linha seguinte junto com os demais, sem layout especial.

# Descrição de Cada Tela

## Ficha do Cliente — Cabeçalho com aviso de parcelamento

**Objetivo da tela (recorte relevante a este recurso):** dar ao operador, no primeiro olhar sobre a ficha, o sinal de que aquele cliente tem parcelamento(s) ativo(s) e em quais órgãos, sem precisar abrir outra tela.

**Conteúdo:**
- Selo com ícone de alerta + texto "Cliente Possui Parcelamento" + lista de locais entre parênteses, ex.: `Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)`.
- Com um único local: `Cliente Possui Parcelamento (Ecac)` (RN05).
- Sem parcelamento: o componente não renderiza nada — nenhum espaço reservado, nenhum placeholder (RN01, RNF Não regressão).

**Interações:** nenhuma. O selo não é clicável, não tem hover state funcional (pode ter um hover puramente decorativo/sutil por consistência com o restante da UI, mas sem tooltip obrigatório nesta versão), não abre modal, não navega.

**Regras de exibição (refletindo SPEC):**
- RN01 — aparece se, e somente se, houver ao menos um local (`locais.length > 0`).
- RN04 — locais distintos, sem repetição.
- RN05 — um só local ainda aparece entre parênteses.
- RN06 — parcelamento de empresa avulsa nunca chega a este componente (já filtrado na camada de dados).

# Componentes

## `ClienteParcelamentoAviso` (novo)

Selo de aviso para uso no cabeçalho da ficha do cliente.

**Props:** `{ locais: string[] }` (contrato já definido pela Arquitetura — array de rótulos distintos e ordenados, ex.: `['Ecac', 'PGFN', 'SEFAZ']`).

**Comportamento:**
- `locais.length === 0` → retorna `null` (não renderiza nada, sem espaço reservado).
- `locais.length >= 1` → renderiza o selo com o texto `Cliente Possui Parcelamento (${locais.join(', ')})`.
- É um componente de apresentação puro — sem estado, sem `useState`/`useEffect`, sem necessidade de ser Client Component. Pode ser Server Component (roda dentro da própria `page.tsx`, que já é Server Component).

**Muitos locais (3+):** o texto pode ficar longo (ex.: "Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ, FGTS Digital)"). Não truncar nem esconder locais — a lista completa é a informação que o SPEC pede. Tratamento visual:
- O selo tem `max-width` implícito pelo container flex (`flex-wrap`), então ele **quebra de linha inteiro** junto com os outros selos quando não cabe — nunca corta o próprio texto do selo no meio.
- Em telas muito estreitas (mobile), se o texto do selo sozinho ultrapassar a largura da tela, permitir `whitespace-normal` (quebra de linha dentro do próprio selo) em vez de overflow horizontal — ver §Responsividade.

## Selos existentes (regime, atividade, responsável, município) — inalterados

Reaproveitados como referência de padrão visual (não fazem parte do escopo de alteração), servem de baseline de estilo "neutro" para contraste com o selo de aviso, que deve ser visualmente **mais forte** que eles.

# Design System

O portal já usa um design system consistente baseado em tokens CSS (`var(--fg)`, `var(--accent)`, `var(--bg-page)`, `var(--bg-surface)`) com tema claro/escuro, mais uma paleta fixa Tailwind (`amber-*`, `red-*`) para estados de alerta que não dependem do tema. O aviso de parcelamento segue esse padrão já estabelecido, não introduz cor nova.

**Padrão de selo neutro (já existente, referência):**
```
text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full
```
Usado para regime, atividade, responsável, município — informação descritiva, sem urgência.

**Padrão de alerta âmbar (já existente no portal, ex. `components/fiscal/AgendaPessoal.tsx` — bloco "Lembretes" e selo de compromisso):**
```
border border-amber-500/40 bg-amber-500/8   (bloco de destaque)
bg-amber-500/20 text-amber-400 border border-amber-500/30   (selo/pill dentro do bloco)
```
Esse é o vocabulário de "atenção" que o portal já usa — não é erro/perigo (vermelho), é **algo que o usuário precisa notar**, o mesmo tom do aviso de parcelamento.

**Especificação do selo `ClienteParcelamentoAviso` (Tailwind):**

```
inline-flex items-center gap-1.5
text-xs font-medium
text-amber-400
bg-amber-500/15
border border-amber-500/30
rounded-full
px-2.5 py-0.5
```

Diferenças propositais em relação ao selo neutro:
- `font-medium` (em vez de peso normal) — leve ênfase tipográfica.
- `border` visível (os selos neutros não têm borda) — reforça o contorno do selo sem escurecer o texto.
- Cor âmbar em vez de `var(--fg)/50` — sinaliza "atenção" sem ser tão agressivo quanto vermelho (que o portal reserva para prioridade/erro, ex. `text-red-400` em `AgendaPessoal.tsx`).

**Ícone:** um ícone pequeno de alerta reforça a leitura visual antes mesmo do texto ser lido. Usar `lucide-react` (já dependência do projeto), ícone `AlertTriangle` (ou `CircleAlert`, qualquer um dos dois é aceitável — escolher o que já estiver mais presente no projeto no momento da implementação), tamanho `12px`–`14px`, cor herdada (`text-amber-400`), `shrink-0`. Alternativa aceitável sem dependência de ícone: caractere `🔶` ou `⚠` — o portal já usa emoji como ícone leve em outros pontos (`🔔` em `AgendaPessoal.tsx`), então isso é consistente com o padrão do projeto e não é obrigatório usar `lucide-react`. **Decisão do Frontend Engineer**, ambas são válidas; `lucide-react` é a opção preferida por ficar nítido em qualquer densidade de tela.

**Não usar:**
- Vermelho (`red-*`) — reservado a prioridade/erro/exclusão no portal; parcelamento não é uma falha, é uma condição a observar.
- `var(--accent)` (ciano) — reservado a estado "atual/selecionado" (ex. mês atual no histórico, item ativo na sidebar); usá-lo aqui confundiria a leitura de "isto está selecionado" com "isto é um alerta".
- Preenchimento sólido forte (ex. `bg-amber-500` sem opacidade) — destoaria do restante da UI, que usa sempre tons translúcidos (`/8`, `/15`, `/20`) sobre o fundo escuro/claro do tema.

# Responsividade

O selo participa do mesmo container `flex gap-2 mt-2 flex-wrap` que já envolve os selos existentes — nenhum layout novo é necessário.

- **Desktop (≥768px):** todos os selos, incluindo o de parcelamento, ficam em uma ou duas linhas conforme o espaço; comportamento já existente e inalterado.
- **Mobile (<768px):** o `flex-wrap` já garante que os selos quebrem para novas linhas. O selo de parcelamento, por ter texto potencialmente mais longo (múltiplos locais), deve usar `whitespace-normal` (não `whitespace-nowrap`) para permitir que o próprio texto quebre em mais de uma linha dentro do selo em telas muito estreitas, em vez de forçar scroll horizontal na página.
- Nenhum breakpoint novo é necessário; o comportamento herda o container já responsivo da ficha (`max-w-4xl mx-auto p-8`).

# Acessibilidade

- **Contraste:** `text-amber-400` sobre `bg-amber-500/15` (com fundo real da página por trás, `--bg-page` claro ou escuro) mantém leitura clara nos dois temas — mesmo padrão de cor já usado e validado em `AgendaPessoal.tsx` para os dois modos (claro/escuro já implementados no portal).
- **Semântica:** o selo é texto simples, não é um botão nem um link — não deve receber `role="button"`, `tabIndex` ou cursor de clique, evitando expectativa falsa de interação.
- **Leitores de tela:** o texto do selo já é autoexplicativo (`Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)`), sem necessidade de `aria-label` adicional. Se o ícone for implementado via `lucide-react` (SVG), marcar o ícone com `aria-hidden="true"` para não duplicar leitura antes do texto.
- **Não depende de cor isoladamente:** a informação central ("possui parcelamento" + locais) está no texto, não apenas na cor âmbar — quem não distingue cor ainda lê a mensagem completa.
- **Ordem de leitura:** o selo entra depois dos demais selos na ordem do DOM, então um leitor de tela percorre regime → atividade → responsável → município → aviso de parcelamento, condizente com a ordem visual.

# Validações Visuais

Não se aplica: o recurso é **somente leitura**, sem formulário, sem input do usuário e sem Server Action (SPEC §Requisitos Não Funcionais — "Somente leitura"; ARCHITECTURE §Segurança — "sem Server Action, sem mutação"). Não há campo a validar.

A única "validação" é de dados na camada de derivação (já coberta pela Arquitetura): seções não mapeadas usam fallback (exibem a própria seção) em vez de quebrar a renderização — isso é comportamento de dados, não de UI, mas garante que o selo nunca fique inconsistente (ex.: "Cliente Possui Parcelamento ()" vazio nunca deve acontecer, porque o componente já retorna `null` quando `locais.length === 0`).

# Feedbacks ao Usuário

Não há ações do usuário sobre este componente, logo não há feedback de sucesso/erro/carregamento a desenhar:

- **Sem loading state:** os dados do parcelamento chegam já resolvidos no Server Component (a query roda no servidor antes do HTML ser enviado — ARCHITECTURE §Performance), então não existe um estado "carregando aviso..." no cliente.
- **Sem estado de erro visível:** se a query de parcelamentos falhar no servidor, o comportamento correto é degradar silenciosamente para "sem aviso" (equivalente a `locais = []`), nunca quebrar a ficha inteira nem exibir uma mensagem de erro no lugar do selo — a ficha do cliente é informação crítica do dia a dia e não pode ficar indisponível por causa de um selo informativo.

# Estados da Interface

Apenas dois estados possíveis, ambos definidos pelo SPEC (Fluxo 1 e Fluxo 2):

| Estado | Condição | Renderização |
|---|---|---|
| **Sem parcelamento** | `locais.length === 0` | Nada é renderizado — ficha idêntica à versão sem este recurso. |
| **Com parcelamento — 1 local** | `locais.length === 1` | Selo âmbar: `Cliente Possui Parcelamento (Ecac)`. |
| **Com parcelamento — múltiplos locais** | `locais.length > 1` | Selo âmbar: `Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)`, locais na ordem canônica definida pela Arquitetura (`ORDEM_LOCAIS`). |

Não há estado de "carregando" nem de "erro" visível ao usuário (ver §Feedbacks ao Usuário) — o dado já chega pronto do servidor, e falha de leitura degrada para o estado "sem parcelamento".

# Recomendações para o Frontend Engineer

- Reaproveitar exatamente a classe de container já existente (`flex gap-2 mt-2 flex-wrap`) em `app/fiscal/clientes/[id]/page.tsx` — apenas adicionar `<ClienteParcelamentoAviso locais={locais} />` como último item da lista de selos, depois do selo de município.
- Classes sugeridas para o selo (copiar/ajustar conforme necessário no momento da implementação):
  ```
  inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-0.5
  ```
- Ícone: `<AlertTriangle size={13} className="shrink-0" aria-hidden="true" />` de `lucide-react`, ou emoji `🔶`/`⚠` como alternativa sem dependência — ambos aceitáveis, ver §Design System.
- Garantir `locais.length === 0 → return null` no topo do componente, antes de qualquer JSX — é a regra que garante RN01 e a não-regressão (SPEC RNF).
- Não adicionar `title`/tooltip obrigatório, não adicionar link, não adicionar `onClick` — o componente é puramente informativo nesta versão (fora de escopo por SPEC).
- Testar visualmente nos dois temas (claro/escuro, `root.light`) — o par `text-amber-400` + `bg-amber-500/15` já é usado hoje em `AgendaPessoal.tsx` e funciona nos dois modos; não é necessário criar uma variante de cor específica para o tema.
- Testar com 1, 2, 3 e 4 locais (todos os locais do mapa `SECAO_PARA_LOCAL`) para validar quebra de linha em mobile.

# Observações

- O SPEC deixou a forma de apresentação livre e sugeriu, de forma não vinculante, um "badge/etiqueta de destaque"; este documento formaliza essa sugestão em uma especificação visual concreta (cor âmbar, não neutra) para que o selo realmente se destaque dos demais metadados da ficha, e não apenas repita o mesmo estilo neutro já usado para regime/atividade/responsável/município — do contrário a informação passaria despercebida, contrariando o objetivo do SPEC ("dar visibilidade imediata").
- Nenhuma pendência bloqueante identificada no SPEC ou na ARCHITECTURE para a etapa de Design. As duas observações registradas pela Arquitetura para o Product Analyst (vínculo por CNPJ como reforço opcional; fallback de seção não mapeada) são decisões de dados/regra de negócio, não de interface, e não impedem a definição visual acima.

---

STATUS: READY

ARTEFATO GERADO: docs/specs/tes-8-aviso-parcelamento/DESIGN.md

PRÓXIMA ETAPA: Implementação Frontend
