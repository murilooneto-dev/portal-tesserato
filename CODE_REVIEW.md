# Resumo da Revisão

Revisão técnica do aviso "Cliente Possui Parcelamento" na ficha do cliente (TES-8), PR #52 (`agent/frontend-engineer/d01ee17b` → `dev`). Escopo revisado: `lib/parcelamentos-aviso.ts`, `components/fiscal/ClienteParcelamentoAviso.tsx`, `app/fiscal/clientes/[id]/page.tsx`, contra `docs/specs/tes-8-aviso-parcelamento/{SPEC,ARCHITECTURE,DESIGN}.md`.

Recurso corretamente escopado como somente leitura: nenhuma escrita, rota, migration ou dependência nova. A integração no Server Component é aditiva (uma query a mais dentro do `Promise.all` já existente) e o componente de apresentação é puro, sem estado. A implementação segue de perto o contrato de ARCHITECTURE.md/DESIGN.md. O único problema material é a escolha de `ilike` para o vínculo cliente↔parcelamento, que introduz um risco de correspondência incorreta não coberto nem pelo SPEC nem pela Arquitetura — corrigível com uma troca de operador, sem redesenho.

# Pontos Positivos

- **Somente leitura de fato**: nenhum `insert`/`update`/`delete` em nenhum dos três arquivos tocados; `page.tsx` permanece um Server Component sem efeito colateral novo, e as `'use server'` actions pré-existentes na página não foram alteradas.
- **Query paralela corretamente integrada**: `buscarLocaisParcelamentoDoCliente` foi adicionada dentro do `Promise.all` já existente (`app/fiscal/clientes/[id]/page.tsx:109-113`), junto de `usuariosFiscal`/`atividadeTemplates`, sem introduzir latência sequencial nem um novo `await` solto no meio da função.
- **`empresa_avulsa = false` correto e seguro**: a coluna é `boolean not null default false` (`supabase/migrations/006_empresa_avulsa_parcelamentos.sql`), então `.eq('empresa_avulsa', false)` (RN06) não tem risco de `null` escapando do filtro.
- **`locaisDoParcelamento` é pura e testável**: `Set` para distinção (RN04), `ORDEM_LOCAIS` para ordem canônica (RN05) e fallback explícito para seção fora do mapa (nunca esconde silenciosamente, conforme decisão da Arquitetura) — lógica pequena, sem efeitos colaterais, fácil de auditar em uma leitura.
- **Não regressão real**: `ClienteParcelamentoAviso` retorna `null` sem nenhum espaço reservado quando `locais.length === 0` (RN01); fichas sem parcelamento continuam byte-a-byte iguais ao que eram antes do PR.
- **Aderência ao DESIGN.md**: badge âmbar com as classes exatas especificadas, `AlertTriangle` com `aria-hidden="true"`, `whitespace-normal` no selo e reaproveitamento do `flex-wrap` já existente na linha de selos do cabeçalho — nada de layout novo, o selo entra como último item da linha 190-195 de `page.tsx` conforme combinado.
- **RLS já cobre o acesso**: `parcelamentos` tem `"Autenticados leem parcelamentos" ... for select using (auth.uid() is not null)` (`supabase/migrations/002_sync_prod_schema_dev.sql:204`), então a leitura via `createClient()` (client com cookie do usuário) do Server Component é legítima sem `service_role` e sem policy nova.
- **FRONTEND.md transparente sobre a decisão pendente**: o documento registra explicitamente que o reforço por CNPJ não foi implementado por não fazer parte do contrato READY da Arquitetura, em vez de omitir a divergência.

# Problemas Encontrados

## Críticos

Nenhum.

## Altos

Nenhum.

## Médios

### M1 — Vínculo cliente↔parcelamento via `ilike` é mais permissivo do que o necessário e sujeito a wildcard acidental

**Local:** `lib/parcelamentos-aviso.ts:26-30` — `.ilike('empresa', cliente.nome)`.

**Descrição:** para parcelamentos não avulsos, `empresa` é sempre preenchido por seleção em um `<select>` a partir da lista de `clientesCadastrados` (`app/fiscal/parcelamentos/page.tsx:458-471`), nunca por texto livre — ou seja, quando `empresa_avulsa = false`, `parcelamentos.empresa` é sempre uma cópia exata de `clientes.nome`. Isso torna `ilike` desnecessário para o casamento em si, mas os caracteres `%` e `_` em `cliente.nome` são interpretados por `ilike` como wildcards do Postgres (qualquer sequência / qualquer caractere), não como literais. Um nome de empresa contendo `%` (ex.: "100% Assessoria Contábil Ltda") ou `_` faria a consulta casar com registros de `parcelamentos.empresa` que não são uma correspondência exata — o aviso poderia aparecer com locais de um parcelamento que não é daquele cliente, ou (com `_`) casar por engano com nomes parecidos.

**Impacto:** informação incorreta exibida na ficha do cliente (falso positivo de "possui parcelamento" ou lista de locais errada) para o subconjunto de nomes de empresa que contenham `%`/`_`. Impacto por registro é baixo (recurso informativo, não bloqueia nada), mas é silencioso — ninguém percebe até comparar manualmente com a tela Parcelamentos.

**Recomendação:** trocar `.ilike('empresa', cliente.nome)` por `.eq('empresa', cliente.nome)` (ou `.ilike()` com os caracteres especiais escapados, se a case-insensitividade for realmente desejada — o que não parece ser o caso, já que o valor vem do mesmo dropdown). Como `empresa` é sempre uma cópia exata do nome selecionado para não-avulsos, `.eq()` resolve o RN02 com a mesma cobertura e sem o risco de wildcard.

## Baixos

### B1 — Correspondência por nome não reforçada por CNPJ, conforme já sinalizado pela Arquitetura

**Local:** `lib/parcelamentos-aviso.ts:22-33`.

O SPEC (RN02) descreve o vínculo como "pelo nome da empresa (e CNPJ)"; a Arquitetura optou por usar somente o nome e registrou isso como ponto em aberto para o Product Analyst confirmar (ciência, não bloqueio). A implementação seguiu a Arquitetura à risca e documentou a omissão no FRONTEND.md — correto do ponto de vista de "não inventar escopo fora do contrato READY". Mantendo o registro pedido: se um dia dois clientes distintos tiverem o mesmo nome (ou o nome mudar em `clientes` sem atualizar `parcelamentos.empresa`, já que não há FK), o aviso pode falhar silenciosamente para um dos dois. Não bloqueia esta entrega; decisão de produto pendente.

### B2 — Fallback de seção fora do mapa expõe o valor bruto de `secao` no badge

**Local:** `lib/parcelamentos-aviso.ts:16-19`, `outros = Array.from(distintos).filter(...)`.

Decisão deliberada da Arquitetura (evitar esconder seções desconhecidas em silêncio) e corretamente implementada. Registrando como o Gerente pediu: se uma seção nova e longa for cadastrada na tela Parcelamentos sem entrar em `SECAO_PARA_LOCAL` (ex.: `"SEFAZ - PARCELAMENTO MULTA AUTONOMA"` para um caso hipotético fora do mapa atual), o badge exibiria o texto integral da seção entre parênteses, quebrando a promessa de "rótulo curto" do DESIGN.md — visualmente mais poluído, mas não incorreto. `flex-wrap`/`whitespace-normal` absorvem o comprimento sem quebrar o layout, então não é um bug de renderização, só uma degradação estética aceitável.

# Recomendações

- Aplicar M1 antes de seguir para QA: é uma troca de um método (`ilike` → `eq`), sem impacto em `locaisDoParcelamento` nem no componente de apresentação, e fecha o único risco de dado incorreto identificado nesta revisão.
- B1 e B2 não bloqueiam — manter registrados para follow-up do Product Analyst/Arquitetura, conforme já sinalizado por ambos.
- QA deve cobrir a validação visual pendente (sem ambiente Supabase no runtime de implementação) e, ao testar M1 após a correção, incluir um caso com nome de empresa contendo `%` ou `_` para confirmar que o `.eq()` resolve o cenário.

# Decisão Final

Nenhum problema crítico ou alto. O único médio (M1) é uma correção pontual e de baixo risco, sem redesenho de arquitetura ou de componente — não justifica reprovar a entrega, mas deve ser corrigido antes de avançar ao QA para não propagar um defeito de correspondência de dados.

STATUS: APPROVED (com recomendação de correção do M1 antes do QA)

ARTEFATO GERADO: CODE_REVIEW.md

PRÓXIMA ETAPA: QA Engineer
