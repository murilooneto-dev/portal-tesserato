# Configuração de Grupos, Regimes, Atividades e Tarefas

Data: 2026-08-14
Setores afetados: Fiscal, Contábil, Pessoal (Financeiro e Societário ficam de fora — são só páginas placeholder, sem tabela de cliente própria)

## Problema

O ponto de partida foi um problema concreto no Fiscal: tarefas avulsas criadas por usuários acumularam nomes divergentes para a mesma obrigação (ex: "REINF", "REINF R 4000", "REINF ALUGUEL" deveriam ser uma só, "REINF/DCTFWeb"). Investigando a causa raiz, descobrimos que **nenhuma tarefa hoje aponta de fato para o catálogo `tarefa_tipos`** — nem as recorrentes (`tarefas.tipo`, texto livre) nem as avulsas (`tarefas_avulsas.titulo`, texto livre). O catálogo existe mas é usado só por comparação de string.

Esse spec cobre a **base estrutural** que resolve a causa raiz: transformar grupo, regime e atividade em entidades reais, geridas por uma tela de configuração, com tarefas vinculadas a elas. A consolidação das tarefas avulsas já divergentes (o problema original) fica para um projeto seguinte, que dependerá desta base.

## Descoberta importante: colisão de nomenclatura

Antes desta mudança, os campos já existentes tinham nomes inconsistentes entre setores para o mesmo conceito:

- **Fiscal**: `clientes_fiscal.grupo` (select fixo Normal/Simples/MEI) e `clientes_fiscal.regime` (texto livre decorativo, ex. "Isenta") são dois campos **diferentes**.
- **Contábil/Pessoal**: só têm `regime` (adicionado na migration 018), que representa o mesmo conceito do `grupo` do Fiscal (Normal/Simples/MEI) — nome deliberadamente escolhido diferente do Fiscal na época.
- Não existe nos outros setores nenhum equivalente ao `clientes_fiscal.regime` decorativo.

Esta mudança resolve a colisão trocando os nomes:

- **REGIME** passa a ser, nos 3 setores, o conceito Normal/Simples/MEI (o que hoje é `clientes_fiscal.grupo` e já é `regime` em Contábil/Pessoal).
- **GRUPO** passa a ser uma lista plana e independente de classificação fiscal (ex: Isentos, Lucro Presumido, Lucro Real, MEI Caminhoneiro) — não depende do regime escolhido, e passa a existir também em Contábil e Pessoal (novo campo para esses dois setores).
- **ATIVIDADE** mantém o papel atual nos 3 setores, só migra de texto livre para entidade cadastrada.

## Modelo de dados

### Entidades novas (uma tabela por conceito, escopadas por setor)

```sql
create table regimes (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);

create table grupos (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);

create table atividades (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);
```

RLS igual ao padrão já usado em `tarefa_tipos`: leitura para qualquer autenticado, escrita só para admin.

Cada setor cadastra sua própria lista (não há compartilhamento entre setores) — o usuário popula essas tabelas do zero pela tela de configuração, não há migração automática de valores "adivinhados".

### Vínculo com o catálogo de tarefas

```sql
create table tarefa_tipo_vinculos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_tipo_id uuid not null references tarefa_tipos(id) on delete cascade,
  entidade_tipo  text not null check (entidade_tipo in ('regime', 'grupo', 'atividade')),
  entidade_id    uuid not null,
  unique (tarefa_tipo_id, entidade_tipo, entidade_id)
);
```

`entidade_id` referencia `regimes.id`, `grupos.id` ou `atividades.id` conforme `entidade_tipo` (sem FK de banco cruzando três tabelas possíveis — validado na aplicação, mesmo padrão já usado hoje em `tarefa_tipos.setor` sendo comparado a `user_setor` do cliente).

### Colunas de cliente: de texto livre para FK

Em `clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`:

- `regime_id uuid references regimes(id)` — novo, substitui `clientes_fiscal.grupo` e o `regime` atual de Contábil/Pessoal.
- `grupo_id uuid references grupos(id)` — novo nos 3 setores; no Fiscal substitui o antigo `regime` (texto livre decorativo).
- `atividade_id uuid references atividades(id)` — novo, substitui a coluna `atividade` (texto livre) nos 3 setores.

As colunas antigas (`grupo`, `regime`, `atividade` como texto) são removidas **depois** que a migração de dados (próxima seção) estiver validada — não simultaneamente, para permitir conferência.

## Migração dos dados existentes

Ordem de execução:

1. Usuário cadastra Regimes, Grupos e Atividades pela tela nova, para os 3 setores.
2. Roda-se uma migration/script que, para cada cliente, tenta casar o valor de texto livre atual (`grupo`/`regime`/`atividade`, já considerando a troca de nomes acima) com o `nome` da entidade correspondente, usando comparação normalizada (mesma função `normalizarNome()` já usada no aviso de drift de `/fiscal/parametros`: NFD + remove diacríticos + uppercase + trim).
3. Os que baterem são preenchidos automaticamente (`regime_id`/`grupo_id`/`atividade_id`).
4. Os que não baterem (nome diferente, campo vazio, etc.) ficam numa lista de revisão manual — mesmo padrão de UX já usado em "Remover parcelamentos duplicados" (`/fiscal/parametros`): analisar → tabela de pendências → usuário resolve cada um manualmente (escolhendo a entidade correta ou criando uma nova) → confirmar.
5. Só depois de zerada a lista de pendências as colunas antigas de texto são removidas.

## Tela de administração

Nova rota `/admin/configuracoes`, com 4 abas: **Grupos**, **Regimes**, **Atividades**, **Tarefas**.

- Cada aba lista os itens do setor selecionado, com CRUD simples (criar, editar nome, ativar/desativar — sem exclusão física, seguindo o padrão de `ativo` já usado em `tarefa_tipos`).
- Ao abrir um item de Grupo, Regime ou Atividade, uma lista de checkboxes com as tarefas do catálogo (`tarefa_tipos` do mesmo setor) para marcar quais tarefas esse item deve gerar. É o mesmo modelo do fluxo atual de "aplicar template" em `/fiscal/parametros`, mas persistente (vínculo salvo) em vez de uma aplicação pontual.

## Geração automática de tarefas

Hoje a lista de tarefas esperadas de um cliente vem de `tarefas_personalizadas` (array de texto), aplicado manualmente por um botão em `/fiscal/parametros` (só existe no Fiscal). Contábil e Pessoal editam esse array manualmente no modal do cliente. Isso muda:

- A lista de tarefas esperadas de um cliente passa a ser calculada a partir dos vínculos (`tarefa_tipo_vinculos`) do seu `regime_id` + `grupo_id` + `atividade_id` (união dos três), substituindo a leitura de `tarefas_personalizadas` nos ~8 pontos hoje espalhados entre os 3 setores (checklists, dashboards, relatórios, histórico). `tarefas_personalizadas` deixa de ser a fonte primária de tarefas, mas continua existindo como lista de adições manuais extras por cliente — a lista final exibida é a união entre o que os vínculos geram automaticamente e o que estiver em `tarefas_personalizadas`.
- Não existe mais um botão "aplicar" — mudar o regime/grupo/atividade de um cliente já reflete automaticamente na lista de tarefas esperadas.

### Snapshot mensal (para não reescrever histórico)

Descoberta importante na exploração do código atual: hoje não existe nenhum congelamento por mês — `tarefas_personalizadas` é um "estado vigente" único, e trocar esse array já reescreve retroativamente como todo o histórico (inclusive meses passados) é exibido em dashboards e relatórios.

Para que a geração automática não tenha esse efeito colateral:

- Introduz-se `tarefas_esperadas_mes` (`cliente_id`, `setor`, `mes`, `ano`, `tarefa_tipo_id`), que grava, para um cliente/mês/ano, a lista de tarefas que estava valendo naquele momento.
- **Meses passados** (anterior ao mês/ano corrente do calendário) são congelados na primeira vez que forem lidos após virarem passado: se ainda não existe snapshot para aquele cliente/mês/ano, ele é gerado a partir dos vínculos vigentes *naquele momento da leitura* e gravado; leituras seguintes usam o snapshot gravado, não recalculam.
- **Mês atual e futuros** continuam calculados ao vivo a partir dos vínculos correntes (sem gravar snapshot) — reagem imediatamente a mudanças de regime/grupo/atividade, sem esperar nenhuma ação manual.
- Esse mecanismo é novo (não hookado em código existente) e precisa ser replicado nos 3 setores, já que hoje cada setor tem sua própria implementação duplicada do checklist/dashboard (sem lib compartilhada).

## Fora de escopo deste projeto

- Consolidação das tarefas avulsas (`tarefas_avulsas.titulo`) e das tarefas recorrentes (`tarefas.tipo`) já gravadas com nomes divergentes em um tipo padronizado do catálogo — é o problema original relatado, mas depende desta base (entidades + vínculos) existir primeiro. Vira um projeto/spec separado.
- Financeiro e Societário — ainda são páginas placeholder sem tabela de cliente; entram quando essa estrutura existir.
- Migração automática de dados via consulta direta ao banco de produção/dev — o usuário cadastra as entidades do zero pela tela nova; a migration só tenta casar o texto livre já existente contra o que for cadastrado.
