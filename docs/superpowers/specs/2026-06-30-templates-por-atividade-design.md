# Design: Templates de Tarefas por Atividade

**Data:** 2026-06-30  
**Status:** Aprovado

---

## Objetivo

Substituir o sistema de tarefas padrão baseado em `grupo` (normal/simples/mei) por um sistema baseado em `atividade` (Serviço/Comércio/Indústria), com templates configuráveis via Parâmetros e aplicação incremental aos clientes existentes.

---

## Regras de negócio

### Templates base (3 únicos configuráveis)
- **Serviço** → lista de tarefas A, B, C…
- **Comércio** → lista de tarefas D, E…
- **Indústria** → lista de tarefas F, G…

### Atividades combinadas (derivadas automaticamente)
| Atividade do cliente | Tarefas resultantes |
|---|---|
| Serviço | base Serviço |
| Comércio | base Comércio |
| Indústria | base Indústria |
| Serviço e Comércio | base Serviço ∪ base Comércio |
| Serviço e Indústria | base Serviço ∪ base Indústria |
| Comércio e Indústria | base Comércio ∪ base Indústria |
| Serviço, Comércio e Indústria | base Serviço ∪ base Comércio ∪ base Indústria |

A união preserva a ordem (Serviço → Comércio → Indústria) e elimina duplicatas.

### Sem atividade definida
Cliente sem `atividade` → sem tarefas padrão. Operador deve preencher `tarefas_personalizadas` manualmente.

### Fonte de verdade: sempre `tarefas_personalizadas`
Os templates **nunca** ficam como referência viva. Ao aplicar, o sistema apenas **adiciona** ao `tarefas_personalizadas` do cliente as tarefas do template que ainda não existem — nunca remove, nunca reordena, nunca sobrescreve.

---

## Banco de dados

### Nova tabela: `atividade_templates`

```sql
CREATE TABLE atividade_templates (
  atividade TEXT PRIMARY KEY,  -- 'Serviço' | 'Comércio' | 'Indústria'
  tarefas   TEXT[] NOT NULL DEFAULT '{}'
);

-- Seed inicial (vazio — admin preenche via Parâmetros)
INSERT INTO atividade_templates (atividade) VALUES
  ('Serviço'), ('Comércio'), ('Indústria');
```

Apenas 3 linhas. Atividades combinadas são computadas em runtime, não armazenadas.

### RLS
Leitura: `authenticated`. Escrita: service role (via server action com `getAuthenticatedAdmin()`).

---

## Função utilitária: `resolverTemplateAtividade`

```typescript
// lib/atividade-templates.ts

const BASES: Record<string, string> = {
  'Serviço':   'Serviço',
  'Comércio':  'Comércio',
  'Indústria': 'Indústria',
}

/** Extrai as atividades base de uma atividade composta */
export function basesDeAtividade(atividade: string): string[] {
  return Object.keys(BASES).filter(base => atividade.includes(base))
}

/** Calcula as tarefas para uma atividade, unindo os templates base */
export function resolverTemplate(
  atividade: string,
  templates: Record<string, string[]>
): string[] {
  const bases = basesDeAtividade(atividade)
  const seen = new Set<string>()
  const result: string[] = []
  for (const base of bases) {
    for (const t of templates[base] ?? []) {
      if (!seen.has(t)) { seen.add(t); result.push(t) }
    }
  }
  return result
}
```

---

## Parâmetros — nova seção "Templates de Tarefas"

### UI (seção nova no `ParametrosClient.tsx`)
- 3 cards expansíveis: **Serviço**, **Comércio**, **Indústria**
- Cada card: lista editável de tarefas (adicionar por texto, remover com ×, reordenar com drag ou setas)
- Botão **"Salvar template"** por card (salva só aquele)
- Botão **"Aplicar a clientes existentes"** por card — executa o merge no servidor
- Preview somente-leitura das 4 atividades combinadas (calculado ao vivo no client)

### Server actions (em `app/fiscal/parametros/actions.ts`)
- `salvarTemplate(atividade: string, tarefas: string[])` — upsert na tabela
- `aplicarTemplateAClientes(atividade: string)` — merge incremental

### Lógica de merge (`aplicarTemplateAClientes`)
```
Para cada cliente onde cliente.atividade inclui a atividade base:
  tarefasTemplate = resolverTemplate(cliente.atividade, todosTemplates)
  novas = tarefasTemplate.filter(t => !cliente.tarefas_personalizadas?.includes(t))
  if novas.length > 0:
    UPDATE clientes SET tarefas_personalizadas = [...existentes, ...novas]
```

---

## Formulário de novo cliente (EmpresaModal)

Quando o campo `atividade` mudar:
1. Busca templates base do servidor (ou carrega junto com a página)
2. Chama `resolverTemplate(novaAtividade, templates)` no client
3. Pré-preenche `tarefas_personalizadas` com o resultado
4. Operador pode editar antes de salvar

Os templates são passados como prop para `EmpresaModal` — sem fetch extra na hora.

---

## Impacto em código existente

| Arquivo | Mudança |
|---|---|
| `TAREFAS_GRUPOS` (dashboard, empresas, clientes pages) | **Removido** — `tiposCliente()` retorna `tarefas_personalizadas ?? []` |
| `components/fiscal/EmpresaModal.tsx` | Troca `TAREFAS_PADRAO[grupo]` por `resolverTemplate(atividade, templates)` |
| `app/fiscal/parametros/page.tsx` | Carrega `atividade_templates` do banco |
| `app/fiscal/parametros/ParametrosClient.tsx` | Nova seção de templates |
| `app/fiscal/parametros/actions.ts` | 2 novas actions |
| `lib/atividade-templates.ts` | Arquivo novo com funções utilitárias |

### `tiposCliente()` simplificada (pós-migração)
```typescript
function tiposCliente(c: Cliente): string[] {
  return c.tarefas_personalizadas ?? []
}
```

O `tiposMap` no dashboard continua igual — apenas o conteúdo muda.

---

## Sequência de migração recomendada

1. Criar tabela `atividade_templates` no Supabase
2. Deploy do código
3. Admin entra em Parâmetros → preenche os 3 templates
4. Clica "Aplicar a clientes existentes" para cada base (Serviço, Comércio, Indústria)
5. Clientes sem atividade ficam com `tarefas_personalizadas` existente intacta

---

## Fora de escopo

- Edição das opções de atividade (lista fixa de 7)
- Histórico de mudanças nos templates
- Remoção de tarefas de clientes ao atualizar template
