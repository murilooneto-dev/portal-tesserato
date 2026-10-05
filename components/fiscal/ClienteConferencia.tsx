'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { CheckCircle2, Download, Loader2, Printer, ScanSearch, Upload } from 'lucide-react'
import { escapeHtml } from '@/lib/escape-html'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

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
        <td><strong>${escapeHtml(e.uf)}</strong></td>
        <td>${escapeHtml(e.numero) || '—'}</td>
        <td>${escapeHtml(e.data) || '—'}</td>
        <td>${escapeHtml(e.fornecedor) || '—'}</td>
        <td>${escapeHtml(e.valor) || '—'}</td>
        <td class="mono">${escapeHtml(e.chave)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Divergências DTE — ${escapeHtml(clienteNome)}</title>
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
      <h1>Divergências DTE — ${escapeHtml(clienteNome)}</h1>
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

  const numeros = resultado ? [
    { rotulo: 'Chaves no DTE', valor: resultado.dte, cor: 'text-fg' },
    { rotulo: 'Chaves no sistema', valor: resultado.sistema, cor: 'text-fg' },
    { rotulo: 'Divergências', valor: resultado.divergencias.length, cor: resultado.divergencias.length > 0 ? 'text-warn' : 'text-ok' },
  ] : []

  return (
    <Card
      titulo="Conferência de DTEs"
      meta={<span className="text-[13px] text-fg-3">{arquivosDTE.length} planilha(s) DTE anexada(s)</span>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative inline-flex h-9 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3.5 text-sm font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc max-sm:h-11">
            <Upload size={16} aria-hidden="true" className="flex-none" />
            <span className="max-w-[220px] truncate">{sistemFile ? sistemFile.name : 'Planilha do sistema (.xls/.xlsx)'}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx"
              className="sr-only"
              onChange={e => { setSistemFile(e.target.files?.[0] ?? null); setResultado(null) }}
            />
          </label>

          <Button
            variante="secundario"
            onClick={comparar}
            disabled={comparando || !sistemFile}
            icone={comparando ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <ScanSearch size={16} aria-hidden="true" />}
          >
            {comparando ? 'Comparando...' : 'Comparar'}
          </Button>

          {resultado && (
            <>
              <Button icone={<Download size={16} aria-hidden="true" />} onClick={exportarXLSX}>Exportar Excel</Button>
              <Button icone={<Printer size={16} aria-hidden="true" />} onClick={exportarPDF}>Exportar PDF</Button>
            </>
          )}
        </div>

        {erro && <Aviso tom="dng"><span role="alert">{erro}</span></Aviso>}

        {resultado && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {numeros.map(n => (
                <div key={n.rotulo} className="rounded-[10px] border border-line-soft bg-raised p-3 text-center">
                  <p className={`text-xl font-bold tabular-nums ${n.cor}`}>{n.valor}</p>
                  <p className="mt-0.5 text-xs text-fg-3">{n.rotulo}</p>
                </div>
              ))}
            </div>

            {resultado.divergencias.length === 0 ? (
              <Aviso tom="ok" icone={<CheckCircle2 size={18} />}>
                <b>Nenhuma divergência encontrada.</b> Todas as chaves do DTE estão presentes no sistema.
              </Aviso>
            ) : (
              <Card
                titulo="Chaves do DTE que não estão no sistema"
                semPadding
              >
                <div className="relative max-h-80 overflow-auto">
                  <Tabela className="min-w-[900px]">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        <Th largura={50}>#</Th>
                        <Th largura={60}>UF</Th>
                        <Th largura={110}>Nº NF</Th>
                        <Th largura={120}>Data</Th>
                        <Th>Fornecedor</Th>
                        <Th largura={130} alinhar="dir">Valor</Th>
                        <Th largura={380}>Chave</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.divergencias.slice(0, 300).map((e, i) => (
                        <tr key={e.chave}>
                          <Td className="tabular-nums text-fg-3">{i + 1}</Td>
                          <Td className="font-semibold text-acc-text">{e.uf}</Td>
                          <Td className="tabular-nums">{e.numero || '—'}</Td>
                          <Td className="tabular-nums text-fg-2">{e.data || '—'}</Td>
                          <Td className="truncate" title={e.fornecedor}>{e.fornecedor || '—'}</Td>
                          <Td alinhar="dir" className="whitespace-nowrap tabular-nums">{e.valor || '—'}</Td>
                          <Td className="truncate font-mono text-xs text-fg-3" title={e.chave}>{e.chave}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                </div>
                {resultado.divergencias.length > 300 && (
                  <p className="border-t border-line-soft px-[18px] py-3 text-[13px] text-fg-3">
                    Mostrando as 300 primeiras de {resultado.divergencias.length}. A exportação traz todas.
                  </p>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
