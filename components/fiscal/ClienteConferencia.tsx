'use client'

import { useState, useRef } from 'react'

const UF: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
  '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS',
  '50':'MS','51':'MT','52':'GO','53':'DF',
}

interface Arquivo {
  id: string
  name: string
  content_base64: string
}

interface Props {
  clienteNome: string
  arquivosDTE: Arquivo[]
}

function extrairChaves(text: string): string[] {
  return Array.from(new Set(text.match(/\d{44}/g) ?? []))
}

async function lerXLSXBase64(base64: string): Promise<string[]> {
  const XLSX = (await import('xlsx')).default
  const wb = XLSX.read(base64, { type: 'base64' })
  const chaves: string[] = []
  for (const name of wb.SheetNames) {
    chaves.push(...extrairChaves(XLSX.utils.sheet_to_csv(wb.Sheets[name])))
  }
  return chaves
}

async function lerXLSXFile(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = (await import('xlsx')).default
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const chaves: string[] = []
        for (const name of wb.SheetNames) {
          chaves.push(...extrairChaves(XLSX.utils.sheet_to_csv(wb.Sheets[name])))
        }
        resolve(Array.from(new Set(chaves)))
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function ClienteConferencia({ clienteNome, arquivosDTE }: Props) {
  const [sistemFile, setSistemFile] = useState<File | null>(null)
  const [comparando, setComparando] = useState(false)
  const [resultado, setResultado] = useState<{ dte: number; sistema: number; divergencias: string[] } | null>(null)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function comparar() {
    if (!arquivosDTE.length || !sistemFile) return
    setComparando(true)
    setErro('')
    setResultado(null)
    try {
      const todas = (await Promise.all(arquivosDTE.map(f => lerXLSXBase64(f.content_base64)))).flat()
      const chavesDTE = Array.from(new Set(todas))
      const chavesSistema = new Set(await lerXLSXFile(sistemFile))
      const divergencias = chavesDTE.filter(k => !chavesSistema.has(k))
      setResultado({ dte: chavesDTE.length, sistema: chavesSistema.size, divergencias })
    } catch {
      setErro('Erro ao ler planilhas. Certifique-se que os arquivos são .xls/.xlsx válidos.')
    }
    setComparando(false)
  }

  function exportarCSV() {
    if (!resultado) return
    const rows = ['Chave,UF'].concat(resultado.divergencias.map(k => `${k},${UF[k.slice(0, 2)] ?? k.slice(0, 2)}`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `divergencias-${clienteNome}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!arquivosDTE.length) return null

  return (
    <div className="mt-6 pt-5 border-t border-white/8">
      <h3 className="text-xs font-bold text-[#00B8D4] uppercase tracking-widest mb-4">
        Conferência de DTEs
      </h3>

      {/* Upload planilha do sistema + botão comparar */}
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
          <button
            onClick={exportarCSV}
            className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:border-white/30 hover:text-white transition-all"
          >
            ⬇ Exportar CSV
          </button>
        )}

        <span className="text-white/25 text-xs">{arquivosDTE.length} planilha(s) DTE armazenada(s)</span>
      </div>

      {erro && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{erro}</div>
      )}

      {resultado && (
        <div>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Chaves DTE', val: resultado.dte, cor: '#00B8D4' },
              { label: 'Chaves SISTEMA', val: resultado.sistema, cor: '#10b981' },
              { label: 'Divergências', val: resultado.divergencias.length, cor: resultado.divergencias.length > 0 ? '#ef4444' : '#10b981' },
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
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8 sticky top-0 bg-[#0d1320]">
                      <th className="text-left text-white/30 uppercase px-4 py-2">#</th>
                      <th className="text-left text-white/30 uppercase px-4 py-2">UF</th>
                      <th className="text-left text-white/30 uppercase px-4 py-2">Chave (44 dígitos)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.divergencias.slice(0, 300).map((k, i) => (
                      <tr key={k} className="border-b border-white/5">
                        <td className="px-4 py-1.5 text-white/30">{i + 1}</td>
                        <td className="px-4 py-1.5 text-[#00B8D4] font-bold">{UF[k.slice(0, 2)] ?? k.slice(0, 2)}</td>
                        <td className="px-4 py-1.5 text-white/50 font-mono break-all">{k}</td>
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
