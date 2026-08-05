# FRONTEND — Aviso de "Cliente possui parcelamento" na ficha do cliente

> Issue: TES-8 · Setor: Fiscal · Base: SPEC.md, ARCHITECTURE.md e DESIGN.md (todos READY) em `docs/specs/tes-8-aviso-parcelamento/`.

# Estrutura implementada

Implementação estritamente aditiva sobre a ficha do cliente já existente, sem novo backend (rota/tabela/migration), conforme decidido pela Arquitetura:

- `lib/parcelamentos-aviso.ts` — mapa fechado seção→local, função pura de derivação e query read-only.
- `components/fiscal/ClienteParcelamentoAviso.tsx` — badge de apresentação.
- `app/fiscal/clientes/[id]/page.tsx` — Server Component da ficha, alterado para buscar e renderizar o aviso.

# Componentes

## `ClienteParcelamentoAviso` (novo)

`components/fiscal/ClienteParcelamentoAviso.tsx` — Server Component de apresentação puro (sem estado).

- Props: `{ locais: string[] }`.
- `locais.length === 0` → retorna `null` (RN01 / não regressão).
- Caso contrário renderiza um selo âmbar: `inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-0.5 whitespace-normal`, com ícone `AlertTriangle` (`lucide-react`, `size={13}`, `aria-hidden="true"`) e texto `Cliente Possui Parcelamento (${locais.join(', ')})`, seguindo a especificação visual do DESIGN.md.

# Telas

## Ficha do Cliente (`/fiscal/clientes/[id]`)

Único ponto de integração. O selo entra como último item da linha de selos existente no cabeçalho (`flex gap-2 mt-2 flex-wrap`), depois do selo de município — sem alterar posição, ordem ou estilo dos selos neutros (regime, atividade, responsável, município).

# Rotas

Nenhuma rota nova. Nenhuma navegação nova. O selo não é clicável.

# Integrações

- `lib/parcelamentos-aviso.ts` → `buscarLocaisParcelamentoDoCliente(supabase, cliente)`: query Supabase `select('secao')` em `parcelamentos`, filtrando `empresa_avulsa = false` e `eq('empresa', cliente.nome)` (RN02/RN06), disparada dentro do `Promise.all` já existente na página junto às consultas de `usuariosFiscal`/`atividadeTemplates`, para não somar latência sequencial (conforme recomendação da Arquitetura).
- Nenhuma chamada HTTP nova, nenhum Route Handler, nenhuma Server Action — leitura direta no Server Component, herdando a RLS de `parcelamentos` já existente.

# Estados

| Estado | Condição | Renderização |
|---|---|---|
| Sem parcelamento | `locais.length === 0` | Nada é renderizado — ficha idêntica à anterior ao recurso. |
| Com parcelamento — 1 local | `locais.length === 1` | `Cliente Possui Parcelamento (Ecac)`. |
| Com parcelamento — múltiplos locais | `locais.length > 1` | `Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)`, na ordem canônica `ORDEM_LOCAIS`. |

Sem estado de loading (dado já resolvido no servidor antes do HTML) e sem estado de erro visível — se a query falhar, `data` chega `null`/vazio e `locaisDoParcelamento` devolve `[]`, degradando silenciosamente para "sem aviso" (não derruba a ficha).

`locaisDoParcelamento(rows)`: aplica `SECAO_PARA_LOCAL`, distingue via `Set`, ordena pelos canônicos de `ORDEM_LOCAIS` primeiro e acrescenta ao fim qualquer seção fora do mapa como fallback (usando a própria `secao` como rótulo — seções desconhecidas nunca somem silenciosamente, conforme R2 do ARCHITECTURE.md).

# Dependências

Nenhuma dependência nova. Reaproveitado `lucide-react` (`AlertTriangle`), já presente no projeto.

# Observações Técnicas

- Segui o mapa e a ordem canônica exatamente como definidos no ARCHITECTURE.md (`SECAO_PARA_LOCAL`, `ORDEM_LOCAIS`), sem alterar regras de negócio.
- O vínculo cliente↔parcelamento usa `eq('empresa', cliente.nome)` (RN02) — trocado de `ilike` para `eq` após recomendação do Code Review (M1): como `empresa`, para parcelamentos não avulsos, é sempre uma cópia exata de `clientes.nome` (seleção por dropdown, nunca texto livre), `eq` cobre a mesma regra sem o risco de `%`/`_` serem interpretados como wildcards do Postgres. O reforço opcional por CNPJ mencionado como observação para o Product Analyst não foi implementado por não fazer parte do contrato READY da Arquitetura — permanece registrado como decisão em aberto, não como escopo desta implementação.
- Validado com `tsc --noEmit`, `next build` (Next.js 16 / Turbopack) e `eslint` — todos sem erros.
- Não foi possível validar visualmente em navegador nesta sessão (sem ambiente com credenciais Supabase/dados de cliente para renderizar a ficha); a implementação segue rigorosamente as classes Tailwind e o comportamento especificados no DESIGN.md, já validados nos dois temas em `AgendaPessoal.tsx`, citado como referência no próprio documento de design.

# Pendências

Nenhuma pendência bloqueante. Recurso implementado integralmente conforme SPEC/ARCHITECTURE/DESIGN.

---

STATUS: READY

ARTEFATO GERADO: FRONTEND.md

IMPLEMENTAÇÃO: CONCLUÍDA
