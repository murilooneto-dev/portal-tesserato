# ARCHITECTURE — Aviso de "Cliente possui parcelamento" na ficha do cliente

> Issue: TES-8 · Setor: Fiscal · Base: `docs/specs/tes-8-aviso-parcelamento/SPEC.md` (READY)
> O SPEC anterior (`docs/specs/tes-8-tarefa-parcelamento/SPEC.md`) está OBSOLETO e foi ignorado.

# Resumo da Arquitetura

Recurso **somente leitura** que exibe, na ficha do cliente do Fiscal (`/fiscal/clientes/[id]`), um aviso do tipo "Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)". A informação já existe hoje na tabela `parcelamentos` (a mesma da tela Parcelamentos); nada de novo é gravado, sincronizado ou migrado.

A ficha já é um **Server Component** que carrega vários dados via Supabase server client. A arquitetura escolhida **reaproveita esse mesmo padrão**: adiciona uma consulta à tabela `parcelamentos` durante o render da página e computa, no servidor, a lista de locais distintos a partir da coluna `secao`. A apresentação é um pequeno componente de badge no cabeçalho da ficha, junto aos selos já existentes (regime, atividade, responsável, município).

Nenhuma tabela nova, nenhuma migration, nenhuma rota HTTP nova. A decisão central é: **não criar backend novo** — derivar o aviso dos dados existentes no ponto onde a ficha já é montada. Isso mantém o recurso leve, coeso com o código atual e sem risco de regressão.

# Stack Tecnológica

Mantém integralmente a stack já em uso no portal (nenhuma tecnologia nova é justificada para um recurso de leitura):

- **Framework**: Next.js 16 (App Router, Server Components) — atenção ao aviso do repositório (`AGENTS.md`): esta versão tem breaking changes; consultar `node_modules/next/dist/docs/` antes de codificar.
- **Linguagem**: TypeScript.
- **UI**: React 19 + TailwindCSS v4 (variáveis de tema `var(--fg)`, `var(--accent)` etc., como no restante do Fiscal).
- **Dados**: Supabase (PostgreSQL) via `@supabase/ssr`. Leitura no servidor com `createClient()` de `lib/supabase/server.ts` (o mesmo já usado na ficha).
- **Ícones**: `lucide-react` (opcional, se o Design pedir um ícone no badge).

> Observação: a stack padrão do meu perfil (Fastify/Prisma/JWT) **não se aplica** — o projeto já é Next.js + Supabase e o recurso é uma extensão de tela existente. Introduzir outra stack seria complexidade desnecessária.

# Estrutura do Projeto

O recurso toca três camadas, todas já existentes:

1. **Domínio/derivação (lib)** — função pura que, dada a lista de parcelamentos de um cliente, devolve os locais distintos em ordem canônica. Fonte única do mapa `secao → rótulo`.
2. **Acesso a dados (na página server)** — uma query Supabase por `parcelamentos` do cliente, dentro do Server Component da ficha (padrão idêntico às demais consultas de `page.tsx`).
3. **Apresentação (componente)** — um badge client/server-agnóstico renderizado no cabeçalho da ficha quando houver ao menos um local.

Fluxo de dados (somente leitura):

```
[ficha /fiscal/clientes/[id]/page.tsx  (Server Component)]
        │  cliente = { nome, cnpj, ... }  (já carregado)
        ▼
supabase.from('parcelamentos')
   .select('secao')
   .eq('empresa_avulsa', false)
   .ilike('empresa', cliente.nome)         ← vínculo por nome (RN02)
        │  rows: [{ secao }, ...]
        ▼
locaisDoParcelamento(rows)  → ['Ecac','PGFN','SEFAZ']   (lib, puro, distinto, ordenado)
        │
        ▼
<ClienteParcelamentoAviso locais={...} />  (nada renderiza se vazio → RN01/Fluxo 2)
```

# Estrutura de Pastas

Arquivos afetados/criados (mínimo necessário):

```
lib/
  parcelamentos-aviso.ts          + NOVO — mapa secao→rótulo + locaisDoParcelamento() (função pura)
                                    + buscarLocaisParcelamentoDoCliente(supabase, cliente) (query read-only)
components/fiscal/
  ClienteParcelamentoAviso.tsx    + NOVO — badge de apresentação (recebe locais: string[])
app/fiscal/clientes/[id]/
  page.tsx                        ~ ALTERAR — 1 query + render do badge no cabeçalho
docs/specs/tes-8-aviso-parcelamento/
  ARCHITECTURE.md                 + este documento
```

Sem alterações em `app/fiscal/parcelamentos/page.tsx` (fora do escopo por SPEC).

# Banco de Dados

**Nenhuma alteração de schema.** O recurso lê a tabela `parcelamentos` já existente:

```
parcelamentos (
  id             uuid pk,
  secao          text not null,     -- origem dos "locais" (RN03)
  empresa        text not null,     -- vínculo com clientes.nome (RN02)
  empresa_avulsa boolean not null default false,  -- filtro (RN06)
  cnpj           text,              -- reforço de vínculo (opcional)
  regime, responsavel, local_tipo, tarefa, senhas, jan..dez, created_at
)
```

- Não há FK entre `parcelamentos` e `clientes`; o vínculo é **por valor de texto** (`parcelamentos.empresa` ≈ `clientes.nome`), exatamente como a tela Parcelamentos já opera (o formulário seleciona o nome a partir de `clientes` cadastrados, então na prática os valores coincidem).
- **RLS já cobre o caso**: `create policy "Autenticados leem parcelamentos" ... for select using (auth.uid() is not null)`. Qualquer usuário autenticado que já acessa a ficha pode ler `parcelamentos` — não é preciso nova policy nem `service_role`.

### Índice (recomendação opcional, não bloqueante)

Hoje existe `idx_parcelamentos_responsavel on (lower(responsavel))`, mas **não** há índice por `empresa`. Como o filtro do aviso é `ilike('empresa', nome)`, para volumes maiores recomenda-se (fora do caminho crítico deste recurso):

```sql
create index if not exists idx_parcelamentos_empresa on parcelamentos (lower(empresa));
```

Dado o volume real (dezenas/centenas de linhas) isso é otimização preventiva, não requisito.

# Modelagem Inicial

Não há entidades novas. Modela-se apenas um **tipo derivado em memória** para a camada de apresentação:

```ts
// lib/parcelamentos-aviso.ts
// Fonte única do mapeamento seção → rótulo curto (RN03).
export const SECAO_PARA_LOCAL: Record<string, string> = {
  'RECEITA FEDERAL - ECAC':            'Ecac',
  'PGFN - ECAC':                       'PGFN',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA': 'SEFAZ',
  'SEFAZ - PARCELAMENTOS':             'SEFAZ',
  'FGTS DIGITAL':                      'FGTS Digital',
}

// Ordem canônica de exibição (RN04/RN05), estável e previsível.
export const ORDEM_LOCAIS = ['Ecac', 'PGFN', 'SEFAZ', 'FGTS Digital'] as const
```

- `locaisDoParcelamento(rows)` → aplica o mapa, descarta seções não mapeadas (fallback: usar a própria `secao` como rótulo, para não perder sinal se uma seção nova surgir), **distingue** (RN04) e ordena por `ORDEM_LOCAIS`.
- O aviso é **efêmero** — recomputado a cada render; nunca persistido.

# APIs

**Nenhuma rota HTTP nova.** A leitura acontece dentro do Server Component da ficha, coerente com o padrão do projeto (a `page.tsx` já faz ~10 queries Supabase diretas, sem camada REST intermediária).

Contrato interno (funções da lib, não expostas por HTTP):

| Função | Assinatura | Efeito |
|---|---|---|
| `locaisDoParcelamento` | `(rows: { secao: string }[]) => string[]` | Pura. Rótulos distintos, ordenados. `[]` quando não há linhas. |
| `buscarLocaisParcelamentoDoCliente` | `(supabase, cliente: { nome: string; cnpj: string \| null }) => Promise<string[]>` | Faz a query read-only (`empresa_avulsa = false`, `ilike empresa`) e chama `locaisDoParcelamento`. |

Se, em iteração futura, o aviso precisar aparecer em contexto client-side sem server render, aí sim se justificaria um Route Handler `GET`; **hoje não é necessário** e não deve ser criado (YAGNI).

# Integrações

Nenhuma integração externa. Recurso 100% interno sobre dados já existentes no portal (SPEC §Integrações).

# Autenticação

Sem mudanças. A ficha já exige sessão (`supabase.auth.getUser()` → `redirect('/login')`). O aviso é renderizado dentro dessa página autenticada; não abre nenhuma superfície nova.

# Autorização

Sem novos perfis (SPEC §Perfis de Acesso). Duas camadas já garantem o correto:

- **Acesso à ficha**: quem chega em `/fiscal/clientes/[id]` já passou pelo `proxy.ts` e pelas regras do Fiscal.
- **Leitura de `parcelamentos`**: RLS `for select` para autenticados. O usuário só enxerga o aviso de clientes cuja ficha já pode abrir; e os parcelamentos lidos são os mesmos que ele já veria na tela Parcelamentos.

Não há escrita, portanto nenhuma policy de `insert/update/delete` é tocada.

# Segurança

- **Somente leitura**: a função e a página apenas fazem `select`. Sem Server Action, sem mutação, sem `service_role`.
- **Sem exposição nova**: nenhum endpoint público adicionado; a query roda no servidor sob a sessão do usuário (respeitando RLS).
- **Escape de saída**: os rótulos vêm de um **mapa fechado** no código (não de input do usuário), e o React já escapa o texto renderizado. Sem risco de XSS via `secao`.
- **Vazamento de dados**: como a leitura herda a RLS existente, não amplia o que o usuário já pode ver.

# Performance

- **+1 query leve** por render da ficha, selecionando apenas `secao` (nem todas as colunas) e filtrando por `empresa_avulsa = false` + `empresa`. Custo desprezível no volume atual.
- A query pode ser disparada **em paralelo** com as demais da página (via `Promise.all`, como já é feito para `usuariosFiscal`/`atividadeTemplates`) para não somar latência sequencial.
- Derivação (map/distinct/sort) é O(n) sobre pouquíssimas linhas, em memória.
- Índice opcional em `lower(empresa)` cobre crescimento futuro (ver §Banco de Dados).

# Escalabilidade

O recurso escala trivialmente: uma consulta pontual por ficha, sobre uma tabela pequena e de baixo crescimento (parcelamentos são poucos por cliente). Não há estado compartilhado, cache a invalidar nem job. Se no futuro o aviso for necessário em **listagens** (muitos clientes de uma vez), recomenda-se então uma agregação única (`group by empresa`) em vez de N queries — mas isso está fora do escopo atual (SPEC restringe à ficha).

# Estratégia de Deploy

Sem particularidades. Deploy padrão do portal (Vercel/Next.js, conforme `DEPLOY.md`/`vercel.json`):

- Nenhuma migration a aplicar (schema inalterado) → sem passo de banco.
- Nenhuma variável de ambiente nova.
- Alteração é aditiva e retrocompatível: fichas de clientes sem parcelamento continuam idênticas (RNF Não regressão). Rollback = reverter os arquivos, sem efeito colateral em dados.

# Dependências

- Nenhuma dependência de pacote nova.
- Depende da existência e do formato atual da tabela `parcelamentos` (colunas `secao`, `empresa`, `empresa_avulsa`, `cnpj`) e das seções listadas no SPEC (RN03).
- Depende do padrão de vínculo por nome já praticado na tela Parcelamentos.

# Riscos Técnicos

- **R1 — Vínculo por nome/CNPJ (herdado do SPEC)**: como não há FK, divergência de grafia entre `parcelamentos.empresa` e `clientes.nome` pode fazer um parcelamento não ser reconhecido. Mitigações adotadas na arquitetura: (a) comparação **case-insensitive** (`ilike`) para absorver diferenças de caixa; (b) manter o mapeamento em fonte única facilita ajuste. Reforço opcional: também casar por `cnpj` quando ambos existirem (`empresa ilike nome OR cnpj = cliente.cnpj`), reduzindo falsos negativos. Impacto residual baixo (recurso informativo).
- **R2 — Seções novas/renomeadas**: se surgir uma `secao` fora do mapa `SECAO_PARA_LOCAL`, o aviso a ignoraria. Mitigação: **fallback** exibindo a própria `secao` (ou um rótulo derivado) quando não mapeada, evitando "sumir" com parcelamento real; e centralizar o mapa para manutenção trivial.
- **R3 — Whitespace/acentuação** em `empresa` (ex.: espaços extras) pode escapar do `ilike` exato. Baixo risco no fluxo atual (nome vem de dropdown de `clientes`), mas convém `trim` na comparação se aparecerem casos.

# Recomendações para Desenvolvimento

- Implementar `locaisDoParcelamento` como **função pura** e cobrí-la com testes de unidade cobrindo os Critérios de Aceite do SPEC: 1 local, múltiplos locais, dois da mesma seção (distinto), lista vazia, seção não mapeada (fallback).
- Disparar a query de parcelamentos **em paralelo** com o `Promise.all` já existente na `page.tsx`.
- O componente `ClienteParcelamentoAviso` deve **não renderizar nada** quando `locais.length === 0` (garante Fluxo 2 / RNF Não regressão).
- Apresentação: seguir a sugestão não-vinculante do SPEC — um **badge/selo** no cabeçalho da ficha, ao lado dos selos de regime/atividade/responsável/município (linha `flex gap-2` já existente em `page.tsx`), texto base "Cliente Possui Parcelamento" + `(locais)`. **Decisão visual final é da etapa de Design.**
- Não tocar na tela Parcelamentos nem em qualquer escrita — o recurso é estritamente leitura.

# Observações para o Product Analyst

- **Vínculo por CNPJ como reforço**: o SPEC define o vínculo "por nome da empresa (e CNPJ)". A arquitetura trata o **nome** como chave primária de correspondência e propõe o **CNPJ como reforço opcional** (OR) para reduzir falsos negativos. Confirmar se o comportamento desejado quando nome e CNPJ divergem é: (a) casar por qualquer um dos dois, ou (b) exigir o nome. Assumi (a) por ser mais tolerante e alinhado ao risco R1 do próprio SPEC — sem impacto de escopo, apenas registro para ciência.
- **Seções não mapeadas**: adotei fallback exibindo a seção original quando ela não estiver no mapa de rótulos. Se a preferência for **ocultar** seções desconhecidas, avisar — é uma linha de decisão, não de escopo.

---

STATUS: READY

ARTEFATO GERADO: docs/specs/tes-8-aviso-parcelamento/ARCHITECTURE.md

PRÓXIMA ETAPA: Design da Interface
