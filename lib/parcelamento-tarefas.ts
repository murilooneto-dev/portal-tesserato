// Mapeia mes numerico (1-12) pra coluna dd/mm em `parcelamentos`, na mesma
// ordem usada em app/fiscal/parcelamentos/page.tsx (MESES_COLS). Setembro é
// "set", não "sep" — segue a nomenclatura já cadastrada no banco.
export const MES_PARA_COLUNA: Record<number, string> = {
  1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
  7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez',
}

// "yyyy-mm-dd" -> "dd/mm" (formato usado nas colunas de mes de parcelamentos,
// que nunca guardam ano — decisão do usuário 2026-08-05).
export function isoParaDdMm(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

// "dd/mm" + ano -> ISO 8601 completo, mesmo formato usado em `concluida_em`
// pelas demais tarefas (ver toggleTarefa/toggleTarefaPessoal). Retorna null
// pra texto que não é uma data dd/mm válida.
export function ddMmParaIso(ddMm: string, ano: number): string | null {
  const partes = ddMm.split('/')
  if (partes.length !== 2) return null
  const [dia, mes] = partes
  if (!/^\d{1,2}$/.test(dia) || !/^\d{1,2}$/.test(mes)) return null
  const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return dateObj.toISOString()
}

// Nome da tarefa sintética gerada a partir de um parcelamento (spec item 3).
// `desambiguar` é decidido por quem chama (sincronizarTarefasParcelamento),
// que sabe se o cliente tem 2+ parcelamentos na mesma seção.
export function nomeTarefaParcelamento(
  secao: string,
  localTipo: string | null,
  desambiguar: boolean,
): string {
  if (desambiguar && localTipo && localTipo.trim() !== '') {
    return `Parcelamentos (${secao} / ${localTipo.trim()})`
  }
  return `Parcelamentos (${secao})`
}
