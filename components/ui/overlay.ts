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

// Gerenciar pilha de diálogos abertos
const pilhaDialogos: symbol[] = []
let overflowAnterior: string | null = null

export function abrirNaPilha(id: symbol): void {
  if (!pilhaDialogos.includes(id)) pilhaDialogos.push(id)
}

export function fecharNaPilha(id: symbol): void {
  const i = pilhaDialogos.indexOf(id)
  if (i >= 0) pilhaDialogos.splice(i, 1)
}

export function estaNoTopo(id: symbol): boolean {
  return pilhaDialogos[pilhaDialogos.length - 1] === id
}

export function pilhaVazia(): boolean {
  return pilhaDialogos.length === 0
}

export function salvarEBloquearScroll(): void {
  if (pilhaVazia()) {
    overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

export function restaurarScroll(): void {
  if (pilhaVazia() && overflowAnterior !== null) {
    document.body.style.overflow = overflowAnterior
    overflowAnterior = null
  }
}

// O clique na barra de rolagem do fundo tem o próprio fundo como alvo; não deve fechar.
export function cliqueNaBarraDeRolagem(clientX: number, larguraUtil: number): boolean {
  return clientX >= larguraUtil
}
