// Mapeia mes numerico (1-12) pra coluna dd/mm em `parcelamentos`, na mesma
// ordem usada em app/fiscal/parcelamentos/page.tsx (MESES_COLS). Setembro é
// "set", não "sep" — segue a nomenclatura já cadastrada no banco.
export const MES_PARA_COLUNA: Record<number, string> = {
  1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
  7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez',
}

const CAMPOS_MES = Object.values(MES_PARA_COLUNA)

// Decide quais campos vao no update de um parcelamento (spec 2026-08-19,
// item "meses editaveis pra avulso"). Vinculado a cliente: os meses sao
// preenchidos so pela tarefa na ficha do cliente, entao nunca sao
// reenviados aqui (senao o save do admin sobrescreve o que a ficha gravou
// enquanto o modal estava aberto). Avulso: nunca tem tarefa (cnpj null
// nunca resolve cliente_id em sincronizarTarefasParcelamento), entao o
// modal e a unica forma de preencher os meses e eles sao enviados normal.
export function montarUpdateParcelamento<T extends Record<string, unknown>>(
  form: T,
  empresaAvulsa: boolean,
): Partial<T> {
  if (empresaAvulsa) return { ...form }
  const resultado = { ...form }
  for (const campo of CAMPOS_MES) delete (resultado as Record<string, unknown>)[campo]
  return resultado
}
