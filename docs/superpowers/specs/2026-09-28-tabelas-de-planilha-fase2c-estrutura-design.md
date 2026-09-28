# Tabelas de planilha — Fase 2C (gerenciar estrutura) design

Data: 2026-09-28. Caminho: arquitetural. Continuação do subsistema "tabelas de planilha" (ver `docs/superpowers/specs/2026-09-25-tabelas-de-planilha-design.md`).

## Objetivo

Dar a quem configura o setor (mesma regra de `podeAcessarPagina(profile, 'configuracoes', setor)` já usada em `criarPlanilha`) o controle sobre a **estrutura** de uma tabela de planilha já criada: adicionar, renomear, reordenar e excluir coluna; trocar o tipo de uma coluna; renomear e excluir a tabela inteira. Escopo definido no spec original (Fase 2, linha 36): "Só Admin/config do setor vê: adicionar/renomear/reordenar/excluir coluna, trocar tipo, excluir tabela. Trocar tipo converte o que der, avisa o que não converteu e nunca apaga o valor original."

Quem edita células e linhas (todo o setor) não vê nada disso — essas ações continuam restritas a quem configura o setor.

## Decisões (confirmadas com o usuário)

- **Local da UI:** painel/modal separado, acionado por um botão "Gerenciar colunas" na página de detalhe da tabela — não mistura com a grade de edição de células do dia a dia.
- **Trocar tipo — valor que não converte:** mantém o texto original na célula (igual ao comportamento já existente na importação, Fase 1). A pessoa corrige manualmente depois, se quiser.
- **Confirmação de exclusão:** excluir coluna mostra a contagem de linhas com valor preenchido antes de confirmar; excluir tabela pede digitar o nome da tabela (mais destrutivo, apaga tudo).
- **Reordenar colunas:** botões ↑/↓ por linha, não arrastar-e-soltar (sem lib de DnD no projeto, acessível por teclado/toque).
- **Renomear a tabela:** entra no escopo (mesma permissão, mesmo painel).
- **Trocar tipo — mecânica:** conversão acontece em **TypeScript**, reaproveitando `paraNumero`/`paraDataISO` já usadas na edição de célula e na importação — não duplica a regra de conversão em SQL pela terceira vez.
- **Coluna tipo `cliente`:** nunca pode ser alvo de troca de tipo, nem de origem nem de destino. É estruturalmente diferente (guarda vínculo com `clientes`, não só texto) — a troca de tipo é só entre `texto`/`numero`/`data`/`opcoes`.

## Modelo de dados

Nenhuma tabela nova. Reaproveita `planilhas`, `planilha_colunas`, `planilha_linhas` (migration `047`). Migration `050` só adiciona funções.

## Migration `050` — funções SQL (aplicada manualmente pelo usuário no dev, como as anteriores)

Todas `SECURITY DEFINER` (exceto a função 5, de contagem — ver nota nela), `set search_path = public`, `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role` — mesmo padrão de `editar_celula_planilha` (migration 048). Chamadas só pelas Server Actions (service role), que já validaram sessão e permissão.

1. **`adicionar_coluna_planilha(p_planilha uuid, p_nome text, p_tipo text, p_opcoes jsonb)` → uuid**
   Insere em `planilha_colunas` com `ordem = coalesce(max(ordem), -1) + 1` da mesma planilha (mesmo padrão de `adicionar_linha_planilha`, com `pg_advisory_xact_lock` pra serializar concorrência). Não mexe em `planilha_linhas` — coluna nova nasce sem valor em nenhuma linha (JSONB esparso, `dados ->> nova_coluna` já retorna `null` sozinho).

2. **`renomear_coluna_planilha(p_coluna uuid, p_nome text) → boolean`**
   `update planilha_colunas set nome = p_nome where id = p_coluna`. Não afeta `dados` (a chave em `dados` é o id da coluna, não o nome — já garantido pelo modelo desde a Fase 1).

3. **`mover_coluna_planilha(p_coluna uuid, p_direcao text) → boolean`**
   `p_direcao` é `'cima'` ou `'baixo'`. Acha a coluna vizinha (ordem imediatamente menor/maior) na mesma `planilha_id` e troca os dois valores de `ordem`, numa transação. Devolve `false` sem erro se a coluna já está na ponta (sem vizinho pra trocar) — a Server Action trata isso como no-op, não como falha.

4. **`excluir_coluna_planilha(p_coluna uuid) → boolean`**
   Remove a chave da coluna de `dados` em toda `planilha_linhas` daquela planilha (`dados - p_coluna::text`) e apaga a linha de `planilha_colunas`. Não renumera as `ordem` restantes — a consulta já ordena por `ordem` crescente, buraco na sequência não importa.

5. **`contar_celulas_coluna(p_coluna uuid) → bigint`**
   Conta quantas linhas têm a chave da coluna presente em `dados` (`dados ? p_coluna::text`), pra mostrar "X de Y linhas têm valor" antes de confirmar a exclusão. `stable`, não `SECURITY DEFINER` — pode rodar como leitura comum (mesma RLS de sempre), já que só conta, não expõe conteúdo.

6. **`trocar_tipo_coluna_planilha(p_coluna uuid, p_tipo text, p_opcoes jsonb, p_valores jsonb) → boolean`**
   `p_valores` é um array `{id uuid, valor}` já calculado em TypeScript (ver Server Actions abaixo). Numa única transação: `update planilha_colunas set tipo = p_tipo, opcoes = p_opcoes where id = p_coluna`, depois para cada item de `p_valores`, `jsonb_set` em `dados[p_coluna]` da linha correspondente. Tudo ou nada — se algo falhar no meio, a transação inteira desfaz (nenhuma conversão parcial).
   Restrição aplicada na função: rejeita (`raise exception`) se o tipo atual da coluna é `cliente` ou se `p_tipo = 'cliente'`.

7. **`renomear_planilha(p_planilha uuid, p_nome text) → boolean`**
   `update planilhas set nome = p_nome, updated_at = now() where id = p_planilha`.

**Excluir tabela não ganha função própria.** É um único `delete from planilhas where id = ...` direto na Server Action, usando o cliente de service role — o `on delete cascade` de `planilha_colunas`/`planilha_linhas` (já existente desde a migration 047) cuida do resto. Não precisa de transação multi-tabela porque o cascade já é atômico dentro do próprio `delete`.

## Server Actions (`lib/tabelas-actions.ts`)

Cada uma: reautentica (`getAuthenticatedAdmin`), busca `profile` (`role, setores, paginas_acesso`), confere `podeAcessarPagina(profile, 'configuracoes', setor)` (o setor vem de `planilhas.setor`, buscado a partir do id recebido — nunca confiar em setor vindo do cliente), só então chama a RPC. `revalidatePath(/${setor}/tabelas/${id})` depois de cada escrita.

- `adicionarColuna(planilhaId, nome, tipo, opcoes?)`
- `renomearColuna(colunaId, nome)`
- `moverColuna(colunaId, direcao)`
- `preVisualizarExclusaoColuna(colunaId) → { total: number; preenchidas: number }` (só leitura)
- `excluirColuna(colunaId)`
- `preVisualizarTrocaTipo(colunaId, novoTipo, novasOpcoes?) → { convertidas: number; naoConvertidas: number; valores: {id, valor}[] }` — busca todas as linhas da planilha (até 5.000), converte cada valor da coluna em TS com `paraNumero`/`paraDataISO`/checagem de opções (mesma lógica de `converterEntradaCelula`, adaptada pra não rejeitar e sim marcar "não convertido" mantendo o texto original), devolve a prévia **e** o array `valores` já calculado.
- `trocarTipoColuna(colunaId, novoTipo, novasOpcoes, valores)` — recebe o **mesmo** `valores` que a prévia calculou (o cliente reenvia o que recebeu, não recalcula) e chama a RPC. Isso garante que o que a pessoa viu na prévia é exatamente o que é gravado — sem reconverter e arriscar um resultado diferente entre mostrar e gravar.
- `renomearTabela(planilhaId, nome)`
- `excluirTabela(planilhaId)`

## Função pura nova (`lib/tabelas/trocar-tipo.ts`)

- `prepararTrocaTipo(linhas: {id: string; valorAtual: ValorCelula}[], tipoNovo: TipoColuna, opcoesNovas: OpcaoColuna[] | null): { convertidas: number; naoConvertidas: number; valores: {id: string; valor: ValorCelula}[] }`
  Para cada linha: tenta converter `valorAtual` pro `tipoNovo` com as mesmas regras de `converterEntradaCelula`/`paraNumero`/`paraDataISO`. Se converter, usa o valor convertido. Se não converter (ou `valorAtual` já é `null`), **mantém o valor atual como está** (nunca apaga) e conta como "não convertida" só se havia algo preenchido que não bateu com o tipo novo (célula vazia não conta como falha de conversão).
  Testada com `node --test` cobrindo: texto→número (com e sem valor conversível), texto→data, número→texto (sempre converte, vira string), qualquer tipo→opções (só bate se o valor já é uma das opções novas, senão fica como não convertida), tipo `cliente` rejeitado antes de chamar (guard na Server Action, não nesta função pura).

## UI — painel "Gerenciar colunas"

Botão no topo de `TabelaDetalhe`, visível só se `podeAcessarPagina(profile, 'configuracoes', setor)` (checagem adicional, separada de `podeEditarLinhas`). Abre um painel com:

- Campo de renomear a tabela (salva ao sair do campo, como as outras edições do sistema).
- Lista das colunas na ordem atual: nome (editável inline), tipo (select — trocar dispara o fluxo de prévia), botões ↑/↓, botão excluir (dispara prévia de contagem).
- Formulário "Adicionar coluna": nome + tipo (+ lista de opções se tipo = opções, mesmo componente de edição de opções já usado em outro lugar do sistema, se existir, senão um campo simples de "uma opção por linha").
- Rodapé: botão "Excluir tabela" (vermelho, canto isolado), abre confirmação com campo de digitar o nome.

Trocar tipo e excluir coluna abrem uma confirmação de dois passos: prévia (número) → botão "Confirmar" que só aparece depois da prévia carregar.

## Erros

- Nome de coluna/tabela vazio ou só espaço: rejeitado antes de chamar a RPC.
- Tipo desconhecido ou opções malformadas: rejeitado.
- `moverColuna` na ponta (sem vizinho): RPC devolve `false`, Server Action trata como sucesso silencioso (nada muda, sem erro pra pessoa).
- `trocarTipoColuna` chamada com tipo `cliente` de origem ou destino: rejeitada já na Server Action, antes de qualquer leitura de linha (mensagem clara, sem gastar a chamada de prévia).
- Sessão inválida ou sem permissão: mesma mensagem padrão do resto do sistema ("Acesso negado."/"Sessão inválida.").
- Nada é gravado pela metade — cada RPC de escrita múltipla (`excluir_coluna_planilha`, `trocar_tipo_coluna_planilha`) é uma transação só.

## Testes

- `lib/tabelas/trocar-tipo.ts`: `node --test`, casos descritos acima.
- Migration `050`: teste de fumaça SQL (`supabase/tests/050_estrutura_smoke.sql`), mesmo formato do `049` — cria dados de teste, roda asserts contra as 6 funções, `rollback` no final. Cobre: adicionar coluna aparece na ordem certa; renomear não mexe em `dados`; mover na ponta devolve `false` sem erro; excluir coluna remove a chave de todas as linhas e a contagem prévia bate; trocar tipo converte o que dá e mantém o que não dá; trocar tipo rejeita coluna `cliente`.
- Teste de tela: usuário, em dev (como sempre).

## Fora do escopo

- Editar `coluna_chave` (usada só no reenvio da Fase 3, ainda não implementada) — fica pra quando a Fase 3 for desenhada.
- Desfazer troca de tipo ou exclusão de coluna (não há histórico/undo nesta fase).
- Mudar o setor de uma tabela já criada.
- Duplicar tabela.

## Nota de integração

Esta fase (2C) foi ramificada de `origin/dev` no estado atual (após a Fase 2A mergeada), em paralelo com a Fase 2B (busca/filtro/exportar, PR #175 aberto, ainda não mergeado). As duas fases tocam os mesmos arquivos (`TabelaDetalhe.tsx`, `TabelaEditavel.tsx`, `lib/tabelas-actions.ts`) de formas diferentes — a integração das duas (merge de uma branch sobre a outra, ou reduplicação de conflito no PR) fica para quando ambas estiverem prontas para promoção, não é tratada nesta fase.
