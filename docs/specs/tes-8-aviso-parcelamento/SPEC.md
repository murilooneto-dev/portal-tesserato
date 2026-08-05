# SPEC — Aviso de "Cliente possui parcelamento" na ficha do cliente

> Issue: TES-8 · Setor: Fiscal · Status do documento: **READY**
> Substitui o SPEC anterior (`docs/specs/tes-8-tarefa-parcelamento/SPEC.md`), marcado como obsoleto após mudança de escopo do cliente.

# Resumo Executivo

A ficha do cliente no setor Fiscal (`/fiscal/clientes/[id]`) deve exibir um **aviso** informando que aquele cliente **possui parcelamento(s)** cadastrado(s) na tela Parcelamentos. Quando o cliente tiver parcelamento em mais de um órgão/local, o aviso deve **listar os locais** (ex.: "Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)").

É um recurso **somente leitura**: não cria, altera nem sincroniza dados — apenas apresenta, na ficha, informação que já existe na tabela de parcelamentos. A forma de apresentação (badge, banner, destaque) fica a critério da equipe de design/desenvolvimento.

# Objetivo

Dar visibilidade imediata, na ficha do cliente, de que ele possui parcelamento(s) e de em quais locais/órgãos, sem que o usuário precise abrir a tela de Parcelamentos.

# Problema

Hoje a informação de que um cliente tem parcelamento vive apenas na tela Parcelamentos. Quem abre a ficha do cliente não tem sinal visual dessa condição, o que dificulta o acompanhamento e exige navegação extra.

# Escopo

- Exibir um aviso na ficha do cliente **quando** o cliente possuir ao menos um parcelamento vinculado.
- Listar os **locais/órgãos** dos parcelamentos do cliente no aviso (distintos, sem repetição).
- Não exibir nada quando o cliente não possui parcelamento.

# Fora do Escopo

- Qualquer criação/edição/sincronização de tarefas ou de datas (recurso anterior, **cancelado**).
- Parcelamentos de **empresa avulsa** (não têm cliente cadastrado — não há ficha onde exibir o aviso).
- Alterações na tela de Parcelamentos.
- Definição da forma visual exata do aviso e de tecnologia (delegado à equipe / etapa de Arquitetura/Design).
- Setores fora do Fiscal (a tela Parcelamentos é do Fiscal).

# Usuários

- **Operador do Fiscal** e **Administrador do Fiscal**, ao abrir a ficha de um cliente.

# Perfis de Acesso

Sem novos perfis. O aviso respeita as mesmas regras de acesso já aplicadas à ficha do cliente e aos parcelamentos: o usuário só vê o aviso de clientes/parcelamentos que já pode visualizar.

# Fluxos do Sistema

## Fluxo 1 — Cliente com parcelamento
1. Usuário abre a ficha do cliente.
2. O sistema verifica se existe parcelamento vinculado ao cliente.
3. Existindo, exibe o aviso com a lista dos locais/órgãos distintos. Ex.: "Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)".

## Fluxo 2 — Cliente sem parcelamento
1. Usuário abre a ficha do cliente.
2. Não há parcelamento vinculado → **nenhum aviso** é exibido.

# Funcionalidades

1. **Detecção** de que o cliente possui parcelamento (a partir dos dados existentes da tela Parcelamentos).
2. **Exibição do aviso** na ficha do cliente, com o texto base "Cliente Possui Parcelamento" e a lista dos locais entre parênteses quando houver.

# Regras de Negócio

- **RN01 — Condição do aviso**: o aviso aparece se, e somente se, existir ao menos um parcelamento vinculado ao cliente. Sem parcelamento, nenhum aviso.
- **RN02 — Vínculo cliente↔parcelamento**: usa o mesmo vínculo já existente hoje — o parcelamento se liga ao cliente pelo **nome da empresa** (e CNPJ), como já ocorre na tela Parcelamentos. Somente parcelamentos **não avulsos** (`empresa_avulsa = false`) contam.
- **RN03 — Origem dos "locais"**: cada parcelamento tem uma **seção** (órgão/local). Os "locais" listados no aviso derivam das seções distintas dos parcelamentos daquele cliente. Rótulos curtos propostos por seção existente (podem ser ajustados pela equipe sem impacto de escopo):
  - `RECEITA FEDERAL - ECAC` → **Ecac**
  - `PGFN - ECAC` → **PGFN**
  - `SEFAZ - PARCELAMENTO MULTA AUTONOMA` → **SEFAZ**
  - `SEFAZ - PARCELAMENTOS` → **SEFAZ**
  - `FGTS DIGITAL` → **FGTS Digital**
- **RN04 — Locais distintos**: locais repetidos são exibidos uma única vez (ex.: dois parcelamentos SEFAZ → "SEFAZ" aparece uma vez).
- **RN05 — Um só local**: com um único local, o aviso continua exibindo esse local entre parênteses (ex.: "Cliente Possui Parcelamento (Ecac)").
- **RN06 — Empresa avulsa**: parcelamentos avulsos ficam fora — não têm cliente cadastrado e, portanto, não geram aviso em nenhuma ficha.

# Integrações

Nenhuma. Recurso interno de leitura sobre dados já existentes no portal.

# Requisitos Não Funcionais

- **Somente leitura**: o recurso não escreve nem altera dados.
- **Consistência**: o aviso reflete o estado atual dos parcelamentos do cliente.
- **Não regressão**: fichas de clientes sem parcelamento continuam exatamente como hoje.
- **Acessibilidade/legibilidade**: o aviso deve ser claramente perceptível na ficha (forma a definir pela equipe).

# Critérios de Aceite

1. Cliente com um parcelamento não avulso exibe o aviso "Cliente Possui Parcelamento (<local>)".
2. Cliente com parcelamentos em múltiplos órgãos exibe todos os locais distintos entre parênteses (ex.: "Cliente Possui Parcelamento (Ecac, PGFN, SEFAZ)").
3. Cliente com dois parcelamentos do mesmo órgão exibe esse órgão uma única vez.
4. Cliente sem nenhum parcelamento vinculado **não** exibe aviso.
5. Parcelamento de empresa avulsa não gera aviso em nenhuma ficha.
6. O recurso não altera dados de parcelamento nem da ficha.

# Premissas

- O vínculo entre parcelamento e cliente é por **nome da empresa** (e CNPJ), conforme já implementado hoje na tela Parcelamentos.
- Cada parcelamento pertence a uma **seção** que identifica o órgão/local.
- O recurso se limita ao setor Fiscal.

# Riscos

- **R1 — Vínculo por nome**: como o vínculo é por nome/CNPJ (e não por chave), divergência de grafia ou renomeação pode fazer um parcelamento não ser reconhecido para a ficha. Baixo impacto (recurso apenas informativo), mas convém a equipe de Arquitetura considerar.

# Recomendações

- Sugestão (não decisão) de apresentação: um **badge/etiqueta de destaque** próximo ao cabeçalho da ficha, com os locais entre parênteses — leve e coerente com os selos já usados na ficha (regime, responsável, município). Decisão final delegada à equipe, conforme o cliente autorizou.

---

STATUS: READY

ARTEFATO GERADO: docs/specs/tes-8-aviso-parcelamento/SPEC.md

PRÓXIMA ETAPA: Arquitetura
