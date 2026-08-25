import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor } from './types'

// MES_PARA_COLUNA e montarUpdateParcelamento vivem em lib/parcelamento-campos.ts
// (sem nenhum import de servidor) porque app/fiscal/parcelamentos/page.tsx é
// 'use client' e importa montarUpdateParcelamento — se ficassem aqui, o
// import de getAuthenticatedAdmin (que puxa next/headers) quebraria o build
// client. Reexportados aqui pra todo consumidor server-side existente
// (sincronizarTarefasParcelamento, gravarDataParcelamento) e os testes
// continuarem importando de '../lib/parcelamento-tarefas' sem mudança.
export { MES_PARA_COLUNA, montarUpdateParcelamento } from './parcelamento-campos'
import { MES_PARA_COLUNA } from './parcelamento-campos'

// "yyyy-mm-dd" -> "dd/mm" (formato usado nas colunas de mes de parcelamentos,
// que nunca guardam ano — decisão do usuário 2026-08-05).
export function isoParaDdMm(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

// "dd/mm" + ano -> ISO 8601 completo, mesmo formato usado em `concluida_em`
// pelas demais tarefas (ver toggleTarefa/toggleTarefaPessoal). Retorna null
// pra texto que não é uma data dd/mm válida.
export function ddMmParaIso(ddMm: string, ano: number): string | null {
  const partes = ddMm.split('/')
  if (partes.length !== 2) return null
  const [dia, mes] = partes
  if (!/^\d{1,2}$/.test(dia) || !/^\d{1,2}$/.test(mes)) return null
  const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  // new Date faz rollover leniente pra datas invalidas do calendario (ex:
  // 31/02 vira 3 de marco) sem lancar erro nem virar NaN — confere que o
  // mes/dia resultante bate com o que foi pedido pra rejeitar esses casos.
  if (dateObj.getMonth() + 1 !== Number(mes) || dateObj.getDate() !== Number(dia)) return null
  return dateObj.toISOString()
}

// Nome da tarefa sintética gerada a partir de um parcelamento (spec item 3).
// `desambiguar` é decidido por quem chama (sincronizarTarefasParcelamento),
// que sabe se o cliente tem 2+ parcelamentos na mesma seção.
export function nomeTarefaParcelamento(
  secao: string,
  localTipo: string | null,
  desambiguar: boolean,
): string {
  if (desambiguar && localTipo && localTipo.trim() !== '') {
    return `Parcelamentos (${secao} / ${localTipo.trim()})`
  }
  return `Parcelamentos (${secao})`
}

interface ParcelamentoParaNome {
  id: string
  clienteId: string
  secao: string
  localTipo: string | null
}

// Gera o nome de tarefa de cada parcelamento, desambiguando primeiro por
// Local/Tipo (spec item 3) e, se o nome ainda assim colidir com outro
// parcelamento do mesmo cliente — Local/Tipo vazio ou repetido nos dois —,
// acrescentando um contador determinístico (ordenado por id) pra garantir
// nomes únicos. Sem isso, a unique constraint (cliente_id, mes, ano, tipo,
// setor) do upsert em sincronizarTarefasParcelamento engole silenciosamente
// um dos dois, e só um parcelamento fica de fato vinculado a uma tarefa.
export function nomesTarefaParcelamentos(itens: ParcelamentoParaNome[]): Map<string, string> {
  const contagemGrupo = new Map<string, number>()
  for (const p of itens) {
    const chave = `${p.clienteId}::${p.secao}`
    contagemGrupo.set(chave, (contagemGrupo.get(chave) ?? 0) + 1)
  }

  const comNome = itens.map(p => {
    const chave = `${p.clienteId}::${p.secao}`
    const desambiguar = (contagemGrupo.get(chave) ?? 0) > 1
    return { ...p, tipo: nomeTarefaParcelamento(p.secao, p.localTipo, desambiguar) }
  })

  const gruposPorNome = new Map<string, typeof comNome>()
  for (const item of comNome) {
    const chave = `${item.clienteId}::${item.tipo}`
    const grupo = gruposPorNome.get(chave) ?? []
    grupo.push(item)
    gruposPorNome.set(chave, grupo)
  }
  for (const grupo of gruposPorNome.values()) {
    if (grupo.length <= 1) continue
    grupo.sort((a, b) => a.id.localeCompare(b.id))
    grupo.forEach((item, i) => { item.tipo = `${item.tipo} (${i + 1})` })
  }

  return new Map(comNome.map(item => [item.id, item.tipo]))
}

interface TarefaExistenteParcelamento {
  id: string
  parcelamento_id: string
  tipo: string
}

// Decide, pra cada parcelamento resolvido, se a tarefa dele precisa ser
// renomeada (ja existe uma linha em `tarefas` pro parcelamento_id neste
// mes/ano/setor, mas com um `tipo` diferente do calculado agora por
// nomesTarefaParcelamentos) ou inserida (ainda nao existe nenhuma linha).
// Sem isso, o upsert com ignoreDuplicates (mais abaixo) trata um `tipo`
// novo como uma tarefa nova em vez de renomear a existente, duplicando a
// tarefa toda vez que a desambiguacao muda o nome de um parcelamento ja
// sincronizado (bug confirmado no banco de dev 2026-08-19: duas linhas em
// `tarefas` com o mesmo parcelamento_id, uma com nome sem sufixo orfa).
export function separarRenomeacoesEInsercoes(
  parcelamentoIds: string[],
  nomes: Map<string, string>,
  tarefasExistentes: TarefaExistenteParcelamento[],
): { renomear: { tarefaId: string; novoTipo: string }[]; inserirIds: string[] } {
  const existentePorParcelamento = new Map(
    tarefasExistentes.map(t => [t.parcelamento_id, t]),
  )
  const renomear: { tarefaId: string; novoTipo: string }[] = []
  const inserirIds: string[] = []
  for (const id of parcelamentoIds) {
    const nomeAtual = nomes.get(id)
    if (!nomeAtual) continue
    const existente = existentePorParcelamento.get(id)
    if (!existente) {
      inserirIds.push(id)
    } else if (existente.tipo !== nomeAtual) {
      renomear.push({ tarefaId: existente.id, novoTipo: nomeAtual })
    }
  }
  return { renomear, inserirIds }
}

// Grava (ou limpa, se valorDdMm=null) a data de um mes de parcelamento —
// chamado depois que uma tarefa com parcelamento_id é marcada/desmarcada
// no checklist da ficha (spec item 5).
export async function gravarDataParcelamento(
  supabase: SupabaseClient,
  parcelamentoId: string,
  mes: number,
  valorDdMm: string | null,
): Promise<void> {
  const coluna = MES_PARA_COLUNA[mes]
  if (!coluna) return
  await supabase.from('parcelamentos').update({ [coluna]: valorDdMm }).eq('id', parcelamentoId)
}

interface ParcelamentoRow {
  id: string
  cnpj: string | null
  secao: string
  local_tipo: string | null
  [coluna: string]: unknown
}

// Cria, em `tarefas`, uma linha pra cada parcelamento "EM ANDAMENTO" do
// setor informado que ainda não tem tarefa pro mes/ano em questão. Nunca
// sobrescreve uma tarefa já existente (spec item 4) — o upsert com
// ignoreDuplicates faz isso de forma atômica, inclusive contra corrida
// entre duas páginas carregando ao mesmo tempo.
export async function sincronizarTarefasParcelamento(
  supabase: SupabaseClient,
  setor: Extract<UserSetor, 'fiscal' | 'pessoal'>,
  mes: number,
  ano: number,
): Promise<void> {
  const coluna = MES_PARA_COLUNA[mes]
  if (!coluna) return

  const { data: parcelamentosRaw } = await supabase
    .from('parcelamentos')
    .select(`id, cnpj, secao, local_tipo, ${coluna}`)
    .eq('status', 'EM ANDAMENTO')
    .contains('setores', [setor])

  const parcelamentos = (parcelamentosRaw ?? []) as unknown as ParcelamentoRow[]
  if (parcelamentos.length === 0) return

  // Resolve cnpj -> cliente_id só entre clientes que realmente tem linha na
  // tabela de extensão desse setor (spec item 4.2 — inner join proposital).
  const tabelaExtensao = setor === 'fiscal' ? 'clientes_fiscal' : 'clientes_pessoal'
  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select(`id, cnpj, ${tabelaExtensao}!inner(cliente_id)`)
    .not('cnpj', 'is', null)

  const clienteIdPorCnpj = new Map<string, string>()
  for (const c of (clientesRaw ?? []) as { id: string; cnpj: string }[]) {
    clienteIdPorCnpj.set(c.cnpj, c.id)
  }

  const resolvidos = parcelamentos
    .map(p => ({ parcelamento: p, clienteId: p.cnpj ? clienteIdPorCnpj.get(p.cnpj) : undefined }))
    .filter((r): r is { parcelamento: ParcelamentoRow; clienteId: string } => !!r.clienteId)

  if (resolvidos.length === 0) return

  const nomes = nomesTarefaParcelamentos(resolvidos.map(({ parcelamento, clienteId }) => ({
    id: parcelamento.id,
    clienteId,
    secao: parcelamento.secao,
    localTipo: parcelamento.local_tipo,
  })))

  const { supabase: admin } = await getAuthenticatedAdmin()
  if (!admin) return

  const parcelamentoIds = resolvidos.map(({ parcelamento }) => parcelamento.id)
  const { data: tarefasExistentesRaw } = await admin
    .from('tarefas')
    .select('id, parcelamento_id, tipo')
    .in('parcelamento_id', parcelamentoIds)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('setor', setor)

  const tarefasExistentes = (tarefasExistentesRaw ?? []) as TarefaExistenteParcelamento[]
  const { renomear, inserirIds } = separarRenomeacoesEInsercoes(parcelamentoIds, nomes, tarefasExistentes)

  for (const { tarefaId, novoTipo } of renomear) {
    await admin.from('tarefas').update({ tipo: novoTipo }).eq('id', tarefaId)
  }

  if (inserirIds.length === 0) return

  const idsParaInserir = new Set(inserirIds)
  const novasTarefas = resolvidos
    .filter(({ parcelamento }) => idsParaInserir.has(parcelamento.id))
    .map(({ parcelamento, clienteId }) => {
      const valorMes = (parcelamento[coluna] as string | null) ?? null
      const concluida = !!valorMes
      const concluida_em = concluida ? ddMmParaIso(valorMes!, ano) : null
      return {
        cliente_id: clienteId,
        usuario_id: null,
        mes,
        ano,
        tipo: nomes.get(parcelamento.id)!,
        setor,
        concluida,
        concluida_em,
        parcelamento_id: parcelamento.id,
      }
    })

  await admin.from('tarefas').upsert(novasTarefas, {
    onConflict: 'cliente_id,mes,ano,tipo,setor',
    ignoreDuplicates: true,
  })
}

// Dado um conjunto de ids de parcelamento (tipicamente extraído das tarefas
// já carregadas de um cliente/mes/ano), retorna só os que estão atualmente
// "EM ANDAMENTO". Usado pra decidir quais tarefas geradas por parcelamento
// ainda devem aparecer no checklist/dashboard — cancelar ou liquidar um
// parcelamento não apaga a tarefa já criada (histórico é preservado), só
// tira ela da lista visível; reverter o status pro mesmo registro traz a
// tarefa de volta, já que a checagem é sempre contra o status atual.
export async function idsDeParcelamentosAtivos(
  supabase: SupabaseClient,
  parcelamentoIds: string[],
): Promise<Set<string>> {
  const idsUnicos = Array.from(new Set(parcelamentoIds))
  if (idsUnicos.length === 0) return new Set()

  const { data } = await supabase
    .from('parcelamentos')
    .select('id')
    .in('id', idsUnicos)
    .eq('status', 'EM ANDAMENTO')

  return new Set((data ?? []).map(p => p.id as string))
}
