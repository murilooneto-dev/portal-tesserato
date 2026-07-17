import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { LinhaRelatorio } from './relatorio-fiscal'

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: 'Helvetica' },
  h1: { fontSize: 14, marginBottom: 2 },
  sub: { fontSize: 9, color: '#666', marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  stat: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 6, textAlign: 'center' },
  statN: { fontSize: 14, fontWeight: 700 },
  statL: { fontSize: 7, color: '#666' },
  table: { display: 'flex', width: '100%' },
  th: { backgroundColor: '#1a1a2e', color: '#fff', padding: 4, fontSize: 7, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  td: { padding: 4, fontSize: 7 },
  cNum: { width: '4%' },
  cNome: { width: '20%' },
  cCnpj: { width: '13%' },
  cRegime: { width: '10%' },
  cResp: { width: '13%' },
  cProg: { width: '10%' },
  cPend: { width: '25%' },
  cMit: { width: '5%' },
  footer: { marginTop: 12, textAlign: 'center', color: '#999', fontSize: 7 },
})

interface Props {
  responsavel: string
  mesNome: string
  ano: number
  linhas: LinhaRelatorio[]
}

function RelatorioFiscalDocument({ responsavel, mesNome, ano, linhas }: Props) {
  const stats = {
    total: linhas.length,
    cem: linhas.filter(l => l.pct === 100).length,
    andamento: linhas.filter(l => l.pct > 0 && l.pct < 100).length,
    zero: linhas.filter(l => l.pct === 0).length,
  }

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.h1}>Relatório de Tarefas Fiscais</Text>
        <Text style={styles.sub}>
          Competência: {mesNome} {ano}  |  Gerado em: {new Date().toLocaleString('pt-BR')}  |  Responsável: {responsavel}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statN}>{stats.total}</Text><Text style={styles.statL}>Total Clientes</Text></View>
          <View style={styles.stat}><Text style={[styles.statN, { color: '#10b981' }]}>{stats.cem}</Text><Text style={styles.statL}>100% Concluídos</Text></View>
          <View style={styles.stat}><Text style={[styles.statN, { color: '#f59e0b' }]}>{stats.andamento}</Text><Text style={styles.statL}>Em Andamento</Text></View>
          <View style={styles.stat}><Text style={[styles.statN, { color: '#ef4444' }]}>{stats.zero}</Text><Text style={styles.statL}>Não Iniciados</Text></View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr} fixed>
            <Text style={[styles.th, styles.cNum]}>#</Text>
            <Text style={[styles.th, styles.cNome]}>Cliente</Text>
            <Text style={[styles.th, styles.cCnpj]}>CNPJ</Text>
            <Text style={[styles.th, styles.cRegime]}>Regime</Text>
            <Text style={[styles.th, styles.cResp]}>Responsável</Text>
            <Text style={[styles.th, styles.cProg]}>Progresso</Text>
            <Text style={[styles.th, styles.cPend]}>Tarefas Pendentes</Text>
            <Text style={[styles.th, styles.cMit]}>MIT</Text>
          </View>
          {linhas.map((l, i) => (
            <View style={styles.tr} key={l.cliente.id} wrap={false}>
              <Text style={[styles.td, styles.cNum]}>{i + 1}</Text>
              <Text style={[styles.td, styles.cNome]}>{l.cliente.nome}</Text>
              <Text style={[styles.td, styles.cCnpj]}>{l.cliente.cnpj ?? '—'}</Text>
              <Text style={[styles.td, styles.cRegime]}>{l.cliente.regime ?? l.cliente.grupo ?? '—'}</Text>
              <Text style={[styles.td, styles.cResp]}>{l.cliente.responsavel ?? '—'}</Text>
              <Text style={[styles.td, styles.cProg]}>{l.pct}%</Text>
              <Text style={[styles.td, styles.cPend]}>{l.pct === 100 ? '✓ Concluído' : l.pendentes.join(', ')}</Text>
              <Text style={[styles.td, styles.cMit]}>{l.cliente.mit ?? '—'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Tesserato Contabilidade — Relatório gerado automaticamente</Text>
      </Page>
    </Document>
  )
}

export async function gerarRelatorioFiscalPDF(props: Props): Promise<Buffer> {
  return renderToBuffer(<RelatorioFiscalDocument {...props} />)
}
