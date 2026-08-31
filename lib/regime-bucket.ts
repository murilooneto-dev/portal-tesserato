// Deriva o bucket histórico de Grupo (normal/simples/mei/isento) a partir
// do texto livre de Regime. Grupo era um campo fechado só pra alimentar um
// punhado de lugares (dashboard, relatórios, ferramenta MEI, campo MIT na
// ficha, vínculo de tarefas por grupo, filtro da lista de clientes) — Regime
// já carrega a mesma informação (e mais granular: Lucro Real vs Presumido,
// por exemplo), então esses lugares passaram a derivar o bucket dele em vez
// de ler Grupo diretamente. "Contém a palavra" porque Regime é texto livre
// editável pelo admin, sem vocabulário fechado — mesmo truque que
// components/fiscal/ClientesLista.tsx:corRegime já usava só pra cor.
export type GrupoBucket = 'normal' | 'simples' | 'mei' | 'isento'

export function bucketDoRegime(regime: string | null | undefined): GrupoBucket {
  const r = (regime ?? '').toLowerCase()
  if (r.includes('simples')) return 'simples'
  if (r.includes('mei')) return 'mei'
  if (r.includes('isent')) return 'isento'
  return 'normal'
}
