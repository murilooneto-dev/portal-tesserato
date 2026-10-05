# components/ui — peças do Design System

Base do redesign (artifact https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV). Use estas peças nas telas novas e ao migrar telas antigas, em vez de montar botão, campo ou janela à mão.

| Peça | Quando usar |
|---|---|
| `Button` | Toda ação. **No máximo um `variante="primario"` por tela.** `perigo-solido` só dentro de confirmação de exclusão. |
| `IconButton` | Ação só com ícone; `rotulo` é obrigatório (leitor de tela e dica). |
| `Badge` | Situação e categoria: `ok` verde, `warn` âmbar, `dng` vermelho, `info` azul, `acc` ciano, `neu` cinza. |
| `MonthPill` | Percentual de tarefas do mês (0% vermelho, 1–99% âmbar, 100% verde; `atual` = contorno ciano). |
| `NomeCliente` | Nome do cliente em listas: uma linha, reticências, mínimo de 15 caracteres, nome inteiro no `title`. |
| `Field` + `Input`/`Select`/`Textarea` | Todo campo com rótulo ligado, ajuda e erro. |
| `Checkbox`, `Switch` | Marcar item / ligar e desligar opção. |
| `Modal`, `Drawer` | Janelas. Fecham com Esc e clique no fundo; `bloqueado` enquanto salva. |
| `useConfirmar()` | **No lugar de `window.confirm()`**: `if (await confirmar({ titulo, descricao, perigo: true })) …` |
| `useToast()` | Aviso de "salvo" ou de erro depois de uma ação. |
| `Pagina` + `CabecalhoPagina` | Moldura e cabeçalho de toda página dentro da casca (título, subtítulo, ações). |
| `Segmentado` | Escolha única entre 2–4 opções curtas (ex.: situação do compromisso). |
| `Chip` | Filtro ou opção liga/desliga em pílula (`aria-pressed`). |
| `Card`, `Aviso`, `EmptyState`, `Tabela`/`Th`/`Td` | Estrutura das telas. |

**Imports permitidos nas peças:** `react`, `react-dom`, `lucide-react`, `tailwind-merge`, arquivos de `components/ui/`.

Classes de cor disponíveis (Tailwind): `bg-page bg-surface bg-raised bg-inset`, `text-fg text-fg-2 text-fg-3`, `border-line border-line-soft`, `bg-acc text-acc-ink text-acc-text bg-acc-soft`, `text-ok/warn/danger/info` e `bg-*-soft`. Texto mínimo de 12 px.
