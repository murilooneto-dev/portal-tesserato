# Clientes Geral — modal de visualização somente-leitura para dados de setor

**Data:** 2026-07-14
**Branch:** feat/clientes-geral

## Problema

Ao abrir um cliente existente na tela `/clientes` (Clientes Geral), o `ClienteGeralModal` mostra o bloco "Dados do Fiscal" (via `CamposFiscais`) editável para admins. Isso permite editar dados fiscais fora da tela do setor (`/fiscal/clientes`), que é o cadastro canônico desses dados — criando risco de divergência e duplicando o ponto de edição.

## Objetivo

- O bloco de dados por setor (hoje só "Dados do Fiscal"; futuramente "Dados Contábil" etc.) nunca é editável a partir de Clientes Geral, para nenhum usuário — edição só acontece na aba do setor específico (ex: `/fiscal/clientes`).
- Esse bloco fica recolhido por padrão (accordion), com indicação visual de que é somente leitura.
- Os campos gerais do cliente (Razão Social, CNPJ, Município, UF, Contato, Setores) continuam com o comportamento atual: editáveis por admin, somente leitura para os demais (`readOnly={!isAdmin}` já existente em `ClientesGeralLista.tsx`).
- O fluxo de criação de cliente novo (`+ Novo Cliente`) não muda — o bloco de dados fiscais continua editável ali, pois é o único ponto de entrada para vincular dados fiscais iniciais na criação.

## Escopo

Fora de escopo: criar blocos de dados para Contábil/Pessoal/Societário/Financeiro (ainda não existem campos definidos para esses setores). O componente de collapse é construído de forma reutilizável para quando esses blocos forem criados.

## Design

### Componente novo: `components/geral/SectorSection.tsx`

Accordion simples e reutilizável:

```ts
interface Props {
  title: string          // ex: "Dados do Fiscal"
  note?: string          // ex: "Somente leitura — edite em Fiscal → Clientes"
  defaultOpen?: boolean  // default false
  children: React.ReactNode
}
```

- Header clicável (título + `note` opcional em texto menor + ícone de seta que rotaciona).
- Clique alterna estado local (`useState`) entre aberto/fechado.
- Conteúdo só renderiza quando aberto (sem animação de altura — simples show/hide, consistente com o resto do app).
- Estilo visual reaproveita as classes já usadas no bloco atual (`rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 p-4`).

### Mudança em `components/geral/ClienteGeralModal.tsx`

No bloco `mostraFiscal && (...)`:

- Quando `isEdit === true` (cliente existente): envolver `CamposFiscais` em `<SectorSection title="Dados do Fiscal" note="Somente leitura — edite em Fiscal → Clientes" defaultOpen={false}>`, e passar `readOnly={true}` fixo para `CamposFiscais` (ignorando a prop `readOnly` recebida do modal, que continua controlando só os campos gerais).
- Quando `isEdit === false` (criação de cliente novo): comportamento inalterado — bloco sempre visível/expandido, `CamposFiscais` recebe a prop `readOnly` normal do modal (que é `false` nesse fluxo, pois só admin abre criação).

Nenhuma mudança em `ClientesGeralLista.tsx` — o `readOnly={!isAdmin}` passado ao modal continua controlando só os campos gerais, como hoje.

## Testes manuais

- Login admin → `/clientes` → abrir cliente existente com setor Fiscal: campos gerais editáveis, bloco "Dados do Fiscal" recolhido, ao expandir todos os campos desabilitados (inputs, checkboxes, selects, botão de adicionar/remover tarefa ausente).
- Login admin → `/clientes` → `+ Novo Cliente` → marcar setor Fiscal: bloco de dados fiscais aparece expandido e editável, igual hoje.
- Login não-admin → `/clientes` → abrir cliente existente: nada editável (comportamento já existente, sem mudança).
- Confirmar que `/fiscal/clientes` (EmpresaModal) continua editando os mesmos dados normalmente, sem regressão.
