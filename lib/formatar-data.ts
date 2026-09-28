// lib/formatar-data.ts
//
// Formata uma data ISO vinda do Postgres pra exibição DD/MM/AAAA sem passar
// por `new Date(iso)` com getters locais — isso é o que causava dois bugs
// diferentes dependendo do tipo da coluna:
//
// 1. Coluna `date` (ex.: tarefa_etapas.concluida_em, valor tipo
//    "2026-09-03"): `new Date(iso)` interpreta como meia-noite UTC, e ler de
//    volta no fuso de Brasília (UTC-3) recuava sempre um dia.
// 2. Coluna `timestamptz` (ex.: tarefas.concluida_em, valor tipo
//    "2026-09-03T12:00:00+00:00"): um split ingênuo em '-' quebra porque a
//    string inteira (com o "T...") não é uma data pura, produzindo lixo tipo
//    "03T12:00:00+00:00/09/2026".
//
// A correção: extrai só a parte "YYYY-MM-DD" antes de qualquer "T" (as
// timestamptz dessa base são sempre gravadas com hora-âncora 12:00:00 UTC
// justamente pra sobreviver a essa extração), valida com regex, e só então
// faz o split — nunca passa por Date().
export function formatarDdMm(iso: string | null | undefined): string {
  if (!iso) return ''
  const dataParte = iso.split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataParte)) return ''
  const [ano, mes, dia] = dataParte.split('-')
  return `${dia}/${mes}/${ano}`
}

export function parseDdMmParaIso(valor: string): string | undefined {
  const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  return `${m[3]}-${m[2]}-${m[1]}`
}
