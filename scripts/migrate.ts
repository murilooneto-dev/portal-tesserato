import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const sqlitePath = process.argv[2]
if (!sqlitePath) {
  console.error('Uso: npx tsx scripts/migrate.ts <banco.sqlite>')
  process.exit(1)
}

console.log(`\nMigrando banco: ${sqlitePath}\n`)

const db = new Database(sqlitePath, { readonly: true })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helpers ────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function upsertLotes(tabela: string, rows: Record<string, unknown>[], onConflict: string) {
  let ok = 0
  for (const lote of chunk(rows, 100)) {
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict })
    if (error) console.error(`  ✗ Erro em ${tabela}:`, error.message)
    else ok += lote.length
  }
  return ok
}

// ── Lê o payload ───────────────────────────────────────────────────────────

const appDataRow = db.prepare('SELECT payload FROM app_data LIMIT 1').get() as { payload: string } | undefined
if (!appDataRow) { console.error('app_data vazio'); process.exit(1) }

const payload = JSON.parse(appDataRow.payload) as {
  users?: OldUser[]
  clientesData?: OldCliente[]
  clientes?: OldCliente[]
  clientes_raw?: OldCliente[]
  state?: OldState
  parcelamentos?: OldParcelamento[]
  appSettings?: Record<string, unknown>
}

interface OldUser {
  id: number
  name: string
  login: string
  role: 'admin' | 'operador'
  color: string
}

interface OldCliente {
  cod?: string
  nome?: string
  name?: string
  cnpj?: string
  regime?: string
  atividade?: string
  responsavel?: string
  grupo?: string
  obs?: string
  prioridade?: number
  mit?: string
  municipio?: string
  uf?: string
  enviaIss?: boolean
  loginIss?: string
  senhaIss?: string
  emailEnvioIss?: string
  confereSiga?: boolean
  declaracaoAnual?: boolean
  tarefas?: string[]
}

interface OldState {
  [cnpj: string]: {
    [mesAno: string]: {
      tarefas?: Record<string, unknown>
      obs?: string
      mit?: string
    }
  }
}

interface OldParcelamento {
  id?: string
  secao?: string
  empresa?: string
  cnpj?: string
  regime?: string
  responsavel?: string
  local?: string
  tarefa?: string
  jan?: string; fev?: string; mar?: string; abr?: string; mai?: string; jun?: string
  jul?: string; ago?: string; set?: string; out?: string; nov?: string; dez?: string
  senhas?: string
}

const users    = payload.users ?? []
const clientes = payload.clientesData ?? payload.clientes ?? payload.clientes_raw ?? []
const state    = payload.state ?? {}
const parcs    = payload.parcelamentos ?? []

console.log(`Encontrado no payload:`)
console.log(` - ${users.length} usuários`)
console.log(` - ${clientes.length} clientes`)
console.log(` - ${Object.keys(state).length} entradas de state (tarefas)`)
console.log(` - ${parcs.length} parcelamentos\n`)

// ── 1. Clientes ────────────────────────────────────────────────────────────

async function migrarClientes() {
  if (!clientes.length) return {}

  const rows = clientes.map(c => ({
    cod:              c.cod ?? null,
    nome:             c.nome ?? c.name ?? '',
    cnpj:             c.cnpj ?? null,
    regime:           c.regime ?? null,
    atividade:        c.atividade ?? null,
    responsavel:      c.responsavel ?? null,
    grupo:            c.grupo ?? 'normal',
    obs:              c.obs ?? null,
    prioridade:       c.prioridade ?? 0,
    mit:              c.mit ?? null,
    municipio:        c.municipio ?? null,
    uf:               c.uf ?? null,
    envia_iss:        c.enviaIss ?? false,
    login_iss:        c.loginIss ?? null,
    senha_iss:        c.senhaIss ?? null,
    email_envio_iss:  c.emailEnvioIss ?? null,
    confere_siga:     c.confereSiga ?? false,
    declaracao_anual:       c.declaracaoAnual ?? false,
    tarefas_personalizadas: c.tarefas ?? [],
  })).filter(c => c.nome.trim())

  const ok = await upsertLotes('clientes', rows as Record<string, unknown>[], 'cnpj')
  console.log(`✓ ${ok}/${rows.length} clientes migrados`)

  // Busca UUIDs gerados
  const { data } = await supabase.from('clientes').select('id,cnpj')
  const mapa: Record<string, string> = {}
  for (const c of data ?? []) if (c.cnpj) mapa[c.cnpj] = c.id
  return mapa
}

// ── 2. Tarefas (state) ────────────────────────────────────────────────────

const TAREFAS: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}

function normalizarTarefa(tipo: string): string {
  const m: Record<string, string> = {
    'FECHADA': 'FECHAMENTO SIMPLES',
    'ENVIADA': 'GUIAS ENVIADAS',
    'ISSQN':   'ISS',
    'SPEEDGOV': 'SPEED GOV',
  }
  return m[tipo.toUpperCase()] ?? tipo.toUpperCase()
}

function isConcluida(val: unknown): boolean {
  if (!val) return false
  if (typeof val === 'string') return val.trim() !== ''
  if (typeof val === 'object' && val !== null) {
    const v = val as Record<string, boolean>
    return !!(v.recebido && v.importado && v.conferido)
  }
  return false
}

async function migrarTarefas(mapaCliente: Record<string, string>) {
  const rows: Record<string, unknown>[] = []

  for (const [cnpj, meses] of Object.entries(state)) {
    const clienteId = mapaCliente[cnpj]
    if (!clienteId) continue

    for (const [mesAno, dados] of Object.entries(meses)) {
      const [mesStr, anoStr] = mesAno.split('/')
      const mes = parseInt(mesStr)
      const ano = parseInt(anoStr)
      if (isNaN(mes) || isNaN(ano)) continue

      const tarefasState = dados.tarefas ?? {}
      for (const [tipoRaw, val] of Object.entries(tarefasState)) {
        const tipo = normalizarTarefa(tipoRaw)
        const concluida = isConcluida(val)
        rows.push({
          cliente_id:   clienteId,
          mes,
          ano,
          tipo,
          concluida,
          concluida_em: concluida ? new Date().toISOString() : null,
        })
      }

      // Atualiza obs e mit no cliente
      if (dados.obs || dados.mit) {
        const update: Record<string, string> = {}
        if (dados.obs) update.obs = dados.obs
        if (dados.mit) update.mit = dados.mit
        await supabase.from('clientes').update(update).eq('id', clienteId)
      }
    }
  }

  const ok = await upsertLotes('tarefas', rows, 'cliente_id,mes,ano,tipo')
  console.log(`✓ ${ok}/${rows.length} tarefas migradas`)
}

// ── 3. Parcelamentos ──────────────────────────────────────────────────────

async function migrarParcelamentos() {
  if (!parcs.length) return
  const rows = parcs.map(p => ({
    secao:       p.secao ?? '',
    empresa:     p.empresa ?? '',
    cnpj:        p.cnpj ?? null,
    regime:      p.regime ?? null,
    responsavel: p.responsavel ?? null,
    local_tipo:  p.local ?? null,
    tarefa:      p.tarefa ?? null,
    jan: p.jan ?? null, fev: p.fev ?? null, mar: p.mar ?? null,
    abr: p.abr ?? null, mai: p.mai ?? null, jun: p.jun ?? null,
    jul: p.jul ?? null, ago: p.ago ?? null, set: p.set ?? null,
    out: p.out ?? null, nov: p.nov ?? null, dez: p.dez ?? null,
    senhas: p.senhas ?? null,
  }))
  const ok = await upsertLotes('parcelamentos', rows as Record<string, unknown>[], 'id')
  console.log(`✓ ${ok}/${rows.length} parcelamentos migrados`)
}

// ── 4. Agenda ─────────────────────────────────────────────────────────────

async function migrarAgenda(mapaUsuario: Record<number, string>) {
  const agendaRows = db.prepare('SELECT * FROM agenda').all() as Record<string, unknown>[]
  if (!agendaRows.length) return

  const rows = agendaRows.map(r => {
    const uid = mapaUsuario[r.user_id as number]
    if (!uid) return null
    return {
      usuario_id:        uid,
      titulo:            r.titulo,
      descricao:         r.descricao ?? null,
      data_compromisso:  r.data_compromisso,
      hora_compromisso:  r.hora_compromisso ?? null,
      status:            r.status ?? 'pendente',
      lembrete_3_dias:   Boolean(r.lembrete_3_dias),
      created_at:        r.criado_em ?? new Date().toISOString(),
    }
  }).filter(Boolean) as Record<string, unknown>[]

  const ok = await upsertLotes('agenda', rows, 'id')
  console.log(`✓ ${ok}/${rows.length} agenda migrada`)
}

// ── 5. Client Files ────────────────────────────────────────────────────────

async function migrarClientFiles(mapaCliente: Record<string, string>) {
  const fileRows = db.prepare('SELECT * FROM client_files').all() as Record<string, unknown>[]
  if (!fileRows.length) return

  const rows = fileRows.map(r => {
    const clienteId = mapaCliente[r.client_id as string]
    if (!clienteId) return null

    // Converte Buffer → base64
    let base64 = ''
    const content = r.content as { type: string; data: number[] } | string | null
    if (content && typeof content === 'object' && content.type === 'Buffer') {
      base64 = Buffer.from(content.data).toString('base64')
    } else if (typeof content === 'string') {
      base64 = content
    }

    return {
      cliente_id:     clienteId,
      name:           r.name,
      size:           r.size ?? 0,
      content_base64: base64,
      uploaded_at:    r.uploaded_at ?? new Date().toISOString(),
    }
  }).filter(Boolean) as Record<string, unknown>[]

  const ok = await upsertLotes('client_files', rows, 'id')
  console.log(`✓ ${ok}/${rows.length} arquivos DTE migrados`)
}

// ── 6. Deletion Logs ──────────────────────────────────────────────────────

async function migrarDeletionLogs() {
  const rows = db.prepare('SELECT * FROM deletion_logs').all() as Record<string, unknown>[]
  if (!rows.length) return

  const mapped = rows.map(r => ({
    usuario_nome: String(r.deleted_by ?? ''),
    tipo:         String(r.entity_type ?? ''),
    nome:         String(r.entity_name ?? ''),
    detalhes:     r.details ? String(r.details) : null,
    created_at:   r.deleted_at ?? new Date().toISOString(),
  }))

  const ok = await upsertLotes('deletion_log', mapped as Record<string, unknown>[], 'id')
  console.log(`✓ ${ok}/${mapped.length} logs de exclusão migrados`)
}

// ── 7. Task Unlock Log ────────────────────────────────────────────────────

async function migrarTaskUnlockLog() {
  const rows = db.prepare('SELECT * FROM task_unlock_log').all() as Record<string, unknown>[]
  if (!rows.length) return

  const mapped = rows.map(r => ({
    usuario_nome: String(r.usuario ?? ''),
    cliente_nome: String(r.empresa ?? ''),
    tarefa:       String(r.tarefa ?? ''),
    competencia:  String(r.mes ?? ''),
    valor_antigo: r.info_antiga ? String(r.info_antiga) : null,
    valor_novo:   r.info_atual ? String(r.info_atual) : null,
    motivo:       String(r.motivo ?? ''),
    created_at:   r.timestamp ? new Date(String(r.timestamp)).toISOString() : new Date().toISOString(),
  }))

  const ok = await upsertLotes('task_unlock_log', mapped as Record<string, unknown>[], 'id')
  console.log(`✓ ${ok}/${mapped.length} logs de tarefas migrados`)
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Busca UUIDs dos usuários do Supabase para mapear por nome
  const { data: perfis } = await supabase.from('profiles').select('id,nome')
  const mapaUsuario: Record<number, string> = {}
  for (const u of users) {
    const perfil = perfis?.find(p =>
      p.nome.toLowerCase().trim() === u.name.toLowerCase().trim()
    )
    if (perfil) mapaUsuario[u.id] = perfil.id
    else console.warn(`  ⚠ Usuário "${u.name}" (id=${u.id}) sem perfil no Supabase`)
  }
  console.log(`Mapeados ${Object.keys(mapaUsuario).length}/${users.length} usuários\n`)

  const mapaCliente = await migrarClientes()
  await migrarTarefas(mapaCliente)
  await migrarParcelamentos()
  await migrarAgenda(mapaUsuario)
  await migrarClientFiles(mapaCliente)
  await migrarDeletionLogs()
  await migrarTaskUnlockLog()

  console.log('\n✓ Migração completa!')
  db.close()
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1) })
