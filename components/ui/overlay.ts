// Regras puras das janelas (testáveis sem navegador).

export type MotivoFechar = 'esc' | 'fundo' | 'botao'

export function podeFechar(motivo: MotivoFechar, o: { bloqueado: boolean; fecharAoClicarFora: boolean }): boolean {
  if (o.bloqueado) return false
  if (motivo === 'fundo') return o.fecharAoClicarFora
  return true
}

export function proximoIndiceDeFoco(total: number, atual: number, paraTras: boolean): number {
  if (total <= 0) return -1
  if (paraTras) return atual <= 0 ? total - 1 : atual - 1
  return atual >= total - 1 ? 0 : atual + 1
}

export const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
