'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Cliente } from '@/lib/types'

interface Props {
  clientes: Cliente[]
  isAdmin: boolean
  userNome: string
}

type Ferramenta = 'SIGA' | 'ISS' | 'MEI'

const CARD_META: Record<Ferramenta, { titulo: string; descricao: string; cor: string; icon: string }> = {
  SIGA: {
    titulo: 'SIGA',
    descricao: 'Clientes com conferência SIGA habilitada',
    cor: '#6366f1',
    icon: '🔎',
  },
  ISS: {
    titulo: 'ISS',
    descricao: 'Clientes com envio de ISS habilitado',
    cor: '#00B8D4',
    icon: '📋',
  },
  MEI: {
    titulo: 'MEI',
    descricao: 'Clientes do grupo MEI',
    cor: '#f59e0b',
    icon: '🏪',
  },
}

function filtrarClientes(clientes: Cliente[], tipo: Ferramenta): Cliente[] {
  switch (tipo) {
    case 'SIGA': return clientes.filter(c => c.confere_siga)
    case 'ISS':  return clientes.filter(c => c.envia_iss)
    case 'MEI':  return clientes.filter(c => c.grupo?.toLowerCase() === 'mei')
  }
}

function exportarPlanilha(clientes: Cliente[], tipo: Ferramenta) {

  let headers: string[]
  let rows: (string | number)[][]

  switch (tipo) {
    case 'SIGA':
      headers = ['CNPJ', 'Razão Social']
      rows = clientes.map((c, i) => [c.cnpj ?? '', c.nome])
      break
    case 'ISS':
      headers = ['CNPJ', 'Razão Social', 'Município', 'UF', 'Login ISS', 'Senha ISS']
      rows = clientes.map(c => [
        c.cnpj ?? '',
        c.nome,
        c.municipio ?? c.mit ?? '',
        c.uf ?? '',
        c.login_iss ?? '',
        c.senha_iss ?? '',
      ])
      break
    case 'MEI':
      headers = ['CNPJ', 'Razão Social']
      rows = clientes.map(c => [c.cnpj ?? '', c.nome])
      break
  }

  const wb = XLSX.utils.book_new()
  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Largura das colunas
  const colWidths: Record<Ferramenta, number[]> = {
    SIGA: [20, 45],
    ISS:  [20, 45, 30, 8, 25, 25],
    MEI:  [20, 45],
  }
  ws['!cols'] = colWidths[tipo].map(w => ({ wch: w }))

  // Estilo do cabeçalho (negrito + fundo azul escuro)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 10 },
        fill: { fgColor: { rgb: '0D1320' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'thin', color: { rgb: '00B8D4' } },
        },
      }
    }
  }

  // Estilo das linhas de dados
  for (let r = 1; r <= rows.length; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) {
        cell.s = {
          font: { name: 'Arial', sz: 10 },
          fill: r % 2 === 0
            ? { fgColor: { rgb: 'F0F4F8' }, patternType: 'solid' }
            : { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' },
          alignment: { vertical: 'center' },
        }
      }
    }
  }

  const nomeAba = `${tipo} — ${new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`
  XLSX.utils.book_append_sheet(wb, ws, nomeAba)

  const data = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${tipo}_${data}.xlsx`, { bookType: 'xlsx', cellStyles: true })
}

export default function FerramentasClient({ clientes, isAdmin, userNome }: Props) {
  const [aberto, setAberto] = useState<Ferramenta | null>(null)
  const [search, setSearch] = useState('')

  const ferramentas: Ferramenta[] = ['SIGA', 'ISS', 'MEI']

  function toggleCard(tipo: Ferramenta) {
    setAberto(prev => prev === tipo ? null : tipo)
    setSearch('')
  }

  const listaFiltrada = aberto
    ? filtrarClientes(clientes, aberto).filter(c =>
        !search || c.nome.toLowerCase().includes(search.toLowerCase()) ||
        (c.cnpj ?? '').includes(search)
      )
    : []

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ferramentas</h1>
          <p className="text-white/40 mt-1 text-sm">
            Acesso rápido às ferramentas do setor fiscal
            {!isAdmin && userNome && <span className="text-white/25"> · {userNome}</span>}
          </p>
        </div>

        {/* Botão TessHub */}
        <a
          href="https://tesshub.com.br/login"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Acessar TessHub
        </a>
      </div>

      {/* 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {ferramentas.map(tipo => {
          const meta   = CARD_META[tipo]
          const total  = filtrarClientes(clientes, tipo).length
          const ativo  = aberto === tipo

          return (
            <button
              key={tipo}
              onClick={() => toggleCard(tipo)}
              className="text-left rounded-2xl border p-6 transition-all cursor-pointer"
              style={{
                borderColor: ativo ? meta.cor : 'rgba(255,255,255,0.08)',
                backgroundColor: ativo ? `${meta.cor}15` : 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{meta.icon}</span>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: `${meta.cor}20`, color: meta.cor }}
                >
                  {total} cliente{total !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-white font-bold text-xl mb-1">{meta.titulo}</p>
              <p className="text-white/40 text-xs leading-relaxed">{meta.descricao}</p>
              <div className="mt-4 flex items-center gap-1.5" style={{ color: meta.cor }}>
                <span className="text-xs font-semibold">{ativo ? 'Fechar lista' : 'Ver lista'}</span>
                <span className="text-xs">{ativo ? '▲' : '▼'}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Painel expandido */}
      {aberto && (
        <div className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
          {/* Header do painel */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
            <div className="flex items-center gap-3">
              <span className="text-xl">{CARD_META[aberto].icon}</span>
              <div>
                <p className="text-white font-semibold">{CARD_META[aberto].titulo}</p>
                <p className="text-white/35 text-xs">{listaFiltrada.length} resultado{listaFiltrada.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Buscar por nome ou CNPJ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#00B8D4]/50 w-56"
              />
              <button
                onClick={() => exportarPlanilha(listaFiltrada, aberto)}
                disabled={listaFiltrada.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar planilha
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-6 py-3">#</th>
                  <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">Razão Social</th>
                  <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">CNPJ</th>
                  {aberto === 'ISS' && (
                    <>
                      <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">Município</th>
                      <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">Login ISS</th>
                      <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">Senha ISS</th>
                    </>
                  )}
                  {isAdmin && (
                    <th className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3">Responsável</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center text-white/20 text-sm">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
                {listaFiltrada.map((c, i) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                    <td className="px-6 py-3 text-white/25 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 text-white font-medium">{c.nome}</td>
                    <td className="px-4 py-3 text-white/45 font-mono text-xs">{c.cnpj ?? '—'}</td>
                    {aberto === 'ISS' && (
                      <>
                        <td className="px-4 py-3 text-white/60 text-xs">
                          {c.municipio ?? c.mit ?? '—'}
                          {c.uf ? <span className="text-white/30"> / {c.uf}</span> : ''}
                        </td>
                        <td className="px-4 py-3 text-white/60 text-xs font-mono">{c.login_iss ?? '—'}</td>
                        <td className="px-4 py-3">
                          <SenhaCell senha={c.senha_iss} />
                        </td>
                      </>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-white/40 text-xs">{c.responsavel ?? '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nota sobre TessHub */}
      <div className="mt-8 p-4 rounded-xl bg-white/2 border border-white/6">
        <p className="text-white/30 text-xs leading-relaxed">
          <span className="text-white/50 font-semibold">TessHub:</span> o botão acima abre o site em uma nova aba. Por razões de segurança dos navegadores, não é possível preencher automaticamente o login e senha de outro site. Você precisará inserir suas credenciais manualmente no TessHub — as mesmas usadas no Portal Fiscal.
        </p>
      </div>
    </div>
  )
}

// Componente para mostrar/ocultar senha ISS na tabela
function SenhaCell({ senha }: { senha: string | null }) {
  const [visivel, setVisivel] = useState(false)
  if (!senha) return <span className="text-white/25 text-xs">—</span>
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/60 text-xs font-mono">
        {visivel ? senha : '••••••••'}
      </span>
      <button
        onClick={() => setVisivel(v => !v)}
        className="text-white/25 hover:text-white/60 transition-colors"
        title={visivel ? 'Ocultar' : 'Mostrar'}
      >
        {visivel ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  )
}
