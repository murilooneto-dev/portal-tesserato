import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { isoParaDisplay } from './data-checklist'

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: 'Helvetica' },
  h1: { fontSize: 14, marginBottom: 2 },
  sub: { fontSize: 9, color: '#666', marginBottom: 4 },
  filtros: { fontSize: 8, color: '#888', marginBottom: 10 },
  secaoTitulo: { fontSize: 10, fontWeight: 700, marginTop: 14, marginBottom: 4, textTransform: 'uppercase' },
  table: { display: 'flex', width: '100%' },
  th: { backgroundColor: '#1a1a2e', color: '#fff', padding: 4, fontSize: 7, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  td: { padding: 4, fontSize: 7 },
  cEmpresa: { flex: 2 },
  cData: { flex: 1, textAlign: 'center' },
  cSemMov: { flex: 1, textAlign: 'center' },
  footer: { marginTop: 12, textAlign: 'center', color: '#999', fontSize: 7 },
  vazio: { fontSize: 8, color: '#999', marginBottom: 4 },
})

export interface LinhaSecaoRelatorio {
  nome: string
  semMovimento: boolean
  datas: (string | null)[]
}

export interface SecaoRelatorio {
  tipo: string
  colunas: string[]
  linhas: LinhaSecaoRelatorio[]
  mensagem?: string
}

interface Props {
  nomeUsuario: string
  mesNome: string
  ano: number
  filtrosResumo: string | null
  secoes: SecaoRelatorio[]
}

function RelatorioMinhasTarefasDocument({ nomeUsuario, mesNome, ano, filtrosResumo, secoes }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Relatório de Minhas Tarefas</Text>
        <Text style={styles.sub}>
          Competência: {mesNome} {ano}  |  Gerado em: {new Date().toLocaleString('pt-BR')}  |  Responsável: {nomeUsuario}
        </Text>
        {filtrosResumo && <Text style={styles.filtros}>Filtros: {filtrosResumo}</Text>}

        {secoes.map(secao => (
          <View key={secao.tipo} wrap={false}>
            <Text style={styles.secaoTitulo}>{secao.tipo}</Text>
            {secao.mensagem ? (
              <Text style={styles.vazio}>{secao.mensagem}</Text>
            ) : secao.linhas.length === 0 ? (
              <Text style={styles.vazio}>Nenhum cliente encontrado com esse filtro.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tr} fixed>
                  <Text style={[styles.th, styles.cEmpresa]}>Empresa</Text>
                  {secao.colunas.map(col => (
                    <Text key={col} style={[styles.th, styles.cData]}>{col}</Text>
                  ))}
                  <Text style={[styles.th, styles.cSemMov]}>Sem Mov.</Text>
                </View>
                {secao.linhas.map((linha, i) => (
                  <View style={styles.tr} key={`${linha.nome}-${i}`} wrap={false}>
                    <Text style={[styles.td, styles.cEmpresa]}>{linha.nome}</Text>
                    {linha.semMovimento ? (
                      <Text style={[styles.td, styles.cData, { flex: secao.colunas.length }]}>SEM MOVIMENTO</Text>
                    ) : (
                      secao.colunas.map((col, idx) => (
                        <Text key={col} style={[styles.td, styles.cData]}>
                          {linha.datas[idx] ? isoParaDisplay(linha.datas[idx] as string) : '—'}
                        </Text>
                      ))
                    )}
                    <Text style={[styles.td, styles.cSemMov]}>{linha.semMovimento ? 'Sim' : 'Não'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={styles.footer}>Tesserato Contabilidade — Relatório gerado automaticamente</Text>
      </Page>
    </Document>
  )
}

export default RelatorioMinhasTarefasDocument
