# Changelog

Todas as mudanças relevantes deste projeto estão documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

---

## [v0.3.3] - 2026-06-26

### Corrigido
- **Tarefas**: marcar tarefa como concluída agora funciona corretamente — server action substituído de `upsert` (que exigia unique constraint ausente no banco) para `select + update/insert` explícito
- **Tarefas**: checkbox responde visualmente de imediato ao clique via estado otimista, sem aguardar round-trip ao servidor

### Arquivos alterados
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` reescrito com select+update/insert em vez de upsert
- `components/fiscal/TarefaChecklist.tsx` — estado otimista adicionado para resposta imediata ao clique

---

## [v0.3.2] - 2026-06-26

### Corrigido
- **Relatórios**: cálculo de progresso agora usa os registros reais da tabela `tarefas` (total e concluídas por cliente/mês/ano), igual ao Dashboard e Histórico — antes usava lista hardcoded que ignorava tarefas dinâmicas/personalizadas
- **Relatórios**: filtro "Apenas pendências" e lista de tarefas pendentes passam a refletir o estado real do banco

### Arquivos alterados
- `app/fiscal/relatorios/page.tsx` — função `progresso` reescrita para usar tarefas reais em vez de tipos hardcoded

---

## [v0.3.1] - 2026-06-26

### Corrigido
- **Agenda (Intranet)**: botão "Ver descrição" adicionado em cada compromisso do modal de dia — expande a descrição completa com `break-words` para evitar overflow de texto longo
- **Agenda (Intranet)**: modais de ver dia e de formulário ampliados (`max-w-xl`), painel de itens com altura maior (`max-h-[32rem]`)
- **Agenda (Intranet)**: campo Título convertido de `<input>` para `<textarea rows={1}>` para quebrar linha em textos longos; Descrição com `rows={8}`
- **Login**: logo carregada via `<img>` nativo em vez de `<Image>` do Next.js (evita falha de serving intermitente no Vercel)
- **Sidebar**: logo corrigida para `<img>` nativo; link Admin já incluído desde v0.3.0

### Arquivos alterados
- `components/fiscal/AgendaPessoal.tsx` — expand de descrição por item, modais maiores, wrap de texto, textarea de título
- `app/fiscal/agenda/page.tsx` — AgendaCard com botão "Ver descrição" (página standalone)
- `app/login/page.tsx` — logo via `<img>` nativo
- `components/fiscal/Sidebar.tsx` — logo via `<img>` nativo

---

## [v0.3.0] - 2026-06-26

### Adicionado
- Ferramenta **Corrigir Encoding de Atividades** na página Admin: detecta qualquer valor de atividade fora do padrão (não só chars quebrados), sugere correção via normalização NFD + Levenshtein fuzzy, e oferece `<select>` manual para casos sem sugestão automática
- Ferramenta **Corrigir Encoding de Tarefas** na página Admin: escaneia `clientes.tarefas_personalizadas` e `tarefas.tipo` com a mesma lógica, agrupando por cliente e tipo; campo de texto livre para tipos personalizados sem sugestão
- Link **Admin** na Sidebar com ícone `ShieldCheck` (visível apenas para admins)
- Filtro de **Atividade** na página de Relatórios, populado dinamicamente dos clientes cadastrados

### Alterado
- Relatórios: filtro de Tarefas removido e substituído pelo filtro de Atividade
- Página Admin expandida para `max-w-4xl` para acomodar as tabelas de correção

### Arquivos alterados
- `components/fiscal/CorrigirAtividadesClient.tsx` — novo componente de correção de atividades (NFD + fuzzy Levenshtein)
- `components/fiscal/CorrigirTarefasClient.tsx` — novo componente de correção de tarefas (template + registros)
- `app/fiscal/admin/page.tsx` — duas novas seções de correção adicionadas
- `components/fiscal/Sidebar.tsx` — link Admin com ShieldCheck
- `app/fiscal/relatorios/page.tsx` — filtro de atividade substituindo filtro de tarefas

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
