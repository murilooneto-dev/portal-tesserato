// lib/processo-tipos.ts

export type SubetapaTipoResposta = 'texto' | 'checklist' | 'data'

export interface SubetapaForm {
  id?: string | null // id real no banco; ausente/null = subetapa nova
  nome: string
  tipoResposta: SubetapaTipoResposta
}

export interface EtapaForm {
  nomeOriginal?: string | null // nome da etapa ao abrir a edição; ausente/null = etapa nova
  nome: string
  subetapas: SubetapaForm[]
}

export interface ProcessoSubetapaResumo {
  id: string
  nome: string
  tipoResposta: SubetapaTipoResposta
}

export interface ProcessoEtapaResumo {
  nome: string
  subetapas: ProcessoSubetapaResumo[]
}

export interface ProcessoTipoResumo {
  id: string
  nome: string
  etapas: ProcessoEtapaResumo[]
}

// Shape cru de `processo_tipos` (select('id, nome, etapas')) — a coluna
// etapas (text[]) não muda, é a mesma lida por
// app/societario/procedimentos/page.tsx.
export interface ProcessoTipoRow {
  id: string
  nome: string
  etapas: string[] | null
}

// Shape cru de `processo_subetapas` — não tem relação de FK direta com
// uma "etapa" (que não existe como entidade), por isso o agrupamento é
// feito aqui em JS por (processo_tipo_id, etapa_nome).
export interface ProcessoSubetapaRow {
  id: string
  processo_tipo_id: string
  etapa_nome: string
  nome: string
  tipo_resposta: SubetapaTipoResposta
  ordem: number
}

export function montarProcessoTipos(tipos: ProcessoTipoRow[], subetapas: ProcessoSubetapaRow[]): ProcessoTipoResumo[] {
  return tipos.map(tipo => ({
    id: tipo.id,
    nome: tipo.nome,
    etapas: (tipo.etapas ?? []).map(etapaNome => ({
      nome: etapaNome,
      subetapas: subetapas
        .filter(s => s.processo_tipo_id === tipo.id && s.etapa_nome === etapaNome)
        .sort((a, b) => a.ordem - b.ordem)
        .map(s => ({ id: s.id, nome: s.nome, tipoResposta: s.tipo_resposta })),
    })),
  }))
}

export function adicionarEtapa(etapas: EtapaForm[], nome: string): EtapaForm[] {
  const nomeTrim = nome.trim()
  if (!nomeTrim) return etapas
  return [...etapas, { nome: nomeTrim, subetapas: [] }]
}

export function removerEtapa(etapas: EtapaForm[], index: number): EtapaForm[] {
  return etapas.filter((_, i) => i !== index)
}

export function adicionarSubetapa(
  etapas: EtapaForm[],
  etapaIndex: number,
  nome: string,
  tipoResposta: SubetapaTipoResposta,
): EtapaForm[] {
  const nomeTrim = nome.trim()
  if (!nomeTrim) return etapas
  return etapas.map((etapa, i) =>
    i === etapaIndex ? { ...etapa, subetapas: [...etapa.subetapas, { nome: nomeTrim, tipoResposta }] } : etapa
  )
}

export function removerSubetapa(etapas: EtapaForm[], etapaIndex: number, subetapaIndex: number): EtapaForm[] {
  return etapas.map((etapa, i) =>
    i === etapaIndex ? { ...etapa, subetapas: etapa.subetapas.filter((_, si) => si !== subetapaIndex) } : etapa
  )
}

export function moverSubetapa(
  etapas: EtapaForm[],
  etapaIndex: number,
  subetapaIndex: number,
  direcao: 'up' | 'down',
): EtapaForm[] {
  const alvoIndex = direcao === 'up' ? subetapaIndex - 1 : subetapaIndex + 1
  return etapas.map((etapa, i) => {
    if (i !== etapaIndex) return etapa
    if (alvoIndex < 0 || alvoIndex >= etapa.subetapas.length) return etapa
    const subetapas = [...etapa.subetapas]
    ;[subetapas[subetapaIndex], subetapas[alvoIndex]] = [subetapas[alvoIndex], subetapas[subetapaIndex]]
    return { ...etapa, subetapas }
  })
}

export function renomearEtapa(etapas: EtapaForm[], etapaIndex: number, novoNome: string): EtapaForm[] {
  return etapas.map((etapa, i) => (i === etapaIndex ? { ...etapa, nome: novoNome } : etapa))
}

export function editarSubetapa(
  etapas: EtapaForm[],
  etapaIndex: number,
  subetapaIndex: number,
  nome: string,
  tipoResposta: SubetapaTipoResposta,
): EtapaForm[] {
  return etapas.map((etapa, i) =>
    i === etapaIndex
      ? {
          ...etapa,
          subetapas: etapa.subetapas.map((sub, si) => (si === subetapaIndex ? { ...sub, nome, tipoResposta } : sub)),
        }
      : etapa
  )
}

export function paraEtapaForm(tipo: ProcessoTipoResumo): EtapaForm[] {
  return tipo.etapas.map(etapa => ({
    nomeOriginal: etapa.nome,
    nome: etapa.nome,
    subetapas: etapa.subetapas.map(sub => ({ id: sub.id, nome: sub.nome, tipoResposta: sub.tipoResposta })),
  }))
}
