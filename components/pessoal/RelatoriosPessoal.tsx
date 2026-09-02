'use client'

import { useRouter } from 'next/navigation'
import type { Tarefa } from '@/lib/types'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function progresso(cliente: ClienteComPessoal, tarefas: Tarefa[], mesesVisiveisPorTipo: Record<string, number[] | null>, mes: number, mapa: MapaVinculosSetor) {
  const tiposVisiveis = filtrarTarefasVisiveis(calcularTarefasEsperadas(cliente, mapa), mesesVisiveisPorTipo, mes)
  const tipos = new Set(tiposVisiveis)
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}

interface Props {
  clientes: ClienteComPessoal[]
  tarefas: Tarefa[]
  isAdmin: boolean
  mes: number
  ano: number
  mesesVisiveisPorTipo: Record<string, number[] | null>
  obsPorCliente: Record<string, string>
  mapaVinculos: MapaVinculosSetor
  atividadesCatalogo: string[]
}

export default function RelatoriosPessoal({ clientes, tarefas, isAdmin, mes, ano, mesesVisiveisPorTipo, obsPorCliente, mapaVinculos, atividadesCatalogo }: Props) {
  const router = useRouter()
  const [filtroResp, setFiltroResp] = useFiltroPersistente('relatorios-pessoal:responsavel', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('relatorios-pessoal:atividade', [])
  const [filtroTarefa, setFiltroTarefa] = useFiltroPersistente('relatorios-pessoal:tarefa', 'TODAS')
  const [apenasP, setApenasP] = useFiltroPersistente('relatorios-pessoal:pendencia', false)

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  const responsaveis = isAdmin
    ? ['TODOS', ...Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[]))]
    : []

  const atividades = atividadesCatalogo
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => calcularTarefasEsperadas(c, mapaVinculos)))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroAtividade.length === 0 || ((c.atividade ?? []).length === filtroAtividade.length && filtroAtividade.every(a => (c.atividade ?? []).includes(a))))
    .filter(c => filtroTarefa === 'TODAS' || calcularTarefasEsperadas(c, mapaVinculos).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mesesVisiveisPorTipo, mes, mapaVinculos) }))
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
<title>Relatório Pessoal — ${MESES_NOME[mes-1]} ${ano}</title>
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
  footer { margin-top: 16px; text-align: center; color: #999; font-size: 8px; }
  @media print { button { display: none; } }
</style></head><body>
<h1>Relatório de Tarefas Pessoal</h1>
<p class="sub">Competência: ${MESES_NOME[mes-1]} ${ano} &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${filtroResp !== 'TODOS' ? `Responsável: ${filtroResp}` : 'Todos os responsáveis'}</p>
<div class="stats">
  <div class="stat"><div class="n">${stats.total}</div><div>Total Clientes</div></div>
  <div class="stat" style="border-color:#10b981"><div class="n" style="color:#10b981">${stats.cem}</div><div>100% Concluídos</div></div>
  <div class="stat" style="border-color:#f59e0b"><div class="n" style="color:#f59e0b">${stats.andamento}</div><div>Em Andamento</div></div>
  <div class="stat" style="border-color:#ef4444"><div class="n" style="color:#ef4444">${stats.zero}</div><div>Não Iniciados</div></div>
</div>
<table>
  <thead><tr><th>#</th><th>Cliente</th><th>CNPJ</th><th>Responsável</th><th>Progresso</th><th>Tarefas Pendentes</th><th>Observação</th><th>MIT</th></tr></thead>
  <tbody>
    ${filtrados.map((r, i) => `<tr>
      <td>${i+1}</td>
      <td><strong>${r.cliente.nome}</strong></td>
      <td>${r.cliente.cnpj ?? '—'}</td>
      <td>${r.cliente.responsavel ?? '—'}</td>
      <td><span class="bar-bg"><span class="bar-fill" style="width:${r.pct}%"></span></span>${r.pct}%</td>
      <td>${r.pct === 100 ? '✓ Concluído' : r.pendentes.join(', ')}</td>
      <td>${obsPorCliente[r.cliente.id] ?? ''}</td>
      <td>${r.cliente.mit ?? '—'}</td>
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold text-[var(--fg)] mr-2">
          Relatório <span className="text-[var(--fg)]/40 font-normal text-lg">{String(mes).padStart(2,'0')}/{ano}</span>
        </h1>

        {isAdmin && (
          <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
            className="bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50">
            {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        )}

        <select value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)}
          className="bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50">
          <option value="TODAS" className="bg-[var(--bg-surface)]">Todas as tarefas</option>
          {tarefasDisponiveis.map(t => <option key={t} value={t} className="bg-[var(--bg-surface)]">{t}</option>)}
        </select>

        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer hover:border-[var(--fg)]/20 transition-colors">
          <input type="checkbox" checked={apenasP} onChange={e => setApenasP(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Apenas pendências</span>
        </label>

        <div className="flex-1" />

        <button onClick={imprimir}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-[var(--fg)] text-sm font-semibold px-5 py-2.5 rounded-xl transition-all whitespace-nowrap">
          🖨 Imprimir / Salvar PDF
        </button>
      </div>

      {atividades.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs text-[var(--fg)]/40">Atividade:</span>
          {atividades.map(nome => (
            <button
              key={nome}
              type="button"
              onClick={() => toggleAtividade(nome)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtroAtividade.includes(nome)
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Clientes', val: stats.total, cor: 'var(--fg)' },
          { label: '100% Concluídos', val: stats.cem, cor: '#10b981' },
          { label: 'Em Andamento', val: stats.andamento, cor: '#f59e0b' },
          { label: 'Não Iniciados', val: stats.zero, cor: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl bg-[var(--fg)]/6 border border-[var(--fg)]/12">
            <p className="text-2xl font-bold" style={{ color: s.cor }}>{s.val}</p>
            <p className="text-[var(--fg)]/60 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {['#','Cliente','CNPJ','Responsável','Progresso','Tarefas Pendentes','Observação','MIT'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r, i) => (
              <tr
                key={r.cliente.id}
                onClick={() => router.push(`/pessoal/clientes/${r.cliente.id}`)}
                className="border-b border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-[var(--fg)]/40 text-xs">{i+1}</td>
                <td className="px-4 py-3 text-[var(--fg)] text-sm font-medium">{r.cliente.nome}</td>
                <td className="px-4 py-3 text-[var(--fg)]/50 text-xs font-mono">{r.cliente.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--fg)]/60 text-xs">{r.cliente.responsavel ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-[var(--fg)]/15 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="text-xs text-[var(--fg)]/70">{r.pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm w-40">
                  {r.pct === 100
                    ? <span className="text-green-400 text-xs font-medium">✓ Concluído</span>
                    : (
                      <div className="text-[var(--fg)]/60 text-xs leading-relaxed space-y-0.5">
                        {r.pendentes.slice(0, 3).map(p => <div key={p} className="truncate">{p}</div>)}
                        {r.pendentes.length > 3 && <div className="text-[var(--fg)]/35">+{r.pendentes.length - 3}</div>}
                      </div>
                    )
                  }
                </td>
                <td className="px-4 py-3 text-[var(--fg)]/60 text-xs max-w-[200px] truncate" title={obsPorCliente[r.cliente.id]}>{obsPorCliente[r.cliente.id] ?? ''}</td>
                <td className="px-4 py-3 text-[var(--fg)]/50 text-xs">{r.cliente.mit ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  )
}
