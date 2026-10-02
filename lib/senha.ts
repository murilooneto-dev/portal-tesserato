// lib/senha.ts — regra da nova senha (a mesma do Supabase: mínimo de 6 caracteres).
export const SENHA_MINIMA = 6

export interface ErroSenha { campo: 'nova' | 'confirmar'; mensagem: string }

export function validarNovaSenha(nova: string, confirmar: string): ErroSenha | null {
  if (nova.length < SENHA_MINIMA) return { campo: 'nova', mensagem: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` }
  if (nova !== confirmar) return { campo: 'confirmar', mensagem: 'As senhas não são iguais.' }
  return null
}
