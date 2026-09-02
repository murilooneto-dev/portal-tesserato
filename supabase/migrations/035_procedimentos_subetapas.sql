-- supabase/migrations/035_procedimentos_subetapas.sql

-- Respostas de subetapa por procedimento. Guardada como jsonb chaveado
-- pelo id da subetapa (processo_subetapas.id) — chave estável, já que não
-- existe edição de subetapa depois de criada. Valor conforme o tipo da
-- subetapa: string (texto), boolean (checklist), string|null (data ISO,
-- ou null quando não marcado). Ver
-- docs/superpowers/specs/2026-09-01-processo-subetapas-design.md e o
-- plano de "Subetapas na tela de Procedimentos" desta branch.

alter table procedimentos_societario add column subetapas jsonb not null default '{}';
