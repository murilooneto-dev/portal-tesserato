# Preenchimento Rápido de Tarefas — Design

**Data:** 2026-08-21
**Status:** Aprovado

## Contexto

Hoje, marcar uma tarefa tipo DATA (checkbox simples que grava a data de conclusão) como
concluída exige abrir a ficha de cada cliente individualmente. Quando várias empresas do
mesmo Grupo/Regime/Atividade completam a mesma tarefa no mesmo dia (ex: todas as empresas do
Simples Nacional enviaram a DAS), isso significa abrir dezenas de fichas uma por uma.

Este projeto adiciona uma tela de preenchimento em lote: o usuário filtra por Grupo, Regime
ou Atividade, escolhe quais tarefas (vinculadas a esse filtro) quer preencher, e marca um
checkbox por cliente/tarefa numa grade — cada clique grava a conclusão com a data de hoje,
exatamente como se tivesse marcado na ficha do cliente.

A ficha do cliente não muda em nada — continua permitindo escolher uma data manual específica
para qualquer tarefa tipo DATA, como hoje. A tela nova é só um atalho para o caso comum de
"marquei hoje, pra várias empresas de uma vez".

## Descoberta relevante

O campo **Grupo** só existe no cadastro de cliente do Fiscal (`ClienteFiscal.grupo`).
Contábil e Pessoal (`ClienteContabil`, `ClientePessoal`) só têm `regime` e `atividade` — não
têm `grupo`. Por isso o seletor de campo mostra Grupo/Regime/Atividade no Fiscal, e só
Regime/Atividade em Contábil/Pessoal.

## Escopo

- Fiscal, Contábil e Pessoal (os 3 setores).
- Só tarefas com `tipo_resposta = 'data'` entram no filtro de tarefas. Tarefas ETAPAS
  (múltiplas etapas) e TEXTO+anexo não fazem sentido num clique só — continuam sendo
  preenchidas apenas na ficha do cliente.
- Sem migration nova. Nenhuma tabela nova, nenhuma coluna nova — reaproveita
  `grupos`/`regimes`/`atividades`, `tarefa_tipo_vinculos`, `tarefa_tipos`, `tarefas`.

## Arquitetura

Nova rota por setor:
- `/fiscal/preenchimento-rapido`
- `/contabil/preenchimento-rapido`
- `/pessoal/preenchimento-rapido`

Cada `page.tsx` é um server component que carrega os dados (clientes visíveis ao usuário,
mapa de vínculos do setor via `buscarMapaVinculosSetor`, mês/ano corrente via `getMesAno`) e
passa pra um componente client compartilhado, ex. `components/PreenchimentoRapido.tsx`, que
cuida da interação. O componente recebe como prop se o campo "Grupo" está disponível
(`true` só no Fiscal), pra ajustar o seletor 1.

Isso segue o mesmo padrão já usado por `TarefaChecklist`: um componente compartilhado entre os
3 setores, com os dados específicos de cada um vindos via props do server component da página.

## Fluxo de dados

1. **Seletor 1 (campo):** Grupo / Regime / Atividade (Fiscal) ou Regime / Atividade
   (Contábil/Pessoal).
2. **Seletor 2 (valor):** ao escolher o campo, lista os valores distintos existentes entre os
   clientes ativos e visíveis ao usuário atual (admin vê todos; não-admin só os que é
   responsável, mesma regra de `podeEditarCliente`/`podeEditarClienteContabil`/
   `podeEditarClientePessoal`). Ex: campo = Regime → valores "Simples Nacional", "Lucro
   Presumido" etc.
3. Escolhido o valor, busca em `tarefa_tipo_vinculos` as tarefas vinculadas a essa entidade
   (mesma junção que `buscarMapaVinculosSetor` já faz), filtrando só `tipo_resposta = 'data'`.
4. **Seletor 3 (tarefas):** multi-select das tarefas encontradas no passo 3. O usuário escolhe
   quais colunas quer na grade.
5. **Tabela final:** linhas = clientes ativos que têm aquele valor no campo escolhido e que o
   usuário pode editar; colunas = tarefas escolhidas; célula = checkbox refletindo se aquela
   tarefa já está concluída pro cliente no mês/ano corrente (mesmo mês/ano selecionado no resto
   do sistema, via `getMesAno`).
6. **Clique no checkbox:**
   - Marca → grava `concluida=true`, `concluida_em=hoje` (cria a linha em `tarefas` se não
     existir, igual já acontece hoje no toggle da ficha do cliente).
   - Desmarca → `concluida=false`, `concluida_em=null`.
   - Sem confirmação, sem modal — atualização otimista, igual ao checklist da ficha do
     cliente hoje.
7. Trocar o campo (seletor 1) ou o valor (seletor 2) reseta a seleção de tarefas e a tabela,
   pra evitar misturar contexto de um filtro antigo com tarefas de outro.

## Server action compartilhada

Hoje o toggle de tarefa tipo DATA (`toggleTarefa`, em
`app/fiscal/clientes/[id]/page.tsx:131`) é uma server action *inline*, fechada sobre o
`clienteId` de uma única ficha — não reutilizável numa grade com N clientes.

Extrair uma versão parametrizada e compartilhada entre os 3 setores, ex.
`lib/tarefas-toggle.ts`:

```ts
export async function alternarTarefaData(
  setor: UserSetor,
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
): Promise<{ error?: string }>
```

Internamente:
- Valida com o `podeEditarCliente<Setor>` correto pro setor antes de gravar (mesma trava de
  hoje — mesmo que alguém manipule o clique no navegador, o servidor recusa gravar em cliente
  que não é dele).
- Busca/cria a linha em `tarefas` e grava `concluida`/`concluida_em=hoje` (quando marcando) ou
  `concluida_em=null` (quando desmarcando) — mesma lógica que já existe.
- Chama `revalidatePath` nas rotas relevantes do setor (clientes, dashboard, relatórios,
  tarefas, preenchimento-rapido).

A ficha do cliente (`toggleTarefa` inline em cada `[id]/page.tsx` dos 3 setores) passa a
chamar essa função compartilhada também, em vez de duplicar a lógica — elimina a duplicação
entre ficha e grade nova. **A ficha do cliente continua com seu input de data manual
(`data?: string`) intacto** — só a tela de Preenchimento Rápido usa sempre "hoje", por ser
pensada pra marcar vários clientes de uma vez com a mesma data.

## Casos de borda

- **Nenhum valor encontrado** (ex: nenhum cliente tem Grupo cadastrado no setor, ou setor sem
  vínculos cadastrados no catálogo) → seletor de valor/tarefas fica vazio com uma mensagem,
  sem erro.
- **Tabela vazia após escolher tarefas** (ex: usuário não-admin sem nenhum cliente daquele
  valor) → mensagem "Nenhum cliente encontrado para esse filtro".

## Navegação

Novo item "Preenchimento Rápido" no menu de cada setor (Fiscal/Contábil/Pessoal), ao lado de
Clientes/Tarefas/Agenda.

## Fora de escopo (v1)

- Múltiplos valores de filtro ao mesmo tempo (ex: Grupo = X E Regime = Y) — só um valor por
  vez.
- Tarefas ETAPAS e TEXTO+anexo na grade.
- Data manual (diferente de "hoje") na tela de Preenchimento Rápido.
