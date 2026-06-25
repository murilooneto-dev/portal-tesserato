'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/lib/types'

interface ClientFile { id: string; cliente_id: string; name: string; size: number; content_base64: string; uploaded_at: string }

const UF: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
  '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS',
  '50':'MS','51':'MT','52':'GO','53':'DF',
}

function extrairChaves(text: string): string[] {
  return Array.from(new Set((text.match(/\d{44}/g) ?? [])))
}

async function lerXLSXBase64(base64: string): Promise<string[]> {
  const XLSX = (await import('xlsx')).default
  const wb = XLSX.read(base64, { type: 'base64' })
  const chaves: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    chaves.push(...extrairChaves(csv))
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
          const sheet = wb.Sheets[name]
          const csv = XLSX.utils.sheet_to_csv(sheet)
          chaves.push(...extrairChaves(csv))
        }
        resolve(Array.from(new Set(chaves)))
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function ConferenciaPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null)
  const [arquivosDTE, setArquivosDTE] = useState<ClientFile[]>([])
  const [sistemFile, setSistemFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [comparando, setComparando] = useState(false)
  const [resultado, setResultado] = useState<{ dte: number; sistema: number; divergencias: string[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const sb = createClient()

  useEffect(() => {
    sb.from('clientes').select('id,nome,cnpj').order('nome').then(({ data }) => setClientes((data ?? []) as unknown as Cliente[]))
  }, [])

  const sugestoes = busca.length >= 2
    ? clientes.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.cnpj ?? '').includes(busca)).slice(0, 8)
    : []

  async function selecionarCliente(c: Cliente) {
    setClienteSel(c)
    setBusca(c.nome)
    setResultado(null)
    const { data } = await sb.from('client_files').select('id,cliente_id,name,size,uploaded_at,content_base64').eq('cliente_id', c.id).order('uploaded_at', { ascending: false })
    setArquivosDTE((data ?? []) as ClientFile[])
  }

  async function uploadDTE(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !clienteSel) return
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = (ev.target!.result as string).split(',')[1]
        await sb.from('client_files').insert({ cliente_id: clienteSel.id, name: file.name, size: file.size, content_base64: base64 })
        await selecionarCliente(clienteSel)
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch { setUploading(false) }
    e.target.value = ''
  }

  async function excluirArquivo(id: string) {
    if (!confirm('Excluir este arquivo?') || !clienteSel) return
    await sb.from('client_files').delete().eq('id', id)
    await selecionarCliente(clienteSel)
  }

  async function comparar() {
    if (!arquivosDTE.length || !sistemFile) return
    setComparando(true)
    setErro(null)
    try {
      const chavesPromises = arquivosDTE.map(f => lerXLSXBase64(f.content_base64))
      const todasDTE = (await Promise.all(chavesPromises)).flat()
      const chavesDTE = Array.from(new Set(todasDTE))
      const chavesSistema = new Set(await lerXLSXFile(sistemFile))
      const divergencias = chavesDTE.filter(k => !chavesSistema.has(k))
      setResultado({ dte: chavesDTE.length, sistema: chavesSistema.size, divergencias })
    } catch (e) {
      setErro('Erro ao ler planilhas. Certifique-se que os arquivos são .xls/.xlsx válidos.')
    }
    setComparando(false)
  }

  function exportarCSV() {
    if (!resultado) return
    const rows = ['Chave,UF'].concat(resultado.divergencias.map(k => `${k},${UF[k.slice(0,2)] ?? k.slice(0,2)}`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `divergencias-${clienteSel?.nome ?? 'cliente'}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Conferência</h1>
        <p className="text-white/40 text-sm mt-1">Compara chaves dos DTEs armazenados contra a planilha SISTEMA</p>
      </div>

      {/* Client selector */}
      <div className="mb-8 relative">
        <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Empresa</label>
        <input value={busca} onChange={e => { setBusca(e.target.value); if (!e.target.value) setClienteSel(null) }}
          placeholder="Buscar empresa..."
          className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
        {sugestoes.length > 0 && (
          <div className="absolute top-full mt-1 w-full max-w-sm bg-[#161b22] border border-white/10 rounded-xl overflow-hidden z-10 shadow-lg">
            {sugestoes.map(c => (
              <button key={c.id} onClick={() => selecionarCliente(c)} className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors">
                {c.nome} {c.cnpj && <span className="text-white/30">— {c.cnpj}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {clienteSel && (
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* DTE files */}
          <div className="p-5 rounded-xl bg-white/3 border border-white/8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest">Planilhas DTE</h3>
              <button onClick={() => uploadRef.current?.click()} disabled={uploading}
                className="text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1 rounded-lg hover:bg-[#00B8D4]/30 transition-all disabled:opacity-50">
                {uploading ? 'Enviando...' : '+ Upload'}
              </button>
              <input ref={uploadRef} type="file" accept=".xls,.xlsx" onChange={uploadDTE} className="hidden" />
            </div>
            {arquivosDTE.length === 0 ? (
              <p className="text-white/20 text-sm">Nenhum arquivo armazenado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {arquivosDTE.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white/3 border border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{f.name}</p>
                      <p className="text-white/30 text-xs">{(f.size / 1024).toFixed(1)} KB · {new Date(f.uploaded_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <button onClick={() => excluirArquivo(f.id)} className="text-white/30 hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SISTEMA file */}
          <div className="p-5 rounded-xl bg-white/3 border border-white/8">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">Planilha SISTEMA</h3>
            <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-[#00B8D4]/30 transition-all">
              <span className="text-2xl">📂</span>
              <span className="text-sm text-white/50">{sistemFile ? sistemFile.name : 'Clique para selecionar .xls/.xlsx'}</span>
              <input type="file" accept=".xls,.xlsx" onChange={e => setSistemFile(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
            {sistemFile && (
              <p className="text-xs text-white/30 mt-2 text-center">{(sistemFile.size / 1024).toFixed(1)} KB</p>
            )}
          </div>
        </div>
      )}

      {clienteSel && (
        <div className="flex gap-3 mb-8">
          <button onClick={comparar} disabled={comparando || !arquivosDTE.length || !sistemFile}
            className="bg-[#00B8D4] text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-[#00a3bc] transition-all disabled:opacity-40">
            {comparando ? '⏳ Comparando...' : '🔍 Comparar'}
          </button>
          {resultado && (
            <button onClick={exportarCSV} className="text-sm text-white/60 border border-white/10 px-4 py-2.5 rounded-xl hover:border-white/20 hover:text-white transition-all">
              ⬇ Exportar CSV
            </button>
          )}
        </div>
      )}

      {erro && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{erro}</div>}

      {resultado && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Chaves DTE', val: resultado.dte, cor: '#00B8D4' },
              { label: 'Chaves SISTEMA', val: resultado.sistema, cor: '#10b981' },
              { label: 'Divergências', val: resultado.divergencias.length, cor: resultado.divergencias.length > 0 ? '#ef4444' : '#10b981' },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-xl bg-white/3 border border-white/8 text-center">
                <p className="text-2xl font-bold" style={{ color: s.cor }}>{s.val}</p>
                <p className="text-white/40 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {resultado.divergencias.length > 0 && (
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/8 bg-white/3">
                <p className="text-sm font-medium text-white">Chaves DTE não encontradas no SISTEMA</p>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-white/8 sticky top-0 bg-[#0d1117]">
                    <th className="text-left text-xs text-white/40 uppercase px-4 py-2">#</th>
                    <th className="text-left text-xs text-white/40 uppercase px-4 py-2">UF</th>
                    <th className="text-left text-xs text-white/40 uppercase px-4 py-2">Chave (44 dígitos)</th>
                  </tr></thead>
                  <tbody>
                    {resultado.divergencias.slice(0, 300).map((k, i) => (
                      <tr key={k} className="border-b border-white/5">
                        <td className="px-4 py-2 text-white/30 text-xs">{i+1}</td>
                        <td className="px-4 py-2 text-[#00B8D4] text-xs font-bold">{UF[k.slice(0,2)] ?? k.slice(0,2)}</td>
                        <td className="px-4 py-2 text-white/60 text-xs font-mono break-all">{k}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {resultado.divergencias.length === 0 && (
            <div className="p-6 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <p className="text-green-400 font-semibold">✓ Nenhuma divergência encontrada</p>
              <p className="text-green-400/60 text-sm mt-1">Todas as chaves DTE estão presentes no SISTEMA</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
