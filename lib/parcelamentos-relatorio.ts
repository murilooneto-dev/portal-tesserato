// HTML do "Relatório" impresso de Parcelamentos. Conteúdo igual ao da tela
// antiga; todo dado do banco passa por escapeHtml.
import { escapeHtml } from './escape-html'
import { MESES_ABREV, MESES_COLS, TODOS, secoesParaMostrar, type Parcelamento, type SecaoParcelamento } from './parcelamentos-tela'

export interface DadosRelatorio {
  filtered: Parcelamento[]
  secoes: SecaoParcelamento[]
  secaoFiltro: string
  respFiltro: string
  search: string
  ano: number
  agora: string
}

export function montarRelatorioHtml({ filtered, secoes, secaoFiltro, respFiltro, search, ano, agora }: DadosRelatorio): string {
  const nomesSecoes = secoesParaMostrar(secoes, secaoFiltro)
    const filtroDesc = [
      secaoFiltro !== TODOS ? `Seção: ${escapeHtml(secaoFiltro)}` : null,
      respFiltro  !== TODOS ? `Responsável: ${escapeHtml(respFiltro)}` : null,
      search ? `Busca: "${escapeHtml(search)}"` : null,
    ].filter(Boolean).join(' · ') || 'Todos os registros'

    const secRows = nomesSecoes.map(secao => {
      const rows = filtered.filter(p => p.secao === secao)
      if (!rows.length) return ''
      const trs = rows.map((p, i) => `
        <tr class="${i % 2 === 0 ? 'even' : ''}">
          <td>${escapeHtml(p.empresa)}</td>
          <td>${escapeHtml(p.cnpj) || '—'}</td>
          <td>${escapeHtml(p.regime) || '—'}</td>
          <td>${escapeHtml(p.responsavel) || '—'}</td>
          <td>${escapeHtml(p.local_tipo) || '—'}</td>
          <td>${escapeHtml(p.status)}</td>
          ${MESES_COLS.map(m => {
            const v = p[m]
            return `<td class="month ${v ? 'filled' : ''}">${escapeHtml(v) || '—'}</td>`
          }).join('')}
        </tr>`).join('')
      return `
        <div class="section-title">${escapeHtml(secao)} <span class="count">${rows.length} parcelamento${rows.length !== 1 ? 's' : ''}</span></div>
        <table>
          <thead><tr>
            <th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Local/Tipo</th><th>Status</th>
            ${MESES_ABREV.map(m => `<th class="month">${m}</th>`).join('')}
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Parcelamentos ${ano} — Tesserato Contabilidade</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 8px; color: #111; background: white; }
      .header { background: #162444; color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
      .header-left h1 { font-size: 18px; font-weight: bold; letter-spacing: -0.5px; }
      .header-left .sub { font-size: 10px; color: rgba(255,255,255,0.55); margin-top: 2px; }
      .header-right { text-align: right; font-size: 9px; color: rgba(255,255,255,0.55); line-height: 1.6; }
      .header-right strong { color: white; }
      .meta { display: flex; gap: 20px; margin-bottom: 14px; }
      .meta-item { background: #f4f6f8; border-radius: 6px; padding: 6px 12px; }
      .meta-item .label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; }
      .meta-item .value { font-size: 11px; font-weight: bold; color: #111; }
      .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8px; color: #162444; border-left: 3px solid #00CCEB; padding-left: 8px; margin: 14px 0 6px; }
      .section-title .count { font-weight: normal; color: #888; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      th { background: #162444; color: white; padding: 4px 6px; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; }
      th.month { text-align: center; width: 40px; }
      td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
      td.month { text-align: center; font-size: 7.5px; font-weight: bold; }
      td.month.filled { color: #1d4ed8; }
      tr.even td { background: #f9fafb; }
      tr:hover td { background: #f0f4ff; }
      footer { margin-top: 16px; text-align: center; color: #aaa; font-size: 7px; border-top: 1px solid #eee; padding-top: 6px; }
      @media print { button { display: none; } }
    </style></head><body>
    <div class="header">
      <div class="header-left">
        <h1>Relatório de Parcelamentos — ${ano}</h1>
        <div class="sub">Tesserato Contabilidade · Setor Fiscal</div>
      </div>
      <div class="header-right">
        <div>Gerado em: <strong>${agora}</strong></div>
        <div>Filtros aplicados: <strong>${filtroDesc}</strong></div>
        <div>Total de registros: <strong>${filtered.length}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><div class="label">Ano de referência</div><div class="value">${ano}</div></div>
      <div class="meta-item"><div class="label">Total de parcelamentos</div><div class="value">${filtered.length}</div></div>
      <div class="meta-item"><div class="label">Seções</div><div class="value">${nomesSecoes.filter(s => filtered.some(p => p.secao === s)).length}</div></div>
      ${respFiltro !== TODOS ? `<div class="meta-item"><div class="label">Responsável</div><div class="value">${escapeHtml(respFiltro)}</div></div>` : ''}
    </div>
    ${secRows}
    <footer>Tesserato Contabilidade — Documento gerado automaticamente em ${agora}</footer>
    </body></html>`
  return html
}
