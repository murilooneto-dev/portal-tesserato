# Criar tipo de tarefa (Data/Texto/Opções) direto no cadastro de cliente

**Data:** 2026-07-20
**Status:** Aprovado

## Contexto

O catálogo `tarefa_tipos` já suporta três formatos de resposta por tipo de tarefa:

- **Data** — checkbox simples (padrão, `tipo_resposta='data'`, `etapas=null`)
- **Opções** — etapas nomeadas, cada uma com seu checkbox (`tipo_resposta='data'`, `etapas=[...]`, ex: Folha de Pagamento tem Gerar/Relatório/Guias/Envio)
- **Texto+anexo** — campo de texto livre e/ou upload de arquivos (`tipo_resposta='texto'`, mutuamente exclusivo com `etapas`)

Essas capacidades foram construídas nas frentes anteriores (Setor Pessoal, Observação + Tipo de Resposta, Fiscal Fase 1) mas ficaram "adormecidas": a única forma de criar um tipo novo no catálogo com `tipo_resposta='texto'` ou com `etapas` é uma migration SQL pontual rodada manualmente. O campo "Tarefas" nos modais de cliente (`EmpresaContabilModal.tsx`, `EmpresaPessoalModal.tsx`, `CamposFiscais.tsx`) permite digitar qualquer nome livre e aperta Enter — isso só insere a string em `clientes_*.tarefas_personalizadas`, sem tocar em `tarefa_tipos`. Um nome digitado que não bate com nenhuma linha do catálogo sempre renderiza como Data simples, mesmo que o usuário quisesse Texto ou Opções.

O usuário tentou usar essa capacidade digitando um nome novo no campo Tarefas do Contábil e não conseguiu escolher o formato — confirmando que não é bug, é funcionalidade que nunca existiu nessa camada de UI.

## Objetivo

Ao digitar, no campo Tarefas de qualquer um dos três setores (Contábil, Pessoal, Fiscal), um nome que **não existe ainda** no catálogo `tarefa_tipos` daquele setor, abrir um miniformulário para escolher o formato (Data / Texto+anexo / Opções) antes de criar o tipo. Nomes que já existem no catálogo continuam sendo adicionados direto, como hoje.

## Fora de escopo

- Editar ou mudar o formato de tipos já existentes no catálogo (risco de quebrar dados reais de tarefas já concluídas). Só criação de tipos novos.
- Uma tela dedicada de administração do catálogo, separada do fluxo de cliente.
- Migrar ENTRADA/SAIDAS (Fiscal) para o catálogo genérico — seguem hard-coded como sempre foram (Fase 2 do Fiscal, sem spec própria ainda).
- Expor `meses_visiveis` (sazonalidade, hoje só usado no Pessoal) neste miniformulário — tipos criados por aqui nascem sempre visíveis em todos os meses (`meses_visiveis=null`), igual ao comportamento padrão já existente.
- Qualquer sincronização entre a branch `feat/motor-tarefas-setor` e `main`.

## Design

### Componente novo: `components/geral/NovoTipoTarefaModal.tsx`

Miniformulário compartilhado pelos três setores. Recebe o nome já digitado (não editável nesta etapa — o nome já foi escolhido no campo Tarefas) e pede:

1. **Formato:** três opções (radio ou botões) — Data / Texto+anexo / Opções.
2. **Se Opções:** lista de nomes de etapas, mesmo padrão de UX do campo Tarefas — digita, aperta Enter, entra numa lista com "x" para remover. Precisa de pelo menos 1 etapa para confirmar.
3. Botões Cancelar / Criar tipo.

Cancelar fecha o modal sem criar nada e sem adicionar o nome à lista de tarefas do cliente (o usuário terá que digitar de novo se quiser tentar outra vez).

### Server action novo: `criarTipoTarefa` em `lib/tarefa-tipos.ts`

```ts
async function criarTipoTarefa(
  setor: UserSetor,
  nome: string,
  tipoResposta: TipoResposta,
  etapas: string[] | null
): Promise<{ error: string | null }>
```

- Usa `getAuthenticatedAdmin()` (mesmo padrão das outras server actions do projeto).
- Bloqueia nomes reservados do Fiscal: se `setor === 'fiscal'` e `nome` (case-insensitive, trim) for `ENTRADA` ou `SAIDAS`, retorna erro sem inserir.
- Insere em `tarefa_tipos` (`setor`, `nome`, `etapas`, `tipo_resposta`). A constraint `unique(setor, nome)` do banco protege contra duplicata em corrida — se o insert falhar por violação dessa constraint, trata como sucesso silencioso (o tipo já existe, é exatamente o que queríamos).
- Qualquer outro erro de banco retorna `{ error: <mensagem> }` para o modal exibir.

### Mudança nos três modais de cliente

`EmpresaContabilModal.tsx`, `EmpresaPessoalModal.tsx`, `CamposFiscais.tsx` já recebem (ou passam a receber) a lista de nomes do catálogo daquele setor. A função `addTarefa()` de cada um muda de:

```
digitou nome + Enter → push direto em tarefas_personalizadas
```

para:

```
digitou nome + Enter
  → nome bate (case-insensitive, trim) com algum nome do catálogo?
    → sim: push direto em tarefas_personalizadas (comportamento atual, inalterado)
    → não: abre NovoTipoTarefaModal
      → usuário escolhe formato e confirma → chama criarTipoTarefa()
        → sucesso: push do nome (como digitado) em tarefas_personalizadas, fecha modal
        → erro: mostra mensagem no miniformulário, mantém aberto
      → usuário cancela → fecha modal, não mexe em tarefas_personalizadas
```

A lógica de comparação e decisão fica num helper compartilhado (ex: `lib/tarefa-tipos.ts` mesmo, ao lado de `criarTipoTarefa`) para não duplicar a checagem case-insensitive nos três modais.

### Erros e casos de borda

- **Nome reservado no Fiscal** (`ENTRADA`/`SAIDAS`): miniformulário mostra erro claro ("Esse nome é reservado pelo sistema") e não deixa criar.
- **Corrida de criação simultânea do mesmo nome:** tratada como sucesso (ver acima) — não deve aparecer erro para o usuário nesse caso, já que o resultado prático é o desejado (o tipo existe).
- **Nome com espaços/maiúsculas diferentes de um já existente** (ex: " nfse" vs "NFSe"): tratado como o mesmo tipo (comparação normalizada), não cria duplicata — mas o texto exibido em `tarefas_personalizadas` usa o que o usuário digitou originalmente (sem alterar capitalização/espaços à força), igual ao comportamento atual do campo.
- **Etapas vazias ao escolher "Opções":** botão Criar tipo fica desabilitado até ter pelo menos 1 etapa.

## Testes

Sem suíte automatizada no projeto (nenhuma frente anterior adicionou uma). Verificação via `npx tsc --noEmit -p .` e `npm run build` limpos, mais roteiro manual documentado no plano de implementação (criar tipo Data, Opções com 2-3 etapas, e Texto+anexo, em cada um dos 3 setores; confirmar renderização correta no checklist do cliente depois). Teste manual no navegador é executado pelo usuário, não por mim, salvo pedido explícito.
