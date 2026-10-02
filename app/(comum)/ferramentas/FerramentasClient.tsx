'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import { bucketDoRegime } from '@/lib/regime-bucket'
import { ChevronDown, ChevronUp, Download, ExternalLink, Eye, EyeOff, FileText, Search, Store } from 'lucide-react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Aviso } from '@/components/ui/Aviso'

interface Props {
  clientes: ClienteComFiscal[]
  isAdmin: boolean
  userNome: string
}

type Ferramenta = 'SIGA' | 'ISS' | 'MEI'

const CARD_META: Record<Ferramenta, { titulo: string; descricao: string; cor: string; Icone: typeof Search }> = {
  SIGA: { titulo: 'SIGA', descricao: 'Clientes com conferência SIGA habilitada', cor: '#8B93F8', Icone: Search },
  ISS: { titulo: 'ISS', descricao: 'Clientes com envio de ISS habilitado', cor: 'var(--acc)', Icone: FileText },
  MEI: { titulo: 'MEI', descricao: 'Clientes do grupo MEI', cor: 'var(--warn)', Icone: Store },
}
// Texto na cor da ferramenta com contraste nos dois temas (mistura com a cor do texto).
const corDeTexto = (cor: string) => `color-mix(in srgb, ${cor} 72%, var(--fg))`

function filtrarClientes(clientes: ClienteComFiscal[], tipo: Ferramenta): ClienteComFiscal[] {
  switch (tipo) {
    case 'SIGA': return clientes.filter(c => c.confere_siga)
    case 'ISS':  return clientes.filter(c => c.envia_iss)
    case 'MEI':  return clientes.filter(c => bucketDoRegime(c.regime) === 'mei')
  }
}

function exportarPlanilha(clientes: ClienteComFiscal[], tipo: Ferramenta) {

  let headers: string[]
  let rows: (string | number)[][]

  switch (tipo) {
    case 'SIGA':
      headers = ['CNPJ', 'Razão Social']
      rows = clientes.map(c => [c.cnpj ?? '', c.nome])
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
    <Pagina>
      <CabecalhoPagina
        titulo="Ferramentas"
        subtitulo={<>Acesso rápido às ferramentas do setor fiscal{!isAdmin && userNome && <span> · {userNome}</span>}</>}
        acoes={
          <a href="https://tesshub.com.br/login" target="_blank" rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-acc bg-acc px-3.5 text-sm font-semibold text-acc-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-page">
            <ExternalLink size={16} aria-hidden="true" />
            Acessar TessHub
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ferramentas.map(tipo => {
          const meta = CARD_META[tipo]
          const total = filtrarClientes(clientes, tipo).length
          const ativo = aberto === tipo
          const Icone = meta.Icone
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => toggleCard(tipo)}
              aria-expanded={ativo}
              aria-controls={ativo ? 'lista-ferramenta' : undefined}
              className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface px-5 py-[18px] text-left transition-colors hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              style={ativo ? { borderColor: meta.cor, background: `color-mix(in srgb, ${meta.cor} 8%, var(--surface))` } : undefined}
            >
              <span className="flex w-full items-center">
                <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${meta.cor} 18%, transparent)`, color: meta.cor }}>
                  <Icone size={20} />
                </span>
                <span className="ml-auto inline-flex h-[22px] items-center rounded-md px-2 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${meta.cor} 16%, transparent)`, color: corDeTexto(meta.cor) }}>
                  {`${total} ${total === 1 ? 'cliente' : 'clientes'}`}
                </span>
              </span>
              <span>
                <span className="block text-lg font-semibold text-fg">{meta.titulo}</span>
                <span className="text-[13px] text-fg-3">{meta.descricao}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: corDeTexto(meta.cor) }}>
                {ativo ? 'Fechar lista' : 'Ver lista'}
                {ativo ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </span>
            </button>
          )
        })}
      </div>

      {aberto && (
        <section id="lista-ferramenta" aria-label={`Clientes ${CARD_META[aberto].titulo}`} className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
            <h2 className="text-[15px] font-semibold text-fg">{CARD_META[aberto].titulo}</h2>
            <span className="text-[13px] text-fg-3">{listaFiltrada.length} {listaFiltrada.length === 1 ? 'resultado' : 'resultados'}</span>
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <Input type="search" aria-label="Buscar por nome ou CNPJ" iconeEsquerda={<Search size={16} />} placeholder="Buscar por nome ou CNPJ"
                value={search} onChange={e => setSearch(e.target.value)} className="sm:w-[280px]" />
              <Button icone={<Download size={16} aria-hidden="true" />} onClick={() => exportarPlanilha(listaFiltrada, aberto)} disabled={listaFiltrada.length === 0}>
                Exportar planilha
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Tabela className={aberto === 'ISS' ? 'min-w-[900px]' : 'min-w-[560px]'}>
              <thead>
                <tr>
                  <Th largura={60}>#</Th>
                  <Th>Razão social</Th>
                  <Th largura={200}>CNPJ</Th>
                  {aberto === 'ISS' && <><Th largura={180}>Município</Th><Th largura={160}>Login ISS</Th><Th largura={160}>Senha ISS</Th></>}
                  {isAdmin && <Th largura={180}>Responsável</Th>}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 && (
                  <tr><Td colSpan={3 + (aberto === 'ISS' ? 3 : 0) + (isAdmin ? 1 : 0)} alinhar="centro" className="py-10 text-fg-3">Nenhum cliente encontrado.</Td></tr>
                )}
                {listaFiltrada.map((c, i) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-[13px] text-fg-3">{i + 1}</Td>
                    <Td><NomeCliente nome={c.nome} /></Td>
                    <Td className="font-mono text-[13px] text-fg-2">{c.cnpj ?? '—'}</Td>
                    {aberto === 'ISS' && (
                      <>
                        <Td className="text-fg-2">{c.municipio ?? c.mit ?? '—'}{c.uf ? <span className="text-fg-3"> / {c.uf}</span> : ''}</Td>
                        <Td className="font-mono text-[13px] text-fg-2">{c.login_iss ?? '—'}</Td>
                        <Td><SenhaCell senha={c.senha_iss} /></Td>
                      </>
                    )}
                    {isAdmin && <Td className="text-fg-2">{c.responsavel ?? '—'}</Td>}
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        </section>
      )}

      <Aviso tom="info">
        <b>O TessHub abre em uma nova aba.</b> Por segurança dos navegadores, o login não é preenchido automaticamente: use as mesmas credenciais do Portal.
      </Aviso>
    </Pagina>
  )
}

// Componente para mostrar/ocultar senha ISS na tabela
function SenhaCell({ senha }: { senha: string | null }) {
  const [visivel, setVisivel] = useState(false)
  if (!senha) return <span className="text-fg-3">—</span>
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[13px] text-fg-2">{visivel ? senha : '••••••••'}</span>
      <IconButton rotulo={visivel ? 'Ocultar senha' : 'Mostrar senha'} icone={visivel ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        onClick={() => setVisivel(v => !v)} className="h-7 w-7" />
    </div>
  )
}
