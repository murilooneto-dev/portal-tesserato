# Design: Trava "Dev" para ferramentas sensíveis de Parâmetros

**Data:** 2026-07-01
**Status:** Aprovado

---

## Objetivo

As ferramentas "Templates de Tarefas por Atividade", "Templates de Tarefas por Grupo" e "Manutenção de Dados" (Parâmetros) alteram dados em massa e são consideradas delicadas demais para uso livre por qualquer admin. Adicionar uma trava adicional que só é liberada por um usuário "Dev" específico, via login + senha, sem afetar a sessão do admin já logado.

---

## Escopo

- As 3 seções ficam envolvidas por um único componente de bloqueio (`DevLock`) — um desbloqueio libera as três de uma vez.
- O desbloqueio dura apenas enquanto a página estiver aberta: ao recarregar `/fiscal/parametros` ou navegar para outro lugar e voltar, tranca de novo.
- Continua exigindo que o usuário já esteja logado como `admin` para sequer ver a página de Parâmetros (nada muda nessa camada existente).
- Fora de escopo: novo `role` no banco, mudanças em outras verificações de admin existentes, histórico/log de tentativas de desbloqueio, rate limiting.

---

## Como a verificação funciona

O usuário "Dev" é uma conta normal do Supabase Auth, criada manualmente (ex: via a ferramenta "Criar usuário" já existente em Parâmetros, ou direto no Supabase). Uma variável de ambiente `DEV_MASTER_EMAIL` guarda o email dessa conta.

Quando alguém tenta desbloquear (digitando login + senha na tela de trava), uma server action:
1. Confirma que quem está chamando já é um admin autenticado (via `getAuthenticatedAdmin()`, igual as outras actions de Parâmetros).
2. Cria uma instância **separada e descartável** do cliente Supabase (usando `createClient` de `@supabase/supabase-js` diretamente, com a anon key — não a versão SSR ligada aos cookies do Next.js).
3. Tenta `signInWithPassword({ email: login, password: senha })` nessa instância descartável.
4. Só retorna sucesso se o login for bem-sucedido **e** o email digitado bater (case-insensitive) com `DEV_MASTER_EMAIL`.

Como a instância usada no passo 2 nunca escreve nos cookies do Next.js, a sessão do admin que já está logado no navegador não é alterada em nenhum momento — a verificação acontece inteiramente "por trás", sem side-effects na sessão atual.

```typescript
// app/fiscal/parametros/actions.ts

import { createClient as createClienteDescartavel } from '@supabase/supabase-js'

export async function verificarSenhaDev(
  login: string,
  senha: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { ok: false, error: 'Não autorizado.' }

  const devEmail = process.env.DEV_MASTER_EMAIL
  if (!devEmail) return { ok: false, error: 'DEV_MASTER_EMAIL não configurada no servidor.' }

  if (login.trim().toLowerCase() !== devEmail.trim().toLowerCase()) {
    return { ok: false, error: 'Credenciais inválidas.' }
  }

  const clienteDescartavel = createClienteDescartavel(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await clienteDescartavel.auth.signInWithPassword({ email: login, password: senha })
  if (error) return { ok: false, error: 'Credenciais inválidas.' }

  return { ok: true }
}
```

---

## Componente `DevLock`

Novo componente `components/fiscal/DevLock.tsx`, client component, recebe `children` e renderiza:
- Se destravado (estado local `useState(false)`, sempre começa travado a cada carregamento de página): renderiza os `children` normalmente.
- Se travado: uma tela de bloqueio com campos de login e senha, botão "Desbloquear", e mensagem de erro se as credenciais forem inválidas.

```tsx
// components/fiscal/DevLock.tsx

'use client'

import { useState } from 'react'
import { verificarSenhaDev } from '@/app/fiscal/parametros/actions'

export default function DevLock({ children }: { children: React.ReactNode }) {
  const [destravado, setDestravado] = useState(false)
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleDesbloquear() {
    setVerificando(true)
    setErro('')
    const result = await verificarSenhaDev(login, senha)
    setVerificando(false)
    if (!result.ok) {
      setErro(result.error ?? 'Credenciais inválidas.')
      return
    }
    setDestravado(true)
  }

  if (destravado) return <>{children}</>

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
      <p className="text-white/60 text-sm font-semibold">🔒 Área restrita</p>
      <p className="text-white/30 text-xs max-w-sm">
        Essas ferramentas alteram dados em massa. Digite as credenciais do usuário Dev para desbloquear.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
        <input
          type="email"
          placeholder="Login"
          value={login}
          onChange={e => setLogin(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00CCEB]/50"
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleDesbloquear()}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00CCEB]/50"
        />
        <button
          onClick={handleDesbloquear}
          disabled={verificando || !login || !senha}
          className="px-4 py-2 rounded-lg bg-[#00CCEB] text-white text-xs font-semibold hover:bg-[#00b3d4] transition-colors disabled:opacity-50">
          {verificando ? 'Verificando...' : 'Desbloquear'}
        </button>
        {erro && <p className="text-red-400 text-xs">{erro}</p>}
      </div>
    </div>
  )
}
```

---

## Integração em `ParametrosClient.tsx`

As 3 seções (atualmente 3 `<div className="bg-white/3 border border-white/8 rounded-2xl p-6">` separadas: Templates por Atividade, Templates por Grupo, e Manutenção de Dados) passam a ficar todas dentro de um único `<DevLock>`:

```tsx
<DevLock>
  {/* Templates de Tarefas por Atividade */}
  <div className="bg-white/3 ...">...</div>

  {/* Templates de Tarefas por Grupo */}
  <div className="bg-white/3 ...">...</div>

  {/* Manutenção de Dados */}
  <div className="bg-white/3 ...">...</div>
</DevLock>
```

---

## Variável de ambiente

Nova variável `DEV_MASTER_EMAIL` (sem `NEXT_PUBLIC_`, só usada no servidor) precisa ser configurada manualmente:
- `.env.local` para desenvolvimento
- Vercel → Settings → Environment Variables, para produção

## Passo manual pendente (usuário)

1. Criar a conta "Dev" no Supabase Auth (email + senha à escolha).
2. Configurar `DEV_MASTER_EMAIL` com esse email, local e no Vercel.

---

## Fora de escopo

- Novo `role` de banco para o usuário Dev
- Log/histórico de tentativas de desbloqueio
- Rate limiting de tentativas de senha
- Expiração automática por tempo (só expira ao recarregar/sair da página)
