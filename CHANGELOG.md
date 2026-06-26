# Changelog

Todas as mudanças relevantes deste projeto estão documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

---

## [v0.2.0] - 2026-06-26

### Adicionado
- Sidebar lateral com lucide-react, logo PNG e dot pattern gradient — substituiu TopNav horizontal
- Controle de acesso na aba Empresas: todos os usuários veem todas as empresas; Editar/Excluir disponível apenas para o responsável ou admin
- Modal de visualização read-only de empresa (botão "Ver" para não-responsáveis) — reutiliza EmpresaModal com prop `readOnly`
- Guard server-side na página de edição de empresa: redireciona para `/fiscal/empresas` se não for responsável nem admin
- Cards de agenda expandíveis: clique para ver descrição completa (componente `AgendaCard` com `useState` isolado)
- Comparação DTE: upload de planilha XLSX, extração de campos por keyword (Chave NF-e, Valor, Data, Fornecedor, UF, Número)
- Export da conferência DTE em XLSX formatado (com título) e PDF (`window.print()`)

### Alterado
- Dashboard e Histórico: headers de seção em `text-white/40`, alertas como pills `rounded-full`
- Upload de arquivos: MIME types `xlsx`/`xls` adicionados em `TIPOS_PERMITIDOS`
- Logo transparente (`public/logo.png`) na Sidebar e na tela de login

### Corrigido
- Import estático `import * as XLSX from 'xlsx'` — dynamic import retornava `undefined` no browser
- Alinhamento do PDF de conferência: tabela à esquerda, título/resumo centralizados

### Arquivos alterados
- `app/fiscal/layout.tsx` — Sidebar lateral substituindo TopNav
- `components/fiscal/Sidebar.tsx` — reescrito com lucide-react, logo PNG, dot pattern
- `app/fiscal/dashboard/page.tsx` — headers white/40, pills de alerta, progress bar gradient
- `app/fiscal/historico/page.tsx` — headers white/40
- `app/login/page.tsx` — logo PNG 96×96 com `unoptimized`
- `app/fiscal/clientes/actions.ts` — MIME types xlsx/xls adicionados
- `app/fiscal/clientes/[id]/page.tsx` — filtra `.xlsx?` antes de passar para ClienteConferencia
- `components/fiscal/ClienteConferencia.tsx` — XLSX estático, extração por column-keyword, export XLSX+PDF
- `app/fiscal/agenda/page.tsx` — AgendaCard extraído como componente com useState isolado
- `app/fiscal/empresas/page.tsx` — removido filtro por responsável; passa `profileNome` e `isAdmin`
- `app/fiscal/empresas/EmpresasClient.tsx` — lógica `podeEditar`, botões condicionais Editar/Ver/Excluir
- `app/fiscal/empresas/[id]/editar/page.tsx` — guard server-side com redirect
- `components/fiscal/EmpresaModal.tsx` — prop `readOnly` para modo visualização
- `package.json` — `lucide-react` adicionado
- `public/logo.png` — PNG 507×510 com fundo transparente (novo)
- `public/ICONESTART.png` — ícone adicional (novo)

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
