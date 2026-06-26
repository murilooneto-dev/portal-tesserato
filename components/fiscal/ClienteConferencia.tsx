'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

const UF_MAP: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
  '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS',
  '50':'MS','51':'MT','52':'GO','53':'DF',
}

interface Arquivo { id: string; name: string; content_base64: string }
interface Props { clienteNome: string; arquivosDTE: Arquivo[] }

interface EntradaDTE {
  chave: string
  uf: string
  numero: string
  data: string
  fornecedor: string
  valor: string
}

function normalizar(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function encontrarCol(keys: string[], ...termos: string[]): string | undefined {
  return keys.find(k => termos.some(t => k.toLowerCase().replace(/[\s._-]/g, '').includes(t)))
}

function formatarValor(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || s === '0') return ''
  const n = parseFloat(s.replace(',', '.'))
  if (isNaN(n)) return s
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(v: unknown): string {
  if (!v) return ''
  // Excel date serial number
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return d.toLocaleDateString('pt-BR')
  }
  const s = String(v).trim()
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }
  return s
}

function extrairEntradasDeWorkbook(wb: XLSX.WorkBook): EntradaDTE[] {
  const entradas: Map<string, EntradaDTE> = new Map()
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' })
    for (const row of rows) {
      const keys = Object.keys(row)
      const colChave = encontrarCol(keys, 'chavenfe', 'chaveacesso', 'chavenf', 'chave')
      if (!colChave) continue
      const chave = normalizar(row[colChave])
      if (chave.length !== 44) continue

      const colNumero    = encontrarCol(keys, 'numeronf', 'númeronf', 'numnf', 'numero', 'número', 'nf')
      const colData      = encontrarCol(keys, 'dataemissao', 'emissao', 'data', 'dtemi')
      const colFornec    = encontrarCol(keys, 'fornecedor', 'emitente', 'razaosocial', 'razão', 'nome')
      const colValor     = encontrarCol(keys, 'valortotal', 'valornf', 'valor')
      const colUF        = encontrarCol(keys, 'ufemitente', 'ufemi', 'ufe', 'uf')

      const ufRaw = colUF ? String(row[colUF]).trim() : ''
      const uf = ufRaw || UF_MAP[chave.slice(0, 2)] || chave.slice(0, 2)

      entradas.set(chave, {
        chave,
        uf,
        numero:     colNumero  ? String(row[colNumero]).trim()  : '',
        data:       colData    ? formatarData(row[colData])     : '',
        fornecedor: colFornec  ? String(row[colFornec]).trim()  : '',
        valor:      colValor   ? formatarValor(row[colValor])   : '',
      })
    }
  }
  return Array.from(entradas.values())
}

function lerDTEBase64(base64: string): EntradaDTE[] {
  const wb = XLSX.read(base64, { type: 'base64' })
  return extrairEntradasDeWorkbook(wb)
}

async function lerChavesSistema(file: File): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const chaves = new Set<string>()
        for (const name of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' })
          for (const row of rows) {
            const keys = Object.keys(row)
            const colChave = encontrarCol(keys, 'chavenfe', 'chaveacesso', 'chavenf', 'chave')
            if (colChave) {
              const v = normalizar(row[colChave])
              if (v.length === 44) chaves.add(v)
            } else {
              for (const val of Object.values(row)) {
                const v = normalizar(val)
                if (v.length === 44) chaves.add(v)
              }
            }
          }
        }
        resolve(chaves)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function ClienteConferencia({ clienteNome, arquivosDTE }: Props) {
  const [sistemFile, setSistemFile]   = useState<File | null>(null)
  const [comparando, setComparando]   = useState(false)
  const [resultado, setResultado]     = useState<{ dte: number; sistema: number; divergencias: EntradaDTE[] } | null>(null)
  const [erro, setErro]               = useState('')
  const inputRef                      = useRef<HTMLInputElement>(null)

  async function comparar() {
    if (!arquivosDTE.length || !sistemFile) return
    setComparando(true)
    setErro('')
    setResultado(null)
    try {
      const todasEntradas = arquivosDTE.flatMap(f => lerDTEBase64(f.content_base64))
      // dedup por chave mantendo último
      const mapaEntradas = new Map<string, EntradaDTE>()
      for (const e of todasEntradas) mapaEntradas.set(e.chave, e)
      const entradasDTE = Array.from(mapaEntradas.values())

      const chavesSistema = await lerChavesSistema(sistemFile)
      const divergencias  = entradasDTE.filter(e => !chavesSistema.has(e.chave))

      setResultado({ dte: entradasDTE.length, sistema: chavesSistema.size, divergencias })
    } catch {
      setErro('Erro ao ler planilhas. Certifique-se que os arquivos são .xls/.xlsx válidos.')
    }
    setComparando(false)
  }

  function exportarXLSX() {
    if (!resultado) return
    const wb = XLSX.utils.book_new()
    const agora = new Date().toLocaleDateString('pt-BR')

    // Monta rows com título e sumário
    const rows: unknown[][] = [
      [`Divergências DTE — ${clienteNome}`],
      [`Gerado em: ${agora}`, '', '', '', `Total DTE: ${resultado.dte}`, `Total SISTEMA: ${resultado.sistema}`, `Divergências: ${resultado.divergencias.length}`],
      [],
      ['#', 'UF', 'Nº NF', 'Data', 'Fornecedor', 'Valor', 'Chave de Acesso (44 dígitos)'],
      ...resultado.divergencias.map((e, i) => [i + 1, e.uf, e.numero, e.data, e.fornecedor, e.valor, e.chave]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Larguras das colunas
    ws['!cols'] = [
      { wch: 4  },  // #
      { wch: 5  },  // UF
      { wch: 10 },  // Nº NF
      { wch: 12 },  // Data
      { wch: 40 },  // Fornecedor
      { wch: 16 },  // Valor
      { wch: 46 },  // Chave
    ]

    // Merge célula do título (A1:G1)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }]

    XLSX.utils.book_append_sheet(wb, ws, 'Divergências')
    XLSX.writeFile(wb, `divergencias-${clienteNome}-${agora.replace(/\//g, '-')}.xlsx`)
  }

  function exportarPDF() {
    if (!resultado) return
    const agora = new Date().toLocaleDateString('pt-BR')
    const linhas = resultado.divergencias.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${e.uf}</strong></td>
        <td>${e.numero || '—'}</td>
        <td>${e.data || '—'}</td>
        <td>${e.fornecedor || '—'}</td>
        <td>${e.valor || '—'}</td>
        <td class="mono">${e.chave}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Divergências DTE — ${clienteNome}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 28px; }
      .header { border-bottom: 2px solid #0077aa; padding-bottom: 12px; margin-bottom: 16px; text-align: center; }
      .header h1 { font-size: 18px; color: #0077aa; }
      .header p { font-size: 11px; color: #555; margin-top: 3px; }
      .summary { display: flex; gap: 24px; margin-bottom: 16px; justify-content: center; }
      .summary-item { text-align: center; border: 1px solid #ddd; border-radius: 6px; padding: 8px 16px; }
      .summary-item .num { font-size: 20px; font-weight: 700; }
      .summary-item .lbl { font-size: 10px; color: #666; }
      .num-dte { color: #0077aa; }
      .num-sis { color: #16a34a; }
      .num-div { color: ${resultado.divergencias.length > 0 ? '#dc2626' : '#16a34a'}; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #0077aa; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; text-align: left; }
      tr:nth-child(even) td { background: #f8f8f8; }
      .mono { font-family: monospace; font-size: 9px; word-break: break-all; }
      .footer { margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
      @media print { body { padding: 12px; } }
    </style></head><body>
    <div class="header">
      <h1>Divergências DTE — ${clienteNome}</h1>
      <p>Gerado em ${agora} · Notas presentes no DTE mas ausentes no SISTEMA</p>
    </div>
    <div class="summary">
      <div class="summary-item"><div class="num num-dte">${resultado.dte}</div><div class="lbl">Chaves DTE</div></div>
      <div class="summary-item"><div class="num num-sis">${resultado.sistema}</div><div class="lbl">Chaves SISTEMA</div></div>
      <div class="summary-item"><div class="num num-div">${resultado.divergencias.length}</div><div class="lbl">Divergências</div></div>
    </div>
    ${resultado.divergencias.length === 0
      ? '<p style="color:#16a34a;font-weight:600;padding:16px;border:1px solid #bbf7d0;border-radius:6px;background:#f0fdf4">✓ Nenhuma divergência encontrada — todas as chaves DTE estão presentes no SISTEMA.</p>'
      : `<table><thead><tr><th>#</th><th>UF</th><th>Nº NF</th><th>Data</th><th>Fornecedor</th><th>Valor</th><th>Chave de Acesso</th></tr></thead><tbody>${linhas}</tbody></table>`
    }
    <div class="footer">Tesserato Contabilidade · Portal do Colaborador · ${agora}</div>
    </body></html>`

    const w = window.open('', '_blank', 'width=1000,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 400)
  }

  if (!arquivosDTE.length) return null

  return (
    <div className="mt-6 pt-5 border-t border-white/8">
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
        Conferência de DTEs
      </h3>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm ${
          sistemFile
            ? 'bg-[#00B8D4]/10 border-[#00B8D4]/40 text-[#00B8D4]'
            : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
        }`}>
          <span>📂</span>
          <span className="max-w-[200px] truncate">{sistemFile ? sistemFile.name : 'Planilha do sistema (.xls/.xlsx)'}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={e => { setSistemFile(e.target.files?.[0] ?? null); setResultado(null) }}
          />
        </label>

        <button
          onClick={comparar}
          disabled={comparando || !sistemFile}
          className="px-4 py-2 rounded-xl bg-[#00B8D4] text-white text-sm font-medium hover:bg-[#00a3bc] transition-all disabled:opacity-40"
        >
          {comparando ? '⏳ Comparando...' : '🔍 Comparar'}
        </button>

        {resultado && (
          <>
            <button
              onClick={exportarXLSX}
              className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:border-green-400/50 hover:text-green-400 transition-all"
            >
              ⬇ Exportar XLSX
            </button>
            <button
              onClick={exportarPDF}
              className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:border-red-400/50 hover:text-red-400 transition-all"
            >
              ⬇ Exportar PDF
            </button>
          </>
        )}

        <span className="text-white/25 text-xs">{arquivosDTE.length} planilha(s) DTE armazenada(s)</span>
      </div>

      {erro && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{erro}</div>
      )}

      {resultado && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Chaves DTE',    val: resultado.dte,                  cor: '#00B8D4' },
              { label: 'Chaves SISTEMA', val: resultado.sistema,              cor: '#10b981' },
              { label: 'Divergências',   val: resultado.divergencias.length,  cor: resultado.divergencias.length > 0 ? '#ef4444' : '#10b981' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-white/3 border border-white/8 text-center">
                <p className="text-xl font-bold" style={{ color: s.cor }}>{s.val}</p>
                <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {resultado.divergencias.length === 0 ? (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <p className="text-green-400 font-semibold text-sm">✓ Nenhuma divergência encontrada</p>
              <p className="text-green-400/50 text-xs mt-1">Todas as chaves DTE estão presentes no SISTEMA</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/8 bg-white/3">
                <p className="text-xs font-semibold text-white">Chaves DTE não encontradas no SISTEMA</p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8 sticky top-0 bg-[#0d1320]">
                      <th className="text-left text-white/30 uppercase px-3 py-2">#</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">UF</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">Nº NF</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">Data</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">Fornecedor</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">Valor</th>
                      <th className="text-left text-white/30 uppercase px-3 py-2">Chave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.divergencias.slice(0, 300).map((e, i) => (
                      <tr key={e.chave} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-3 py-1.5 text-white/30">{i + 1}</td>
                        <td className="px-3 py-1.5 text-[#00B8D4] font-bold">{e.uf}</td>
                        <td className="px-3 py-1.5 text-white/70">{e.numero || '—'}</td>
                        <td className="px-3 py-1.5 text-white/60">{e.data || '—'}</td>
                        <td className="px-3 py-1.5 text-white/70 max-w-[180px] truncate">{e.fornecedor || '—'}</td>
                        <td className="px-3 py-1.5 text-white/70 whitespace-nowrap">{e.valor || '—'}</td>
                        <td className="px-3 py-1.5 text-white/30 font-mono">{e.chave}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
