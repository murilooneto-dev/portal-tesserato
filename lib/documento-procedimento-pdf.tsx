import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  h1: { fontSize: 16, marginBottom: 2 },
  sub: { fontSize: 9, color: '#666', marginBottom: 16 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  meta: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 8 },
  metaL: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 2 },
  metaV: { fontSize: 11, fontWeight: 700 },
  campoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 6 },
  campoLabel: { width: '35%', fontSize: 9, color: '#666' },
  campoValor: { width: '65%', fontSize: 10 },
  footer: { marginTop: 20, textAlign: 'center', color: '#999', fontSize: 7 },
})

export interface DocumentoProcedimentoProps {
  modeloNome: string
  empresa: string
  processoNome: string
  responsavel: string | null
  campos: { etapa: string; valor: string }[]
}

function DocumentoProcedimentoDocument({ modeloNome, empresa, processoNome, responsavel, campos }: DocumentoProcedimentoProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{modeloNome}</Text>
        <Text style={styles.sub}>Gerado em: {new Date().toLocaleString('pt-BR')}</Text>

        <View style={styles.metaRow}>
          <View style={styles.meta}><Text style={styles.metaL}>Empresa</Text><Text style={styles.metaV}>{empresa}</Text></View>
          <View style={styles.meta}><Text style={styles.metaL}>Tipo de Processo</Text><Text style={styles.metaV}>{processoNome}</Text></View>
          <View style={styles.meta}><Text style={styles.metaL}>Responsável</Text><Text style={styles.metaV}>{responsavel ?? '—'}</Text></View>
        </View>

        {campos.map((c, i) => (
          <View style={styles.campoRow} key={i} wrap={false}>
            <Text style={styles.campoLabel}>{c.etapa}</Text>
            <Text style={styles.campoValor}>{c.valor || '—'}</Text>
          </View>
        ))}

        <Text style={styles.footer}>Tesserato Contabilidade — Setor Societário — Documento gerado automaticamente</Text>
      </Page>
    </Document>
  )
}

export async function gerarDocumentoProcedimentoPDF(props: DocumentoProcedimentoProps): Promise<Buffer> {
  return renderToBuffer(<DocumentoProcedimentoDocument {...props} />)
}
