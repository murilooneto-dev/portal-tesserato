# Changelog

Todas as mudanças relevantes deste projeto estão documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

---

## [v0.1.1] - 2026-06-26

### Corrigido
- Layout fiscal não desconecta mais usuários autenticados que não possuem registro na tabela `profiles`
- TopNav não crasha se `profile.nome` for null (null guard com fallback para inicial do e-mail)
- Checklist de tarefas agora usa os tipos personalizados do cliente quando disponíveis

### Arquivos alterados
- `app/fiscal/layout.tsx` — safeProfile: não redireciona se profile null, apenas se user null
- `components/fiscal/TopNav.tsx` — `(profile.nome ?? 'U').charAt(0)` para evitar crash
- `app/fiscal/clientes/[id]/page.tsx` — passa `tarefasPersonalizadas` ao TarefaChecklist
- `components/fiscal/TarefaChecklist.tsx` — usa `tarefasPersonalizadas` se disponível, fallback para tipos por grupo

---
