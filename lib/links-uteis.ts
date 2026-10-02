// lib/links-uteis.ts — regras dos links úteis do Início (funções puras).
import type { LinkRapido } from './types'

export interface EdicaoLink { titulo: string; url: string }
export interface ErrosLink { titulo?: string; url?: string }

/** Endereço salvo sem protocolo ("www.site.com.br") abriria como caminho do portal; vira https. */
export function hrefDoLink(url: string): string {
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function dominioDoLink(url: string): string {
  try { return new URL(hrefDoLink(url)).hostname } catch { return '' }
}

export function inicialDoLink(titulo: string): string {
  return titulo.trim().charAt(0).toUpperCase() || '?'
}

function enderecoCompleto(url: string): boolean {
  let host: string
  let porta: string
  try { const u = new URL(hrefDoLink(url)); host = u.hostname; porta = u.port } catch { return false }
  // Rede interna: IPv4 ou host com porta explícita (servidor:8080, localhost:3000).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  if (porta && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(host)) return true
  const partes = host.replace(/^www\./i, '').split('.')
  return partes.length >= 2 && partes.every(Boolean) && /^[a-z]{2,}$/i.test(partes[partes.length - 1])
}

export function validarLink(titulo: string, url: string): ErrosLink {
  const erros: ErrosLink = {}
  if (!titulo.trim()) erros.titulo = 'Informe o nome.'
  if (!url.trim()) erros.url = 'Informe o endereço.'
  else if (!enderecoCompleto(url)) erros.url = 'Endereço incompleto'
  return erros
}

export function temErro(e: ErrosLink): boolean {
  return Boolean(e.titulo || e.url)
}

/** Só os links cuja edição difere do que está salvo (sem contar espaços nas pontas). */
export function linksAlterados(links: LinkRapido[], edicoes: Record<string, EdicaoLink>): (EdicaoLink & { id: string })[] {
  return links.flatMap(l => {
    const e = edicoes[l.id]
    if (!e) return []
    const titulo = e.titulo.trim()
    const url = e.url.trim()
    return titulo === l.titulo && url === l.url ? [] : [{ id: l.id, titulo, url }]
  })
}

export function linksAtivos(links: LinkRapido[]): LinkRapido[] {
  return links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)
}
