'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, ChevronRight, ClipboardList, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { escapeHtml } from '@/lib/escape-html'
import type { Tarefa } from '@/lib/types'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal, type ClienteComFiscal } from '@/lib/clientes-fiscal'
import { useMesAno } from '@/lib/mes-atual-context'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { bucketDoRegime } from '@/lib/regime-bucket'
import { buscarDonoNomePorTipoFiscal } from '@/lib/tarefa-tipo-donos-actions'
import { filtrarTiposDoProgresso } from '@/lib/tarefa-tipo-visibilidade'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTom } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select, Switch } from '@/components/ui/Input'
import { MonthPill } from '@/components/ui/MonthPill'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

const TAREFAS: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}
const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TOM_REGIME: Record<string, BadgeTom> = { normal: 'info', simples: 'ok', mei: 'warn', isento: 'neu' }

function tiposDoCliente(cliente: ClienteComFiscal, mapa: MapaVinculosSetor, donos: Record<string, string>) {
  // Tipo encaminhado a outro usuário (Minhas Tarefas) não entra na % do cliente.
  return filtrarTiposDoProgresso(calcularTarefasEsperadas(cliente, mapa), cliente.responsavel, donos)
}

function progresso(cliente: ClienteComFiscal, tarefas: Tarefa[], mapa: MapaVinculosSetor, donos: Record<string, string>) {
  const tipos = new Set(tiposDoCliente(cliente, mapa, donos))
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}

export default function RelatoriosPage() {
  const router = useRouter()
  const { mes, ano } = useMesAno()
  const [clientes, setClientes] = useState<ClienteComFiscal[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [obsPorCliente, setObsPorCliente] = useState<Record<string, string>>({})
  const [mapaVinculos, setMapaVinculos] = useState<MapaVinculosSetor>({ porRegime: {}, porAtividade: {} })
  const [donoNomePorTipo, setDonoNomePorTipo] = useState<Record<string, string>>({})
  const [atividadesCatalogo, setAtividadesCatalogo] = useState<string[]>([])
  const [filtroResp, setFiltroResp] = useFiltroPersistente('relatorios:responsavel', 'TODOS')
  const [filtroGrupo, setFiltroGrupo] = useFiltroPersistente('relatorios:grupo', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('relatorios:atividade', [])
  const [filtroTarefa, setFiltroTarefa] = useFiltroPersistente('relatorios:tarefa', 'TODAS')
  const [apenasP, setApenasP] = useFiltroPersistente('relatorios:pendencia', false)
  const [userNome, setUserNome] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [ordenarPor, setOrdenarPor] = useState<'cliente' | 'progresso'>('progresso')
  const [ordemAsc, setOrdemAsc] = useState(true)

  function toggleSort(campo: 'cliente' | 'progresso') {
    if (ordenarPor === campo) setOrdemAsc(a => !a)
    else { setOrdenarPor(campo); setOrdemAsc(true) }
  }

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        setIsAdmin(admin)
        setUserNome(p?.nome ?? null)

        let clientesQ = sb.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome')
        if (!admin && p?.nome) clientesQ = clientesQ.ilike('clientes_fiscal.responsavel', p.nome)

        Promise.all([
          clientesQ,
          buscarTodasTarefasDoMes<Tarefa>(sb, mes, ano),
          sb.from('observacoes_clientes').select('cliente_id,texto').eq('mes', mes).eq('ano', ano),
          buscarMapaVinculosSetor(sb, 'fiscal', { mes, ano }),
          buscarDonoNomePorTipoFiscal(),
          sb.from('atividades').select('nome').eq('setor', 'fiscal').eq('ativo', true).order('nome'),
        ]).then(([c, t, o, mapa, donos, at]) => {
          setClientes((c.data ?? []).map(flattenClienteFiscal))
          setTarefas(t)
          const obsMap: Record<string, string> = {}
          for (const row of o.data ?? []) {
            if (row.texto?.trim()) obsMap[row.cliente_id] = row.texto
          }
          setObsPorCliente(obsMap)
          setMapaVinculos(mapa)
          setDonoNomePorTipo(donos)
          setAtividadesCatalogo((at.data ?? []).map(a => a.nome as string))
        })
      })
    })
  }, [mes, ano])

  const responsaveis = isAdmin
    ? ['TODOS', ...Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[]))]
    : []

  const atividades = atividadesCatalogo
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => tiposDoCliente(c, mapaVinculos, donoNomePorTipo)))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroGrupo === 'TODOS' || bucketDoRegime(c.regime) === filtroGrupo)
    .filter(c => filtroAtividade.length === 0 || ((c.atividade ?? []).length === filtroAtividade.length && filtroAtividade.every(a => (c.atividade ?? []).includes(a))))
    .filter(c => filtroTarefa === 'TODAS' || tiposDoCliente(c, mapaVinculos, donoNomePorTipo).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mapaVinculos, donoNomePorTipo) }))
    .filter(r => !apenasP || (filtroTarefa === 'TODAS' ? r.pct < 100 : r.pendentes.includes(filtroTarefa)))
    .sort((a, b) => {
      const cmp = ordenarPor === 'cliente'
        ? a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR', { sensitivity: 'base' })
        : a.pct - b.pct
      return ordemAsc ? cmp : -cmp
    })

  const stats = {
    total: filtrados.length,
    cem: filtrados.filter(r => r.pct === 100).length,
    andamento: filtrados.filter(r => r.pct > 0 && r.pct < 100).length,
    zero: filtrados.filter(r => r.pct === 0).length,
  }

  function imprimir() {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Fiscal — ${MESES_NOME[mes-1]} ${ano}</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
  .stats { display: flex; gap: 12px; margin-bottom: 16px; }
  .stat { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; flex: 1; text-align: center; }
  .stat .n { font-size: 20px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; font-size: 9px; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .bar-bg { background: #e5e7eb; border-radius: 3px; height: 6px; width: 60px; display: inline-block; vertical-align: middle; margin-right: 4px; }
  .bar-fill { background: #00CCEB; height: 6px; border-radius: 3px; display: block; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8px; font-weight: bold; }
  .normal { background: #dbeafe; color: #1d4ed8; }
  .simples { background: #dcfce7; color: #166534; }
  .mei { background: #fef3c7; color: #92400e; }
  .isento { background: #e2e8f0; color: #475569; }
  footer { margin-top: 16px; text-align: center; color: #999; font-size: 8px; }
  @media print { button { display: none; } }
</style></head><body>
<h1>Relatório de Tarefas Fiscais</h1>
<p class="sub">Competência: ${MESES_NOME[mes-1]} ${ano} &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${filtroResp !== 'TODOS' ? `Responsável: ${escapeHtml(filtroResp)}` : 'Todos os responsáveis'}</p>
<div class="stats">
  <div class="stat"><div class="n">${stats.total}</div><div>Total Clientes</div></div>
  <div class="stat" style="border-color:#10b981"><div class="n" style="color:#10b981">${stats.cem}</div><div>100% Concluídos</div></div>
  <div class="stat" style="border-color:#f59e0b"><div class="n" style="color:#f59e0b">${stats.andamento}</div><div>Em Andamento</div></div>
  <div class="stat" style="border-color:#ef4444"><div class="n" style="color:#ef4444">${stats.zero}</div><div>Não Iniciados</div></div>
</div>
<table>
  <thead><tr><th>Cliente</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Progresso</th><th>Tarefas Pendentes</th><th>Observação</th><th>MIT</th></tr></thead>
  <tbody>
    ${filtrados.map(r => `<tr>
      <td><strong>${escapeHtml(r.cliente.nome)}</strong></td>
      <td>${escapeHtml(r.cliente.cnpj) || '—'}</td>
      <td><span class="badge ${bucketDoRegime(r.cliente.regime)}">${escapeHtml(r.cliente.regime) || '—'}</span></td>
      <td>${escapeHtml(r.cliente.responsavel) || '—'}</td>
      <td><span class="bar-bg"><span class="bar-fill" style="width:${r.pct}%"></span></span>${r.pct}%</td>
      <td>${r.pct === 100 ? '✓ Concluído' : escapeHtml(r.pendentes.join(', '))}</td>
      <td>${escapeHtml(obsPorCliente[r.cliente.id])}</td>
      <td>${escapeHtml(r.cliente.mit) || '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>
<footer>Tesserato Contabilidade — Relatório gerado automaticamente</footer>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const statsCards = [
    { label: 'Total de clientes', val: stats.total, cor: 'text-fg' },
    { label: '100% concluídos', val: stats.cem, cor: 'text-ok' },
    { label: 'Em andamento', val: stats.andamento, cor: 'text-warn' },
    { label: 'Não iniciados', val: stats.zero, cor: 'text-danger' },
  ]

  function pendencias(r: (typeof filtrados)[number]) {
    if (r.pct === 100) return <Badge tom="ok" icone={<Check size={14} aria-hidden="true" />}>Concluído</Badge>
    return (
      <div className="flex flex-wrap gap-1.5">
        {r.pendentes.slice(0, 3).map(p => <Badge key={p} tom="warn" className="max-w-full"><span className="truncate" title={p}>{p}</span></Badge>)}
        {r.pendentes.length > 3 && <Badge>+{r.pendentes.length - 3}</Badge>}
      </div>
    )
  }

  function setaOrdem(campo: 'cliente' | 'progresso') {
    if (ordenarPor !== campo) return null
    return ordemAsc ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />
  }

  return (
    <Pagina className="mx-auto w-full max-w-7xl">
      <CabecalhoPagina
        titulo="Relatório"
        subtitulo={`Competência ${String(mes).padStart(2, '0')}/${ano}`}
        acoes={<Button variante="secundario" icone={<Printer size={16} aria-hidden="true" />} onClick={imprimir}>Imprimir / Salvar PDF</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <Field rotulo="Responsável" className="w-full sm:w-[190px]">
            {c => (
              <Select id={c.id} value={filtroResp} onChange={e => setFiltroResp(e.target.value)}>
                {responsaveis.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos' : r}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field rotulo="Regime" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="normal">Regime normal</option>
              <option value="simples">Simples Nacional</option>
              <option value="mei">MEI</option>
              <option value="isento">Isento</option>
            </Select>
          )}
        </Field>
        <Field rotulo="Tarefa" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)}>
              <option value="TODAS">Todas as tarefas</option>
              {tarefasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        {atividades.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-atividade-rel" className="text-[13px] font-medium text-fg-2">Atividade</span>
            <div role="group" aria-labelledby="rotulo-filtro-atividade-rel" className="flex flex-wrap gap-2">
              {atividades.map(nome => (
                <Chip key={nome} ativo={filtroAtividade.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Switch ligado={apenasP} onMudar={setApenasP} rotulo="Apenas pendências" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statsCards.map(s => (
          <div key={s.label} className="min-w-0 rounded-xl border border-line-soft bg-surface p-[18px]">
            <p className="text-sm font-medium text-fg-3">{s.label}</p>
            <p className={`mt-1 text-[32px] font-semibold leading-tight tabular-nums ${s.cor}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <Card><EmptyState icone={<ClipboardList size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude os filtros." /></Card>
      ) : (
        <>
          {/* Celular: um cartão por cliente */}
          <div className="flex flex-col gap-3 sm:hidden">
            {filtrados.map(r => (
              <Link
                key={r.cliente.id}
                href={`/fiscal/clientes/${r.cliente.id}`}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1"><NomeCliente nome={r.cliente.nome} cnpj={r.cliente.cnpj} /></div>
                  <MonthPill percentual={r.total > 0 ? r.pct : null} />
                  <ChevronRight size={18} className="mt-0.5 text-fg-3" aria-hidden="true" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
                  {r.cliente.regime && <Badge tom={TOM_REGIME[bucketDoRegime(r.cliente.regime)] ?? 'info'}>{r.cliente.regime}</Badge>}
                  <span>{r.cliente.responsavel ?? '—'}</span>
                  {r.cliente.mit && <span>MIT: {r.cliente.mit}</span>}
                </div>
                {pendencias(r)}
                {obsPorCliente[r.cliente.id] && <p className="text-[13px] text-fg-2">{obsPorCliente[r.cliente.id]}</p>}
              </Link>
            ))}
          </div>

          {/* Tela larga: tabela */}
          <Card semPadding className="hidden overflow-hidden sm:block">
            <div className="relative overflow-x-auto 2xl:overflow-visible">
              <Tabela className="min-w-[1100px]">
                <thead>
                  <tr>
                    <Th aria-sort={ordenarPor === 'cliente' ? (ordemAsc ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => toggleSort('cliente')} className="inline-flex items-center gap-1 uppercase hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                        Cliente {setaOrdem('cliente')}
                      </button>
                    </Th>
                    <Th largura={150}>Regime</Th>
                    <Th largura={140}>Responsável</Th>
                    <Th largura={150} aria-sort={ordenarPor === 'progresso' ? (ordemAsc ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => toggleSort('progresso')} className="inline-flex items-center gap-1 uppercase hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                        Progresso {setaOrdem('progresso')}
                      </button>
                    </Th>
                    <Th largura={220}>Tarefas pendentes</Th>
                    <Th largura={180}>Observação</Th>
                    <Th largura={90}>MIT</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => (
                    <tr
                      key={r.cliente.id}
                      onClick={() => router.push(`/fiscal/clientes/${r.cliente.id}`)}
                      className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]"
                    >
                      <Td>
                        <Link href={`/fiscal/clientes/${r.cliente.id}`} onClick={e => e.stopPropagation()} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente nome={r.cliente.nome} cnpj={r.cliente.cnpj} />
                        </Link>
                      </Td>
                      <Td>
                        {r.cliente.regime
                          ? <Badge tom={TOM_REGIME[bucketDoRegime(r.cliente.regime)] ?? 'info'} className="max-w-full overflow-hidden"><span className="truncate" title={r.cliente.regime}>{r.cliente.regime.split('/')[0].trim()}</span></Badge>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{r.cliente.responsavel ? <span className="block truncate" title={r.cliente.responsavel}>{r.cliente.responsavel}</span> : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <MonthPill percentual={r.total > 0 ? r.pct : null} />
                          <span className="text-[13px] text-fg-3">{r.feitas}/{r.total}</span>
                        </div>
                      </Td>
                      <Td>{pendencias(r)}</Td>
                      <Td className="text-[13px] text-fg-2">
                        {obsPorCliente[r.cliente.id]
                          ? <span className="block truncate" title={obsPorCliente[r.cliente.id]}>{obsPorCliente[r.cliente.id]}</span>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{r.cliente.mit ?? <span className="text-fg-3">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          </Card>
        </>
      )}
    </Pagina>
  )
}
