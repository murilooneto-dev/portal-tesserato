# Lixeira de exclusões (rede de segurança contra exclusão acidental) — Design

**Data:** 2026-09-29 · **Status:** aguardando revisão · **Branch:** `feat/exclusao-cliente-confirmacao` (PR #184, mesmo merge)
**Origem:** levantamento de exclusão acidental de 2026-09-29 (item 2 do plano; o item 1 — confirmação forte de exclusão de cliente — já está na #184).

## 1. Objetivo

Toda linha apagada de uma tabela protegida, **por qualquer caminho** (tela, Server Action, chamada direta à API do Supabase, ou cascata do banco), fica guardada por **60 dias** com quem apagou, quando e em qual exclusão. Um admin consegue **restaurar uma exclusão inteira** (por exemplo, um cliente com tudo o que foi levado junto em cascata) por uma tela "Lixeira".

**Sucesso =** apagar um cliente de teste no dev, ver a exclusão agrupada na Lixeira (cliente + tarefas + etapas + anexos), restaurar, e o banco ficar **idêntico** ao que era antes da exclusão.

## 2. Contexto e restrições (verificados)

- Hoje não há lixeira nem soft delete: ~60 pontos de código fazem `DELETE` definitivo; o único recurso de recuperação é o backup em `tesserato-backups` (quarta e sexta, 90 dias, restauração manual do banco inteiro).
- `clientes` tem `ON DELETE CASCADE` para fichas por setor, tarefas (→ etapas e anexos), eventos avulsos, `client_files`, notas, observações, grupos de tarefas e histórico de responsável. `procedimentos_societario` é `NO ACTION` (bloqueia a exclusão).
- **Verificado no dev em 2026-09-29:** um trigger `BEFORE DELETE` por linha, instalado nas tabelas filhas, **dispara também nas exclusões em cascata** (inclusive em dupla cascata cliente → tarefas → etapas), e todas ocorrem na **mesma transação** (mesmo `txid_current()`). Isso permite agrupar uma exclusão inteira.
- Arquivos anexos ficam **no banco, em base64** (`content_base64`) em `client_files`, `tarefa_arquivos`, `evento_arquivos`, `procedimento_arquivos`.
- **Plano Supabase gratuito (limite de 500 MB).** Produção hoje: maiores tabelas `evento_arquivos` 12 MB, `tarefas` 4,4 MB, `client_files` 3,9 MB (≈ 21 MB somados), com folga grande. Por isso o conteúdo dos anexos **é incluído** na lixeira.
- A maioria das exclusões usa a chave de serviço (`getAuthenticatedAdmin()` devolve `createAdminClient()`), em que `auth.uid()` é nulo. A autoria precisa de outro mecanismo (seção 5).
- Não existe nenhum trigger de usuário no banco hoje (terreno limpo). `pg_cron` está disponível, mas não instalado.
- Trabalho **somente no dev**. Produção só quando o usuário decidir.

## 3. Alternativas consideradas

| Abordagem | Cobre | Custo |
|---|---|---|
| **A. Trigger genérico `BEFORE DELETE` copiando a linha para `lixeira`** ✅ | Todo caminho e a cascata | Um trigger por tabela; nenhum ponto de código existente muda para capturar |
| B. Soft delete (`deleted_at`) | Só onde eu filtrar | Alteraria ~60 leituras e as RLS: alto risco de regressão |
| C. Copiar dentro de cada Server Action | Só esse caminho | Não pega API direta nem cascata; lógica repetida |

## 4. Modelo de dados

### 4.1 Tabela `public.lixeira`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `bigint generated always as identity` | PK |
| `grupo` | `bigint not null` | `txid_current()`; une tudo o que saiu na mesma transação |
| `tabela` | `text not null` | nome da tabela de origem |
| `registro_id` | `text` | `dados->>'id'`, com fallback `dados->>'cliente_id'` (fichas por setor) |
| `dados` | `jsonb not null` | a linha inteira (`to_jsonb(OLD)`), incluindo `content_base64` |
| `excluido_em` | `timestamptz not null default now()` | |
| `excluido_por` | `uuid` | pode ser nulo (autor desconhecido) |
| `origem_autor` | `text not null` | `'sessao'`, `'servico'` ou `'desconhecido'` |
| `expira_em` | `timestamptz not null default now() + interval '60 days'` | |
| `restaurado_em` | `timestamptz` | |
| `restaurado_por` | `uuid` | |

Índices: `(grupo)`, `(excluido_em desc)`, `(expira_em)`.

**RLS ligada; só admin** (`is_admin()`) lê e altera. Nenhuma outra policy: usuários comuns e anônimo não enxergam nada. A tabela **não** tem trigger próprio (a limpeza não cai em laço).

### 4.2 Tabelas protegidas (1ª entrega)

`clientes`, `clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`, `cliente_responsavel_historico`, `tarefas`, `tarefa_etapas`, `tarefa_arquivos`, `tarefas_avulsas`, `evento_arquivos`, `client_files`, `cliente_notas`, `observacoes_clientes`, `tarefa_grupos`, `parcelamentos`, `financeiro_movimentos`, `procedimentos_societario`, `procedimento_arquivos`.

**Fora da 1ª entrega:** tabelas de planilha, catálogos de configuração (`tarefa_tipos`, vínculos, regimes, grupos, atividades, processo_tipos…), agenda, links, e as tabelas de log. O plano confirma que cada nome existe no dev antes de criar o trigger.

## 5. Captura e autoria

### 5.1 Trigger `public.lixeira_capturar()`

- `BEFORE DELETE FOR EACH ROW`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`. Precisa ser `SECURITY DEFINER` porque quem apaga (um operador, por exemplo) não tem permissão de escrita em `lixeira`.
- Insere uma linha em `lixeira` com `grupo = txid_current()`, `dados = to_jsonb(OLD)` e a autoria da seção 5.2. Retorna `OLD`.
- **Falha fechada para a cópia:** se o `INSERT` em `lixeira` falhar, a exclusão inteira falha e nada se perde. **Falha aberta para a autoria:** erro ao interpretar autor/headers é engolido e o autor fica nulo, sem bloquear.

### 5.2 Autoria

1. Se `auth.uid()` não for nulo (exclusão pela sessão do usuário) → `excluido_por = auth.uid()`, `origem_autor = 'sessao'`.
2. Senão, se o JWT (`request.jwt.claims`) tem `role = 'service_role'` → lê o header `x-app-usuario` de `request.headers` → `excluido_por` e `origem_autor = 'servico'`. O header **só é honrado com a chave de serviço**, então quem usa a chave pública (anon) não consegue forjar autoria.
3. Senão → `excluido_por` nulo, `origem_autor = 'desconhecido'`.

No app, `createAdminClient(usuarioId?)` passa `global.headers['x-app-usuario']`, e `getAuthenticatedAdmin()` o chama com o `user.id` que já autenticou. Uma única mudança cobre as ~28 Server Actions que usam a chave de serviço.

**Risco eliminado (spike feito em 2026-09-29, dev):** o PostgREST do projeto expõe ao Postgres tanto o header customizado (`request.headers` → `x-app-usuario`) quanto as claims do JWT (`request.jwt.claims` → `role`, `sub`). Testado chamando uma função de diagnóstico temporária pela API REST com o login do admin e um header `x-app-usuario`; a função foi removida em seguida. O plano B (função SQL de exclusão de cliente que fixa o usuário) **não é necessário**.

## 6. Restauração

### 6.1 Função `public.lixeira_restaurar(p_grupo bigint, p_usuario uuid) returns jsonb`

- `SECURITY DEFINER`, `search_path` fixo. `EXECUTE` revogado de `public`, `anon` e `authenticated`; concedido só a `service_role`. Como é chamada por uma Server Action com chave de serviço (em que `auth.uid()` é nulo), **verifica dentro** que `p_usuario` tem `role = 'admin'` em `profiles`.
- Recusa se o grupo não existir ou já estiver restaurado.
- Reinsere as linhas **na ordem de dependência (pais antes de filhos)**, derivada das chaves estrangeiras reais entre as 18 tabelas (verificadas no dev): `clientes`, `parcelamentos` (pai de `tarefas.parcelamento_id`), fichas por setor, histórico de responsável, notas, observações, grupos, `client_files`, `procedimentos_societario`, `tarefas`, `tarefas_avulsas`, `tarefa_etapas`, `tarefa_arquivos`, `evento_arquivos`, `procedimento_arquivos`, `financeiro_movimentos`. Usa `jsonb_populate_record(null::<tabela>, dados)`. Nenhuma das 18 tabelas tem coluna gerada ou `identity always`.
- **Tudo ou nada:** se um id já existir ou um pai não existir (ex.: restaurar tarefas de um cliente que também foi apagado e ainda não foi restaurado), o Postgres recusa, a função devolve uma mensagem em português e **nada** é restaurado.
- Ao restaurar uma ficha de setor (`clientes_contabil` etc.) cujo cliente ainda existe, **reinclui o setor em `clientes.setores`** (essa alteração é um `UPDATE` e não passa pela lixeira). Vale para o caso "remover do Contábil".
- Marca `restaurado_em` e `restaurado_por` e devolve o resumo por tabela.
- **Não restaura** vínculos que o banco apenas anulou (`SET NULL` em `evento_log.cliente_id`, `planilha_linhas`, `task_unlock_log`): limitação documentada.

## 7. Limpeza

- `public.lixeira_limpar()` (`SECURITY DEFINER`) apaga as linhas com `expira_em < now()`. Sempre chamada quando o admin abre a Lixeira.
- **Extra opcional:** bloco na migration que tenta `create extension pg_cron` e agenda a limpeza diária (03:17 UTC). Se a extensão não puder ser habilitada, a migration segue e emite aviso (a limpeza ao abrir a página continua valendo).

## 8. Interface e código da aplicação

- **`lib/lixeira.ts`** (puro, testável): agrupa as linhas por `grupo`; escolhe a **raiz** por prioridade de tabela; monta o título e o resumo ("Cliente ACME + 19 tarefas, 3 anexos") a partir de `dados`; rótulos de tabela; texto de expiração.
- **`public.lixeira_listar(p_limite)`** (SQL, `SECURITY DEFINER`, só `service_role`): devolve as linhas da lixeira **sem** o conteúdo (`dados`), apenas um subconjunto de campos para título (`nome`, `name`, `titulo`, `empresa`, `secao`, `tipo`, `mes`, `ano`, `natureza`, `valor`, `setor`). Assim o `content_base64` dos anexos nunca trafega para a listagem.
- **`lib/lixeira-actions.ts`** (`'use server'`): `listarExclusoes()` (chama a limpeza antes, agrupa e resolve o nome de quem apagou) e `restaurarExclusao(grupo)`; ambas exigem `role = 'admin'`, devolvem `{ error }` em vez de lançar.
- **`app/admin/lixeira/page.tsx`** + componente cliente: lista com data, autor, resumo, expiração e botão **Restaurar** (com confirmação); mostra o erro em português quando a restauração é recusada. Item "Lixeira" no menu de admin.
- **`createAdminClient(usuarioId?)`** e **`getAuthenticatedAdmin()`** em `lib/supabase/server.ts` (header de autoria).
- **Ajuste no modal da #184:** o texto "Esta ação não pode ser desfeita" passa a dizer que só um administrador pode restaurar, por até 60 dias. O alerta continua forte de propósito (funciona como freio).
- A tela **não exibe** o conteúdo de `dados` (só o resumo), por conter dados sensíveis.

## 9. Segurança e privacidade

`lixeira` contém dados de clientes e anexos: RLS só para admin, sem exposição em listagens, `EXECUTE` das funções restrito à chave de serviço, autoria só honrada com chave de serviço, `search_path` fixo nas funções `SECURITY DEFINER`.

## 10. Testes e verificação

1. **TypeScript (TDD):** `lib/lixeira.ts` (agrupamento, raiz, resumo, expiração) e a montagem do header de autoria.
2. **SQL:** `supabase/tests/055_lixeira_smoke.sql` (tabela, RLS ligada, policies só admin, triggers instalados em cada tabela protegida, funções com `EXECUTE` restrito) e um teste de comportamento numa transação desfeita: criar cliente com filhos, apagar, conferir o grupo na lixeira, restaurar e comparar linha a linha com o original.
3. **Dev real:** apagar um cliente descartável pela tela e restaurar pela Lixeira, conferindo autoria; testar a recusa de restauração (conflito e pai ausente); testar exclusão por API direta (autor desconhecido).
4. **Migration 055** aplicada **só no dev**, com `supabase/rollback/055_rollback.sql` testado (remove triggers, funções e tabela) e reaplicação. `tsc`, testes e `next build` limpos.

## 11. Implantação e risco

- **Produção: nada agora.** Quando for a hora: 055 é aditiva e segura antes do código (só passa a registrar); o header de autoria só depende do código publicado. Reaproveita o protocolo de backup, snapshot e rollback já usado.
- Riscos: (a) falha da cópia bloqueia a exclusão — proposital; (b) crescimento do banco — limitado por 60 dias e folga atual; a tela pode mostrar total de linhas; (c) restauração recusada por conflito — mensagem clara; (d) disponibilidade de `request.headers` — spike no início do plano, com plano B descrito.

## 12. Fora do escopo (futuro)

Planilhas, catálogos, agenda e logs na lixeira; excluir definitivamente / esvaziar manualmente; restauração por linha (só por exclusão inteira); alertas; ligar os `confirm()` nativos restantes (parcelamento, procedimento, tipos de tarefa, anexo de evento) a mensagens que apontem para a Lixeira; backup ter/qui/sáb (frente separada).
