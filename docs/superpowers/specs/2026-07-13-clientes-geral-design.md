# Clientes Geral — design

**Data:** 2026-07-13
**Status:** aprovado para planejamento
**Branch:** `feat/clientes-geral` (a partir de `feat/multi-setor-portal`, que ainda não foi mesclada em `main`)

## Contexto

O portal tem hoje uma única tela de "Clientes", exclusiva do setor Fiscal (`app/fiscal/clientes`), que mistura dados básicos da empresa (nome, CNPJ, município/UF, contato) com dados de fluxo de trabalho fiscal (regime, atividade, grupo, checklist mensal de tarefas, credenciais ISS, conferência SIGA). Por decisão já tomada durante o planejamento da fundação multi-setor, essa tela continuará existindo como está — o Fiscal continua com sua própria visão de Clientes.

Este spec cobre uma **nova** tela "Clientes Geral" (rota comum `/clientes`, ao lado de `/intranet` e `/ferramentas`), com dois objetivos:

1. Uma lista compartilhada, entre todos os setores, dos dados básicos de cada empresa cliente.
2. Um ponto único de cadastro de cliente novo, onde se escolhe quais setores atendem aquele cliente — e, para o Fiscal (o único setor com um fluxo de onboarding definido hoje), os campos específicos dele já ficam disponíveis no mesmo formulário.

## Fora de escopo

- Nome Fantasia (não existe no banco hoje; decisão tomada de não adicionar por enquanto).
- Endereço completo (rua/número/CEP) — só Município/UF, que já existem.
- Onboarding específico dos outros 4 setores (Contábil, Pessoal, Societário, Financeiro) — cada um vira um campo condicional futuro no mesmo modal, quando aquele setor for planejado.
- Qualquer mudança na tela `/fiscal/clientes` além da extração do componente de campos fiscais (ver seção 4).

## 1. Banco de dados

Nova migration adicionando `setores` à tabela `clientes`, no mesmo padrão já usado em `profiles`:

```sql
alter table clientes add column if not exists setores user_setor[] not null default '{fiscal}';
```

Todo cliente já cadastrado (100% Fiscal hoje) recebe `{fiscal}` automaticamente pelo default — sem necessidade de backfill manual, já que não existe outro setor com clientes ainda.

## 2. Tela `/clientes` (rota comum)

- `app/(comum)/clientes/page.tsx`: busca todos os clientes (`select *`), passa pro client component.
- Lista com: Razão Social (`nome`), CNPJ (`cnpj`), Endereço (`municipio` + `uf`).
- Caixa de busca por nome ou CNPJ, filtragem client-side (mesmo padrão de Relatórios/Parcelamentos — sem paginação, lista completa de uma vez).
- Visualização da lista liberada para qualquer usuário autenticado (mesmo padrão de Intranet/Ferramentas) — é cadastro básico, não dado sensível de fluxo de trabalho.
- Botão "+ Novo Cliente" e a possibilidade de editar (clicar numa linha abrindo o modal em modo edição) ficam restritos a admin — a RLS de `clientes` hoje só libera `insert`/`update` pra quem satisfaz a policy "Admin gerencia clientes" (ou "Responsavel atualiza seu cliente", que não se aplica a um cadastro novo). Não-admins veem a lista, mas sem o botão de criar e sem conseguir abrir o modal em modo edição ao clicar (linha abre só leitura pra eles). Isso evita repetir o comportamento de hoje em `/fiscal/clientes`, onde o botão "+ Novo Cliente" aparece pra todo mundo mas só funciona de fato pra quem a RLS libera.

## 3. Modal de cliente (criar/editar)

Um único modal (`components/geral/ClienteGeralModal.tsx`) cobre os dois modos (criação sempre admin-only; edição também — não-admin que clicar numa linha vê os mesmos campos em modo somente-leitura, `readOnly` como já existe em `EmpresaModal.tsx`):

**Campos base (sempre visíveis, editáveis nos dois modos):**
- Razão Social (`nome`, obrigatório)
- CNPJ (`cnpj`)
- Município + UF (`municipio`, `uf`)
- Contato (`contato_chat`)
- Setores (multi-select em checkboxes, mesmo componente visual usado no formulário de usuário em Parâmetros — todos os 5 setores aparecem, sem restrição)

**Bloco condicional Fiscal:** quando "Fiscal" está marcado nos Setores, aparece embutido o bloco com os campos específicos do Fiscal — Código, Regime, Atividade (com preenchimento automático de tarefas por template), Grupo, Responsável, Envia ISS? (com credenciais condicionais), Confere SIGA?, Declaração Anual, Prioridade, Tarefas personalizadas. Esses são exatamente os campos que `components/fiscal/EmpresaModal.tsx` já pede hoje (incluindo Código e Responsável, que também saem do corpo atual do modal — Responsável em particular é intencionalmente de fora dos campos base, já que cada setor tem o seu próprio, como decidido antes).

**Outros 4 setores:** ao marcar qualquer um deles, nenhum campo extra aparece — só fica registrado no array `setores`. Quando cada setor for especificado num spec futuro, seu bloco de campos entra aqui do mesmo jeito que o do Fiscal.

**Edição:** reabrir o modal num cliente existente carrega todos os campos (base + fiscal, se aplicável) e permite alterar qualquer um deles, inclusive adicionar ou remover setores. Se "Fiscal" for desmarcado num cliente que já tinha dados fiscais preenchidos, os dados fiscais permanecem no banco (não são apagados) — simplesmente o cliente para de aparecer como fiscal-ativo; se "Fiscal" for remarcado depois, os dados voltam a aparecer.

## 4. Reaproveitamento: extrair os campos fiscais

O bloco de campos específicos do Fiscal (Regime, Atividade, Grupo, Envia ISS/credenciais, Confere SIGA, Declaração Anual, Prioridade, Tarefas — hoje é a maior parte do corpo de `EmpresaModal.tsx`) vira um componente próprio, `components/fiscal/CamposFiscais.tsx`, recebendo o estado do formulário e uma função de atualização (mesmo padrão `form`/`set` que `EmpresaModal.tsx` já usa internamente). Dois consumidores:

- `EmpresaModal.tsx` (Fiscal, inalterado no comportamento) passa a renderizar `<CamposFiscais />` em vez de ter os campos inline.
- `ClienteGeralModal.tsx` renderiza o mesmo `<CamposFiscais />` condicionalmente, quando "Fiscal" está marcado nos Setores.

Isso evita duplicar a lógica de template de tarefas por atividade e de busca de CNPJ (`fetchCnpj`, que também é reaproveitável — ver próxima seção).

## 5. Gravação dos dados

Sem Server Action nova — `ClienteGeralModal.tsx` grava direto no Supabase a partir do client component, com `createClient()` de `@/lib/supabase/client`, exatamente como `EmpresaModal.tsx` já faz hoje (`insert`/`update` na tabela `clientes`, sem passar por service role — a RLS existente já libera autenticados a gerenciar `clientes`). Mesmo padrão, dois arquivos: cada modal monta seu próprio payload e chama `sb.from('clientes').insert(...)` ou `.update(...).eq('id', clienteId)` diretamente.

## 6. Busca de CNPJ

`EmpresaModal.tsx` já busca dados de CNPJ na BrasilAPI (`fetchCnpj`) pra pré-preencher Razão Social e Município/UF. O novo modal Geral reaproveita a mesma função (extraída pra um helper compartilhado, `lib/buscar-cnpj.ts`), já que faz sentido em qualquer contexto de cadastro de cliente, não só Fiscal.

## Testes e verificação

Sem suíte automatizada (confirmado, mesmo padrão do resto do projeto). Verificação manual no navegador, contra o banco de dev:

- Criar cliente novo só com campos base + nenhum setor extra além de um dos 4 sem padrão (ex: Societário) → aparece na lista geral, sem nenhum campo fiscal pedido.
- Criar cliente novo marcando Fiscal → bloco de campos fiscais aparece, preenchimento funciona igual ao `EmpresaModal.tsx` de hoje (testar também o preenchimento automático de tarefas pela atividade).
- Cliente criado com Fiscal marcado aparece também na tela `/fiscal/clientes` (mesma tabela, `setores` incluindo `'fiscal'` não deve quebrar nada do fluxo fiscal existente — conferir que os componentes que já leem `clientes.*` sem esperar a coluna `setores` continuam funcionando, já que é uma coluna nova aditiva).
- Editar um cliente Fiscal-only pela tela Geral, adicionar outro setor (ex: Pessoal) → cliente passa a aparecer como pertencente aos dois setores, dados fiscais preservados.
- Desmarcar Fiscal de um cliente que tinha dados fiscais, depois remarcar → dados fiscais reaparecem intactos (não foram apagados no meio tempo).
- Busca por nome/CNPJ na lista geral filtra corretamente.
- `EmpresaModal.tsx` (Fiscal) continua funcionando exatamente como antes após a extração de `CamposFiscais.tsx` — checklist de regressão manual das mesmas ações que já funcionavam (criar, editar, buscar CNPJ, restaurar template de tarefas).

## Riscos conhecidos

- A extração de `CamposFiscais.tsx` de dentro de `EmpresaModal.tsx` é o item de maior risco de regressão neste spec — precisa de teste manual cuidadoso no fluxo fiscal existente após a extração, não só no fluxo novo.
- Coluna `setores` aditiva com default `'{fiscal}'` é segura para dev (mesmo padrão já usado e testado na fundação multi-setor); ainda não deve ser promovida pra produção até a fundação multi-setor também ser (mesma pendência já registrada).
