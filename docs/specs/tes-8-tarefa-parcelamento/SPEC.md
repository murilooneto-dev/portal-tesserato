# SPEC — Tarefa automática "Parcelamento" no cadastro de cliente com sincronização de data

> ⚠️ **DOCUMENTO OBSOLETO / SUPERSEDED (2026-08-04)** — O cliente mudou o escopo e **cancelou** a automação de criação de tarefa e sincronização de data descrita abaixo. Este arquivo é mantido apenas como histórico. O requisito vigente é um recurso de exibição (aviso de parcelamento na ficha do cliente), especificado em `docs/specs/tes-8-aviso-parcelamento/SPEC.md`. **Não usar este documento para arquitetura ou implementação.**

---

> Issue: TES-8 · Setor: Fiscal · Status do documento: **OBSOLETO (superseded)** — conteúdo abaixo preservado apenas como histórico.

# Resumo Executivo

Hoje o portal mantém duas telas independentes no setor Fiscal:

- **Parcelamentos** (`/fiscal/parcelamentos`): planilha anual onde cada linha é um parcelamento de uma empresa, com 12 colunas mensais (`jan`…`dez`) preenchidas manualmente.
- **Cadastro do Cliente** (`/fiscal/clientes/[id]`): checklist de tarefas mensais do cliente, cada tarefa com um campo de resposta (data ou texto).

O pedido é conectar as duas telas: todo cliente que **possui parcelamento** deve ganhar automaticamente, no seu cadastro, uma tarefa chamada **"Parcelamento"** com um campo de **data**. Ao preencher essa data, o sistema deve refletir automaticamente o preenchimento na coluna do mês correspondente da tela de Parcelamentos, evitando digitação duplicada e mantendo as duas telas coerentes.

O objetivo é reduzir retrabalho e divergência entre as telas. Existem, porém, ambiguidades importantes sobre **qual mês** é sincronizado, **qual valor** é gravado na planilha, e **como um cliente é associado a um parcelamento** (hoje o vínculo é por nome, não por chave). Essas questões precisam ser esclarecidas com o cliente antes de fechar a arquitetura.

# Objetivo

Garantir que:

1. Todo cliente com parcelamento cadastrado passe a ter, no seu cadastro, uma tarefa "Parcelamento" com campo de data — tanto para clientes já existentes (backfill) quanto para os cadastrados no futuro.
2. Ao preencher a data dessa tarefa, a coluna do mês equivalente na tela de Parcelamentos seja preenchida automaticamente, sem digitação manual redundante.

# Problema

- O acompanhamento de parcelamentos e o acompanhamento de tarefas do cliente vivem em telas separadas e são preenchidos manualmente em ambos os lugares.
- Não há hoje nenhum vínculo automático entre "o cliente tem um parcelamento" e "o cliente tem a tarefa de controlar esse parcelamento no mês".
- O responsável precisa lembrar de atualizar as duas telas, o que gera esquecimento, divergência de dados e falta de visibilidade no cadastro do cliente sobre a situação do parcelamento.

# Escopo

- Existência automática da tarefa "Parcelamento" (campo de data) no cadastro dos clientes que possuem parcelamento — para clientes existentes (backfill) e futuros.
- Criação/remoção automática dessa tarefa acompanhando o ciclo de vida do parcelamento (cadastro, edição, exclusão) — sujeita às regras definidas em "Regras de Negócio" e às respostas das dúvidas pendentes.
- Sincronização, ao preencher a data da tarefa, do valor correspondente na coluna do mês equivalente do parcelamento.
- Definição explícita da regra de "mês equivalente" e do valor gravado na planilha (a definir junto ao cliente — ver dúvidas).
- Tratamento dos casos de borda listados (múltiplos parcelamentos, ausência de parcelamento no mês, edição da data já preenchida).

# Fora do Escopo

- Redesenho das telas de Parcelamentos ou de Cadastro de Cliente além do necessário para exibir/preencher a tarefa.
- Alteração da lógica de parcelamentos avulsos (empresa avulsa), que por definição não estão vinculados a um cliente cadastrado — ver dúvida sobre esses casos.
- Sincronização no sentido inverso (preencher a coluna mensal na tela de Parcelamentos e refletir na tarefa do cliente), a menos que o cliente confirme que deseja bidirecionalidade — ver dúvida.
- Aplicação da funcionalidade a outros setores (contábil, pessoal etc.). Parcelamentos é uma tela do setor Fiscal; o escopo assumido é somente Fiscal.
- Definições de tecnologia, banco de dados, modelagem e implementação (responsabilidade da etapa de Arquitetura).

# Usuários

- **Operador do Fiscal**: responsável por um conjunto de clientes; preenche tarefas e parcelamentos dos seus clientes.
- **Administrador do Fiscal**: enxerga e edita todos os clientes e parcelamentos.

# Perfis de Acesso

Mantêm-se os perfis já existentes no portal, sem novos perfis:

- **Admin**: acesso total (todos os clientes e parcelamentos).
- **Operador**: acesso restrito aos clientes/parcelamentos sob sua responsabilidade.

A tarefa "Parcelamento" e sua sincronização devem respeitar exatamente as mesmas regras de permissão já aplicadas às demais tarefas e aos parcelamentos (quem pode ver/editar a tarefa é quem já pode ver/editar aquele cliente e aquele parcelamento).

# Fluxos do Sistema

## Fluxo 1 — Cliente novo com parcelamento (futuro)
1. Um parcelamento é cadastrado na tela Parcelamentos e vinculado a um cliente cadastrado.
2. O sistema passa a exibir, no cadastro desse cliente, a tarefa "Parcelamento" com campo de data.

## Fluxo 2 — Backfill de clientes existentes
1. No momento da entrega, todos os clientes que já possuem parcelamento vinculado passam a exibir a tarefa "Parcelamento".

## Fluxo 3 — Preenchimento da data (sincronização)
1. O usuário abre o cadastro do cliente e preenche a data da tarefa "Parcelamento".
2. O sistema identifica o mês equivalente (regra a definir — ver dúvidas) e grava o valor correspondente na coluna daquele mês no parcelamento vinculado.
3. As duas telas passam a exibir a informação de forma coerente.

## Fluxo 4 — Alteração/remoção do parcelamento
1. O parcelamento é editado ou excluído na tela Parcelamentos.
2. O sistema atualiza ou remove a tarefa "Parcelamento" do cliente conforme a regra definida (ver dúvidas e regras de negócio).

# Funcionalidades

1. **Provisão automática da tarefa "Parcelamento"** no cadastro do cliente sempre que ele tiver parcelamento vinculado (existentes e futuros).
2. **Campo de data** na tarefa "Parcelamento".
3. **Sincronização data → coluna mensal**: ao preencher a data, preencher automaticamente o campo do parcelamento do mês equivalente.
4. **Manutenção do vínculo** conforme o ciclo de vida do parcelamento (criação/edição/exclusão).
5. **Tratamento de casos de borda** (ver seção própria).

# Regras de Negócio

> As regras marcadas com ⚠️ dependem de esclarecimento do cliente (ver "Dúvidas Pendentes"). Estão descritas aqui como comportamento **candidato/assumido**, não como decisão final.

- **RN01 — Gatilho da tarefa**: a tarefa "Parcelamento" existe para o cliente enquanto ele tiver ao menos um parcelamento vinculado. Sem parcelamento vinculado, a tarefa não é oferecida.
- **RN02 — Nome fixo**: o nome da tarefa é exatamente "Parcelamento".
- **RN03 — Tipo de resposta**: a tarefa tem um campo de data (resposta do tipo data).
- **RN04 — Escopo setorial**: aplica-se ao setor Fiscal (tela Parcelamentos é do Fiscal). ⚠️ confirmar.
- **RN05 — Mês equivalente** ⚠️: o valor é gravado na coluna do mês definido pela regra de correspondência a ser confirmada. Interpretação candidata: "mês equivalente" = mês da própria data preenchida na tarefa (ex.: data 10/03 → coluna `mar`). Alternativa possível: mês de vencimento da parcela. **Precisa ser confirmado.**
- **RN06 — Valor gravado na coluna** ⚠️: hoje as colunas mensais são texto livre (guardam, na prática, um identificador/protocolo e um status como ENVIADO/LIQUIDADO/COMUNICADO/CANCELADO). Precisa-se definir **o que** a sincronização grava: a data preenchida, um status padrão, ou outro valor. **Precisa ser confirmado.**
- **RN07 — Periodicidade da tarefa** ⚠️: as tarefas do portal são organizadas por mês/ano. Precisa-se definir se "Parcelamento" é uma tarefa recorrente mensal (uma por mês) ou única. Isso determina como a data se relaciona ao mês. **Precisa ser confirmado.**
- **RN08 — Direção da sincronização**: assume-se unidirecional (tarefa → parcelamento). ⚠️ confirmar se deve ser bidirecional.
- **RN09 — Edição da data já preenchida**: ao alterar uma data já preenchida, a coluna mensal correspondente deve ser atualizada de forma coerente (incluindo o caso em que a mudança de data muda o mês de destino — ver casos de borda).

# Integrações

- Não há integração com sistemas externos. A funcionalidade integra duas áreas internas do próprio portal (Parcelamentos ↔ Tarefas do Cliente).

# Requisitos Não Funcionais

- **Consistência**: as duas telas devem refletir a mesma informação após a sincronização; não pode haver estado divergente por falha parcial.
- **Idempotência do backfill**: reprocessar clientes existentes não deve criar tarefas duplicadas.
- **Permissões**: a tarefa e a sincronização respeitam as regras de acesso já existentes (não expõem parcelamento/cliente a quem não tem acesso).
- **Rastreabilidade**: manter coerência com o padrão atual de registrar quem/quando concluiu uma tarefa.
- **Não regressão**: a tela de Parcelamentos e o checklist de tarefas existentes devem continuar funcionando como hoje para clientes sem parcelamento.

# Critérios de Aceite

1. Um cliente com parcelamento vinculado exibe a tarefa "Parcelamento" com campo de data no seu cadastro (válido para cliente existente e recém-criado).
2. Um cliente sem parcelamento vinculado **não** exibe a tarefa "Parcelamento".
3. Ao preencher a data da tarefa, a coluna do mês equivalente do parcelamento vinculado é preenchida automaticamente com o valor definido (conforme RN05/RN06 após confirmação).
4. Ao alterar uma data já preenchida, a planilha é atualizada de forma coerente, sem deixar resíduo no mês anterior quando o mês de destino muda.
5. O backfill não gera tarefas duplicadas ao ser reprocessado.
6. O comportamento em edição/exclusão do parcelamento segue a regra confirmada (ver dúvidas), sem deixar tarefa "órfã" em estado inconsistente.

# Premissas

- O vínculo cliente↔parcelamento existe hoje **por nome da empresa** (e CNPJ), via seleção na tela Parcelamentos — não por uma chave/identificador de cliente. Parcelamentos marcados como "empresa avulsa" são texto livre e **não** correspondem a um cliente cadastrado.
- A funcionalidade se limita ao setor Fiscal.
- Um cliente pode ter mais de um parcelamento (seções diferentes na tela Parcelamentos).
- As tarefas do portal são organizadas por mês e ano.

# Riscos

- **R1 — Vínculo frágil por nome**: como o parcelamento se liga ao cliente por nome/CNPJ e não por chave, divergências de grafia, renomeação de cliente ou empresa avulsa podem quebrar a correspondência automática, gerando clientes sem a tarefa esperada ou tarefa sem parcelamento correspondente.
- **R2 — Ambiguidade de "mês equivalente" e do valor gravado**: se a regra for interpretada errada, a planilha de Parcelamentos pode ser preenchida no mês/valor errado, corrompendo um controle usado para gestão fiscal.
- **R3 — Múltiplos parcelamentos por cliente**: uma única tarefa "Parcelamento" pode ser insuficiente/ambígua para representar vários parcelamentos do mesmo cliente (para qual parcelamento a data vai?).
- **R4 — Sobrescrita de dados manuais**: as colunas mensais já contêm hoje texto preenchido manualmente; a sincronização automática pode sobrescrever informação existente se a regra de gravação não previr isso.
- **R5 — Backfill em massa**: aplicar a mudança a toda a base existente exige cuidado para não duplicar ou preencher indevidamente registros históricos.

# Dúvidas Pendentes

> Estas são as questões críticas que impedem fechar o escopo. Recomenda-se levá-las ao cliente antes da etapa de Arquitetura.

1. **Mês equivalente**: quando o usuário preenche a data na tarefa, o mês a preencher na planilha é o **mês da data digitada** ou o **mês de vencimento da parcela**? (definir explicitamente)
2. **Valor gravado na coluna mensal**: as colunas `jan`…`dez` são texto livre e hoje guardam protocolo/identificador + status (ENVIADO/LIQUIDADO/etc.). Ao sincronizar, o sistema deve gravar **a data**, **um status padrão**, ou outro valor? Deve **sobrescrever** um valor já digitado manualmente ou apenas preencher quando estiver vazio?
3. **Periodicidade da tarefa "Parcelamento"**: é uma tarefa **mensal recorrente** (uma por mês, cada uma com sua data) ou uma tarefa **única** por cliente? Isso muda como a data se relaciona ao mês.
4. **Múltiplos parcelamentos por cliente**: se o cliente tem vários parcelamentos (seções diferentes), deve existir **uma tarefa por parcelamento** ou **uma única tarefa "Parcelamento"**? Se única, para qual parcelamento a data preenchida deve ir?
5. **Edição do parcelamento**: se o parcelamento vinculado for **editado** (ex.: troca de empresa/seção), a tarefa deve ser mantida, atualizada ou recriada?
6. **Exclusão do parcelamento**: se o parcelamento for **excluído**, a tarefa "Parcelamento" do cliente deve ser **removida**? E o que fazer com datas já preenchidas historicamente (apagar ou preservar o histórico)?
7. **Ausência de parcelamento no mês**: se, num determinado mês, o parcelamento não tem parcela a pagar, a tarefa ainda deve aparecer para aquele mês? Como o usuário indica "não há parcela neste mês"?
8. **Empresa avulsa**: parcelamentos marcados como "empresa avulsa" não têm cliente cadastrado — confirma-se que ficam **fora** desta automação?
9. **Direção da sincronização**: é apenas tarefa → parcelamento, ou o cliente também espera que preencher a coluna mensal na tela de Parcelamentos reflita de volta na tarefa (bidirecional)?
10. **Vínculo cliente↔parcelamento**: dado que hoje o vínculo é por nome/CNPJ e não por chave, o cliente aceita que a correspondência automática dependa desse nome? Há tolerância para casos de divergência de grafia?

# Recomendações

- Sugestão (não decisão): tratar a tarefa "Parcelamento" como **mensal recorrente**, alinhada ao modelo atual de tarefas por mês/ano do portal, e usar o **mês da data preenchida** como mês equivalente — por ser o comportamento mais simples e previsível para o usuário. Confirmar com o cliente.
- Sugestão: na sincronização, **não sobrescrever** valores já digitados manualmente na coluna mensal sem confirmação, para preservar informação existente (R4). Confirmar.
- Sugestão: para clientes com **múltiplos parcelamentos**, avaliar com o cliente ter **uma tarefa por parcelamento** (nomeada de forma a distinguir seção/empresa), evitando ambiguidade de destino da data.
- Recomenda-se, na etapa de Arquitetura, endereçar explicitamente a fragilidade do vínculo por nome (R1), possivelmente estabelecendo uma chave de vínculo mais robusta entre parcelamento e cliente.

---

STATUS: AGUARDANDO INFORMAÇÕES

MOTIVO: Há dúvidas críticas de negócio (itens 1–4, 6 e 8 acima) que definem o comportamento central da sincronização e não podem ser assumidas com segurança. Necessário esclarecimento do cliente antes de avançar para a Arquitetura.
