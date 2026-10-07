// lib/navegacao.ts
//
// O que aparece no menu, por perfil. Funções puras (sem React) para testar
// sem navegador. A permissão usa a MESMA regra do servidor
// (podeAcessarPagina), só para esconder o que o usuário não pode abrir —
// quem bloqueia de verdade continua sendo o proxy e o getPortalContext.
import { SETORES, SETOR_LABEL, type Profile, type UserSetor } from './types'
import { PAGINAS_POR_SETOR } from './paginas-setor'
import { podeAcessarPagina, podeAcessarSetor } from './route-permissions'

export type IconeMenu =
  | 'inicio' | 'cadastro' | 'ferramentas' | 'dashboard' | 'clientes' | 'calendario'
  | 'relatorios' | 'parcelamentos' | 'preenchimento' | 'minhas-tarefas' | 'procedimentos'
  | 'recebimentos' | 'contas-a-pagar' | 'pagamentos' | 'configuracoes' | 'vinculos'
  | 'parametros' | 'lixeira' | 'em-construcao'

export interface ItemMenu { href: string; rotulo: string; icone: IconeMenu }
export interface GrupoMenu { id: 'geral' | 'setor' | 'admin'; titulo: string; itens: ItemMenu[] }
export type PerfilMenu = Pick<Profile, 'role' | 'setores' | 'paginas_acesso'>

export const ITENS_GERAIS: ItemMenu[] = [
  { href: '/intranet', rotulo: 'Início', icone: 'inicio' },
  { href: '/clientes', rotulo: 'Cadastro de clientes', icone: 'cadastro' },
  { href: '/ferramentas', rotulo: 'Ferramentas', icone: 'ferramentas' },
]

const ICONE_PAGINA: Record<string, IconeMenu> = {
  dashboard: 'dashboard',
  clientes: 'clientes',
  calendario: 'calendario',
  relatorios: 'relatorios',
  parcelamentos: 'parcelamentos',
  'preenchimento-rapido': 'preenchimento',
  'minhas-tarefas': 'minhas-tarefas',
  procedimentos: 'procedimentos',
  recebimentos: 'recebimentos',
  'contas-a-pagar': 'contas-a-pagar',
  pagamentos: 'pagamentos',
}

function itensDoSetor(profile: PerfilMenu, setor: UserSetor): ItemMenu[] {
  if (!podeAcessarSetor(profile, setor)) return []
  const paginas = PAGINAS_POR_SETOR[setor]
  if (paginas.length === 0) return [{ href: `/${setor}`, rotulo: 'Em construção', icone: 'em-construcao' }]
  const prefixo = setor === 'configuracoes' ? '/admin/configuracoes' : `/${setor}`
  return paginas
    .filter(p => podeAcessarPagina(profile, setor, p.slug))
    .map(p => ({
      href: `${prefixo}/${p.slug}`,
      rotulo: p.label,
      icone: ICONE_PAGINA[p.slug] ?? (setor === 'configuracoes' ? 'configuracoes' : 'em-construcao'),
    }))
}

function itensAdmin(profile: PerfilMenu): ItemMenu[] {
  const itens: ItemMenu[] = []
  const ehAdmin = profile.role === 'admin'
  if (ehAdmin || (profile.setores ?? []).includes('configuracoes')) {
    itens.push({ href: '/admin/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' })
  }
  if (ehAdmin) {
    itens.push(
      { href: '/vinculos', rotulo: 'Vínculos de tarefas', icone: 'vinculos' },
      { href: '/fiscal/parametros', rotulo: 'Parâmetros', icone: 'parametros' },
      { href: '/admin/lixeira', rotulo: 'Lixeira', icone: 'lixeira' },
    )
  }
  return itens
}

export function montarMenu(profile: PerfilMenu, setorAtivo: UserSetor): GrupoMenu[] {
  const grupos: GrupoMenu[] = [
    { id: 'geral', titulo: 'Geral', itens: ITENS_GERAIS },
    { id: 'setor', titulo: SETOR_LABEL[setorAtivo], itens: itensDoSetor(profile, setorAtivo) },
    { id: 'admin', titulo: 'Administração', itens: itensAdmin(profile) },
  ]
  return grupos.filter(g => g.itens.length > 0)
}

export function estaAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function setoresVisiveis(profile: PerfilMenu): UserSetor[] {
  const base = profile.role === 'admin' ? SETORES : (profile.setores ?? [])
  return base.filter(s => s !== 'configuracoes')
}

// Páginas do setor que viram atalho no celular, na ordem de preferência do
// desenho (Clientes e Minhas tarefas); sem elas, entram as primeiras do menu.
const PREFERIDAS_NO_CELULAR = ['clientes', 'minhas-tarefas', 'recebimentos', 'procedimentos']

// Setores cujo desenho troca o Início por páginas do próprio setor (mob-06,
// mob-12). A ordem é a da barra; só entra o que o usuário pode abrir (vem do
// menu já filtrado). Sobrando lugar, entra o Início e depois o resto do menu.
const ATALHOS_DO_SETOR: Partial<Record<UserSetor, string[]>> = {
  financeiro: ['recebimentos', 'pagamentos', 'clientes'],
  societario: ['procedimentos', 'clientes'],
}

const MAX_ATALHOS = 3

function setorDosItens(itens: ItemMenu[]): UserSetor | null {
  const seg = itens[0]?.href.split('/')[1]
  return seg && (SETORES as readonly string[]).includes(seg) ? (seg as UserSetor) : null
}

export function atalhosCelular(grupos: GrupoMenu[]): ItemMenu[] {
  const doSetor = grupos.find(g => g.id === 'setor')?.itens ?? []
  const inicio = ITENS_GERAIS.find(i => i.href === '/intranet')!
  const setor = setorDosItens(doSetor)
  const proprios = setor ? ATALHOS_DO_SETOR[setor] : undefined

  if (proprios) {
    const porSlug = (slug: string) => doSetor.find(i => i.href.endsWith(`/${slug}`))
    const escolhidos = proprios.map(porSlug).filter((i): i is ItemMenu => !!i)
    if (escolhidos.length < MAX_ATALHOS) escolhidos.push(inicio)
    for (const item of doSetor) {
      if (escolhidos.length >= MAX_ATALHOS) break
      if (!escolhidos.includes(item)) escolhidos.push(item)
    }
    return escolhidos.slice(0, MAX_ATALHOS)
  }

  const prioridade = (item: ItemMenu) => {
    const i = PREFERIDAS_NO_CELULAR.findIndex(slug => item.href.endsWith(`/${slug}`))
    return i === -1 ? PREFERIDAS_NO_CELULAR.length : i
  }
  const escolhidos = doSetor
    .map((item, ordem) => ({ item, ordem }))
    .sort((a, b) => prioridade(a.item) - prioridade(b.item) || a.ordem - b.ordem)
    .slice(0, MAX_ATALHOS - 1)
    .map(x => x.item)
  return [inicio, ...escolhidos]
}

// Item do menu que corresponde à página atual (o de href mais longo, para
// /fiscal/clientes/123 cair em "Clientes" e não em algo mais genérico).
export function itemAtivo(grupos: GrupoMenu[], pathname: string): { item: ItemMenu; grupo: GrupoMenu } | null {
  let melhor: { item: ItemMenu; grupo: GrupoMenu } | null = null
  for (const grupo of grupos) {
    for (const item of grupo.itens) {
      if (estaAtivo(pathname, item.href) && (!melhor || item.href.length > melhor.item.href.length)) melhor = { item, grupo }
    }
  }
  return melhor
}

// Título da página na barra do topo do celular: o rótulo do item ativo.
export function tituloDaPagina(grupos: GrupoMenu[], pathname: string): string | null {
  return itemAtivo(grupos, pathname)?.item.rotulo ?? null
}

// Ficha de cliente de um setor (/fiscal/clientes/123): o "Voltar" do topo leva à lista do setor.
const FICHA = /^\/(fiscal|contabil|pessoal|societario|financeiro)\/clientes\/[^/]+\/?$/

export function voltarDaFicha(pathname: string): string | null {
  const m = pathname.match(FICHA)
  return m ? `/${m[1]}/clientes` : null
}

// Rótulos curtos para a barra inferior e o trilho do tablet, onde o espaço é pouco.
const ROTULO_CURTO: Record<string, string> = {
  'Cadastro de clientes': 'Cadastro',
  'Ferramentas': 'Ferram.',
  'Preenchimento rápido': 'Preench.',
  'Minhas tarefas': 'Tarefas',
  'Parcelamentos': 'Parcel.',
  'Procedimentos': 'Procedim.',
  'Recebimentos': 'Receber',
  'Pagamentos': 'Pagar',
  'Configurações': 'Config.',
  'Vínculos de tarefas': 'Vínculos',
  'Parâmetros': 'Parâm.',
  'Em construção': 'Em breve',
}

export function rotuloCurto(item: ItemMenu): string {
  return ROTULO_CURTO[item.rotulo] ?? item.rotulo
}
