'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, ClipboardList, Printer } from 'lucide-react'
import type { Tarefa } from '@/lib/types'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { escapeHtml } from '@/lib/escape-html'
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select, Switch } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

// Colunas da tabela (mockup c-07/p-04): CNPJ fica embaixo do nome, sem coluna própria.
const COLUNAS: { titulo: string; largura?: number }[] = [
  { titulo: 'Cliente', largura: 288 },
  { titulo: 'Responsável', largura: 150 },
  { titulo: 'Progresso', largura: 160 },
  { titulo: 'Tarefas pendentes' },
  { titulo: 'Observação', largura: 150 },
  { titulo: 'MIT', largura: 80 },
]

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function progresso(cliente: ClienteComContabil, tarefas: Tarefa[], mapa: MapaVinculosSetor) {
  const tipos = new Set(calcularTarefasEsperadas(cliente, mapa))
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}

// Responsável com a bolinha da inicial na cor do perfil (mesmo desenho da
// ficha do Fiscal); sem cor cadastrada, usa a cor de destaque.
function Responsavel({ nome, cores }: { nome: string | null; cores: Record<string, string> }) {
  if (!nome) return <span className="text-fg-3">Sem responsável</span>
  const cor = cores[nome.toUpperCase()] || 'var(--acc)'
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold text-acc-ink" style={{ backgroundColor: cor }}>
        {nome.charAt(0).toUpperCase()}
      </span>
      <span className="truncate text-fg-2" title={nome}>{nome}</span>
    </span>
  )
}

function Progresso({ feitas, total, pct }: { feitas: number; total: number; pct: number }) {
  return (
    <div className="flex items-center gap-2.5" role="progressbar" aria-label={`${feitas} de ${total} tarefas concluídas`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-raised">
        <div className={`h-full rounded ${pct === 100 ? 'bg-ok' : 'bg-acc'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="min-w-[34px] text-right text-[13px] tabular-nums text-fg-2">{feitas}/{total}</span>
    </div>
  )
}

interface Props {
  clientes: ClienteComContabil[]
  tarefas: Tarefa[]
  isAdmin: boolean
  mes: number
  ano: number
  obsPorCliente: Record<string, string>
  mapaVinculos: MapaVinculosSetor
  gruposCatalogo: { nome: string; tarefas: string[] }[]
  coresResponsavel: Record<string, string>
}

export default function RelatoriosContabil({ clientes, tarefas, isAdmin, mes, ano, obsPorCliente, mapaVinculos, gruposCatalogo, coresResponsavel }: Props) {
  const router = useRouter()
  const [filtroResp, setFiltroResp] = useFiltroPersistente('relatorios-contabil:responsavel', 'TODOS')
  const [filtroGrupoTarefas, setFiltroGrupoTarefas] = useFiltroPersistente('relatorios-contabil:grupo', 'TODOS')
  const [filtroTarefa, setFiltroTarefa] = useFiltroPersistente('relatorios-contabil:tarefa', 'TODAS')
  const [apenasP, setApenasP] = useFiltroPersistente('relatorios-contabil:pendencia', false)

  const gruposDisponiveis = Array.from(new Set(gruposCatalogo.map(g => g.nome))).sort()

  function selecionarGrupo(nome: string) {
    setFiltroGrupoTarefas(nome)
    const tarefasDoNovoGrupo = nome === 'TODOS'
      ? null
      : new Set(gruposCatalogo.filter(g => g.nome === nome).flatMap(g => g.tarefas))
    if (tarefasDoNovoGrupo && !tarefasDoNovoGrupo.has(filtroTarefa)) setFiltroTarefa('TODAS')
  }

  const responsaveis = isAdmin
    ? ['TODOS', ...Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[]))]
    : []

  const tarefasDisponiveis = filtroGrupoTarefas === 'TODOS'
    ? Array.from(new Set(clientes.flatMap(c => calcularTarefasEsperadas(c, mapaVinculos)))).sort()
    : Array.from(new Set(gruposCatalogo.filter(g => g.nome === filtroGrupoTarefas).flatMap(g => g.tarefas))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroTarefa === 'TODAS' || calcularTarefasEsperadas(c, mapaVinculos).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mapaVinculos) }))
    .filter(r => !apenasP || (filtroTarefa === 'TODAS' ? r.pct < 100 : r.pendentes.includes(filtroTarefa)))
    .sort((a, b) => a.pct - b.pct)

  const stats = {
    total: filtrados.length,
    cem: filtrados.filter(r => r.pct === 100).length,
    andamento: filtrados.filter(r => r.pct > 0 && r.pct < 100).length,
    zero: filtrados.filter(r => r.pct === 0).length,
  }

  function imprimir() {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Contábil — ${MESES_NOME[mes-1]} ${ano}</title>
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
  td .cnpj { display: block; color: #666; font-family: monospace; font-size: 8px; margin-top: 2px; }
  tr:nth-child(even) td { background: #fafafa; }
  .bar-bg { background: #e5e7eb; border-radius: 3px; height: 6px; width: 60px; display: inline-block; vertical-align: middle; margin-right: 4px; }
  .bar-fill { background: #00CCEB; height: 6px; border-radius: 3px; display: block; }
  footer { margin-top: 16px; text-align: center; color: #999; font-size: 8px; }
  @media print { button { display: none; } }
</style></head><body>
<h1>Relatório de Tarefas Contábeis</h1>
<p class="sub">Competência: ${MESES_NOME[mes-1]} ${ano} &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${filtroResp !== 'TODOS' ? `Responsável: ${escapeHtml(filtroResp)}` : 'Todos os responsáveis'}</p>
<div class="stats">
  <div class="stat"><div class="n">${stats.total}</div><div>Total Clientes</div></div>
  <div class="stat" style="border-color:#10b981"><div class="n" style="color:#10b981">${stats.cem}</div><div>100% Concluídos</div></div>
  <div class="stat" style="border-color:#f59e0b"><div class="n" style="color:#f59e0b">${stats.andamento}</div><div>Em Andamento</div></div>
  <div class="stat" style="border-color:#ef4444"><div class="n" style="color:#ef4444">${stats.zero}</div><div>Não Iniciados</div></div>
</div>
<table>
  <thead><tr><th>Cliente</th><th>Responsável</th><th>Progresso</th><th>Tarefas Pendentes</th><th>Observação</th><th>MIT</th></tr></thead>
  <tbody>
    ${filtrados.map(r => `<tr>
      <td><strong>${escapeHtml(r.cliente.nome)}</strong><span class="cnpj">${escapeHtml(r.cliente.cnpj) || 'CNPJ não informado'}</span></td>
      <td>${escapeHtml(r.cliente.responsavel) || '—'}</td>
      <td><span class="bar-bg"><span class="bar-fill" style="width:${r.pct}%"></span></span>${r.feitas}/${r.total}</td>
      <td>${r.pct === 100 ? 'Concluído' : escapeHtml(r.pendentes.join(', '))}</td>
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

  return (
    <Pagina className="mx-auto w-full max-w-7xl">
      <CabecalhoPagina
        titulo="Relatórios"
        subtitulo={`Situação da carteira do Contábil em ${MESES_NOME[mes - 1]} ${ano}`}
        acoes={<Button variante="primario" icone={<Printer size={16} aria-hidden="true" />} onClick={imprimir}>Imprimir ou salvar PDF</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <Field rotulo="Responsável" className="w-full sm:w-[170px]">
            {c => (
              <Select id={c.id} value={filtroResp} onChange={e => setFiltroResp(e.target.value)}>
                {responsaveis.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos' : r}</option>)}
              </Select>
            )}
          </Field>
        )}
        {gruposDisponiveis.length > 0 && (
          <Field rotulo="Grupo" className="w-full sm:w-[190px]">
            {c => (
              <Select id={c.id} value={filtroGrupoTarefas} onChange={e => selecionarGrupo(e.target.value)}>
                <option value="TODOS">Todos os grupos</option>
                {gruposDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field rotulo="Tarefa" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)}>
              <option value="TODAS">Todas as tarefas</option>
              {tarefasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex min-h-11 items-center">
          <Switch ligado={apenasP} onMudar={setApenasP} rotulo="Só com pendências" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {statsCards.map(s => (
          <div key={s.label} className="min-w-0 rounded-xl border border-line-soft bg-surface px-5 py-[18px]">
            <p className="text-[13px] font-medium text-fg-3">{s.label}</p>
            <p className={`mt-1.5 text-[30px] font-semibold leading-tight tabular-nums ${s.cor}`}>{s.val}</p>
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
                href={`/contabil/clientes/${r.cliente.id}`}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1"><NomeCliente nome={r.cliente.nome} cnpj={r.cliente.cnpj ?? null} /></div>
                  <ChevronRight size={18} className="mt-0.5 flex-none text-fg-3" aria-hidden="true" />
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                  <Responsavel nome={r.cliente.responsavel} cores={coresResponsavel} />
                  {r.cliente.mit && <span className="text-fg-3">MIT: {r.cliente.mit}</span>}
                </div>
                <Progresso feitas={r.feitas} total={r.total} pct={r.pct} />
                {pendencias(r)}
                {obsPorCliente[r.cliente.id] && <p className="text-[13px] text-fg-2">{obsPorCliente[r.cliente.id]}</p>}
              </Link>
            ))}
          </div>

          {/* Tela larga: tabela */}
          <Card semPadding className="hidden overflow-hidden sm:block">
            <div className="relative overflow-x-auto">
              <Tabela className="min-w-[1000px]">
                <thead>
                  <tr>
                    {COLUNAS.map(c => <Th key={c.titulo} largura={c.largura}>{c.titulo}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => (
                    <tr
                      key={r.cliente.id}
                      onClick={() => router.push(`/contabil/clientes/${r.cliente.id}`)}
                      className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]"
                    >
                      <Td>
                        <Link href={`/contabil/clientes/${r.cliente.id}`} onClick={e => e.stopPropagation()} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente nome={r.cliente.nome} cnpj={r.cliente.cnpj ?? null} />
                        </Link>
                      </Td>
                      <Td><Responsavel nome={r.cliente.responsavel} cores={coresResponsavel} /></Td>
                      <Td><Progresso feitas={r.feitas} total={r.total} pct={r.pct} /></Td>
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
