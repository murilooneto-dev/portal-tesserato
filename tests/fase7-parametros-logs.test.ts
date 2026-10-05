// tests/fase7-parametros-logs.test.ts — Parâmetros (abas, gaveta de usuário), Logs do sistema e remoção da Manutenção de dados (Fase 7, Frente C).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')
const tem = (src: string, trechos: string[]) => { for (const t of trechos) assert.ok(src.includes(t), t) }

const PASTA = 'app/fiscal/parametros'
const CLIENT = `${PASTA}/ParametrosClient.tsx`
const ABA_EMAILS = `${PASTA}/AbaComunicadoEmails.tsx`
const ABA_USUARIOS = `${PASTA}/AbaUsuarios.tsx`
const GAVETA = `${PASTA}/UsuarioDrawer.tsx`
const PAGE = `${PASTA}/page.tsx`
const ACTIONS = `${PASTA}/actions.ts`
const LOGS = `${PASTA}/logs/LogsEventosClient.tsx`
const LOGS_PAGE = `${PASTA}/logs/page.tsx`
const TELAS = [CLIENT, ABA_EMAILS, ABA_USUARIOS, GAVETA, LOGS]

for (const arq of TELAS) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert, sem overlay próprio`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⚠×✕🔒]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('fixed inset-0'))
  })
}

test('Manutenção de dados e DevLock saíram; o que devia ficar, ficou', () => {
  assert.equal(existsSync(join(process.cwd(), 'components/fiscal/DevLock.tsx')), false)
  const actions = ler(ACTIONS)
  for (const t of ['analisarParcelamentosDuplicados', 'limparParcelamentosDuplicados', 'GrupoParcelamentoDuplicado',
    'CAMPOS_MESCLAVEIS_PARCELAMENTO', 'chaveParcelamento', 'verificarSenhaDev', 'createClienteDescartavel', 'DEV_MASTER_EMAIL']) {
    assert.ok(!actions.includes(t), t)
  }
  tem(actions, ['export async function salvarComunicado(formData: FormData)', 'export async function atualizarPerfil(id: string, formData: FormData)',
    'export async function criarUsuario(payload: {', 'export async function deletarUsuario(id: string)',
    'export async function salvarConfiguracoes(settings: Record<string, unknown>)'])
  // As cinco actions seguem checando o papel de admin.
  assert.equal(actions.split("callerProfile?.role !== 'admin'").length - 1, 5)
  for (const arq of TELAS) {
    const src = ler(arq)
    for (const t of ['DevLock', 'Manutenção de Dados', 'ParcelamentosDuplicados', 'verificarSenhaDev']) assert.ok(!src.includes(t), `${arq}: ${t}`)
  }
  const senha = ler('lib/verificar-senha.ts')
  assert.ok(senha.includes('export async function verificarSenhaUsuarioAtual(senha: string)'))
  assert.ok(!senha.includes('verificarSenhaDev'))
  assert.equal(existsSync(join(process.cwd(), 'scripts/limpar-duplicatas-parcelamento.ts')), true)
})

test('Parâmetros: cabeçalho a-06, um só link de logs e duas abas', () => {
  const src = ler(CLIENT)
  tem(src, ['<Pagina>', 'titulo="Parâmetros"', 'subtitulo="Configurações gerais do portal, só para administradores"',
    'href="/fiscal/parametros/logs"', 'Logs do sistema', "rotulo: 'Comunicado e e-mails'", "rotulo: 'Usuários'", '<Abas',
    '<AbaComunicadoEmails dashboardAnnouncement={dashboardAnnouncement} emailSettings={emailSettings} />',
    '<AbaUsuarios profiles={profiles} currentUserId={currentUserId} />'])
  for (const t of ['Log de Eventos', 'Log de Tarefas', 'taskLogs', 'logModal']) assert.ok(!src.includes(t), t)
  const page = ler(PAGE)
  assert.ok(!page.includes('taskLogs'))
  assert.ok(!page.includes('task_unlock_log'))
  tem(page, ["if (profile?.role !== 'admin') redirect('/intranet')", "'email_ativo','gmail_remetente','gmail_senha','email_destinatario','usar_senha_app'"])
})

test('aba Comunicado e e-mails: desenho a-06', () => {
  const src = ler(ABA_EMAILS)
  tem(src, ['lg:grid-cols-[380px_minmax(0,1fr)]', 'titulo="Comunicado no Início"', 'rotulo="Mensagem para todos os usuários"',
    'ajuda="Aparece no topo da página Início. Deixe em branco para esconder."', 'min-h-[140px]', 'Salvar comunicado', "toast('Salvo')",
    'titulo="Relatórios automáticos por e-mail"', 'rotulo="Envio ligado"', 'rotulo="Gmail remetente"', 'placeholder="email@gmail.com"',
    'rotulo="Senha de app do Gmail"', 'ajuda="Recomendado para contas com verificação em duas etapas"', "'Esconder senha' : 'Mostrar senha'",
    'rotulo="E-mail destinatário"', 'placeholder="destino@email.com"', "label: 'Rotina 1'", "label: 'Rotina 2'", 'rotulo="Ativa"',
    'rotulo="Dia do mês"', 'min={1} max={31}', 'placeholder="Ex.: 5"', 'rotulo="Horário"', 'type="time"',
    'rounded-[10px] border border-line-soft bg-page px-4 py-3.5', 'border-t border-line-soft', 'Enviar relatórios agora', 'Salvar configuração'])
  // Um único botão primário na aba.
  assert.equal(src.split('variante="primario"').length - 1, 1)
  // usar_senha_app não tem controle na tela.
  assert.ok(!src.includes('setUsarSenhaApp'))
  assert.ok(!src.includes('type="checkbox"'))
})

test('aba Comunicado e e-mails: actions com os mesmos argumentos', () => {
  const src = ler(ABA_EMAILS)
  tem(src, ["fd.set('dashboard_announcement', announcement)", 'await salvarComunicado(fd)',
    "await fetch('/api/relatorios/fiscal', { method: 'POST' })",
    "`${data.enviados} relatório(s) enviado(s): ${data.responsaveis.join(', ')}`", "`Erro: ${data.error ?? 'falha ao enviar'}`",
    "const usarSenhaApp = emailSettings.usar_senha_app === 'true'"])
  assert.ok(src.includes([
    'await salvarConfiguracoes({',
    '      email_ativo: String(emailAtivo),',
    '      gmail_remetente: gmailRemetente,',
    '      gmail_senha: gmailSenha,',
    '      email_destinatario: emailDest,',
    '      usar_senha_app: String(usarSenhaApp),',
    '      rotina1_ativo: String(rotina1Ativo),',
    '      rotina1_dia: rotina1Dia,',
    '      rotina1_hora: rotina1Hora,',
    '      rotina2_ativo: String(rotina2Ativo),',
    '      rotina2_dia: rotina2Dia,',
    '      rotina2_hora: rotina2Hora,',
    '    })',
  ].join('\n')))
})

test('aba Usuários: filtros, tabela a-07 e exclusão', () => {
  const src = ler(ABA_USUARIOS)
  tem(src, ['rotulo="Buscar" className="w-full sm:w-[280px]"', 'placeholder="Nome"', 'rotulo="Perfil" className="w-full sm:w-[150px]"',
    '<option value="admin">Administrador</option>', '<option value="operador">Operador</option>',
    'rotulo="Setor" className="w-full sm:w-[170px]"', 'Novo usuário', '<Th largura={280}>Usuário</Th>', '<Th>Setores</Th>',
    '<Th largura={160}>Perfil</Th>', '<Th largura={56}>', '<Avatar nome={p.nome} cor={p.cor} />',
    "p.setores.map(s => SETOR_LABEL[s]).join(', ')", "tom={p.role === 'admin' ? 'acc' : 'neu'}", '`Editar ou excluir ${p.nome}`',
    '<EmptyState', 'relative overflow-x-auto xl:overflow-visible',
    // Excluir: confirmação e avisos do portal, mesma action e mesmo argumento.
    'titulo: `Excluir o usuário "${p.nome}"?`', "descricao: 'Essa ação não pode ser desfeita.'", 'perigo: true',
    'await deletarUsuario(p.id)', "toast(result.error, 'dng')", 'router.refresh()',
    // Ninguém exclui o próprio usuário.
    'p.id !== currentUserId'])
  assert.match(src, /<Card semPadding className="overflow-hidden[^"]*">/)
})

test('gaveta de usuário: campos na ordem e regras preservadas', () => {
  const src = ler(GAVETA)
  tem(src, ['<Drawer', "titulo={novo ? 'Novo usuário' : 'Editar usuário'}", "admin: 'Administrador', operador: 'Operador'",
    "'#16A34A'", "'#6366F1'", "'#D9772B'", "'#C2417E'", "'#0E9F8A'", "'#9D5CE0'", "nome: 'Cor atual'", 'role="radiogroup"', 'h-7 w-7',
    '<Chip key={setor} ativo={setores.includes(setor)}', 'grid grid-cols-2 gap-2.5',
    "PAGINAS_POR_SETOR[setor].filter(p => p.slug !== 'dashboard')", '`Páginas liberadas no ${SETOR_LABEL[setor]}`',
    'Sem a página marcada, ela some do menu e o acesso é bloqueado.', 'Excluir usuário', 'perfil.id !== currentUserId',
    '>Cancelar<', '>Salvar usuário<',
    // Usuário novo: Fiscal com todas as páginas menos o dashboard.
    "useState<UserSetor[]>(perfil ? perfil.setores : ['fiscal'])",
    "PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`)",
    // Tirar o setor leva as páginas dele.
    'if (removendo) setPaginas(p => p.filter(chave => !chave.startsWith(`${setor}:`)))',
    "setErro('Preencha nome, login e senha.')"])
  const ordem = ['rotulo="Nome"', 'rotulo="Login (e-mail)"', 'rotulo="Senha"', 'rotulo="Perfil"', 'rotulo="Cor de identificação"',
    'rotulo="Setores com acesso"', 'Páginas liberadas no'].map(t => src.lastIndexOf(t))
  assert.ok(ordem.every(i => i >= 0))
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem)
})

test('gaveta: Login e Senha só em usuário novo; edição não troca e-mail nem senha', () => {
  const src = ler(GAVETA)
  // Os dois campos ficam dentro do bloco {novo && (...)}.
  const inicio = src.indexOf('{novo && (')
  const fim = src.indexOf('<Grupo rotulo="Perfil">')
  assert.ok(inicio > 0 && fim > inicio)
  for (const t of ['rotulo="Login (e-mail)"', 'rotulo="Senha"']) {
    const pos = src.indexOf(t)
    assert.ok(pos > inicio && pos < fim, t)
    assert.equal(src.split(t).length - 1, 1, t)
  }
  assert.ok(!src.includes('Nova senha'))
  for (const arq of [GAVETA, ABA_USUARIOS, CLIENT]) assert.ok(!ler(arq).includes('auth.admin'), arq)
  // Em actions.ts o auth.admin continua só onde já estava: criar e excluir usuário.
  const actions = ler(ACTIONS)
  assert.deepEqual(actions.match(/auth\.admin\.\w+/g), ['auth.admin.createUser', 'auth.admin.deleteUser', 'auth.admin.getUserById', 'auth.admin.deleteUser'])
  const atualizar = actions.slice(actions.indexOf('export async function atualizarPerfil'), actions.indexOf('export async function criarUsuario'))
  assert.ok(!atualizar.includes('auth.admin'))
  assert.ok(!atualizar.includes('email'))
  assert.ok(!atualizar.includes('password'))
})

test('gaveta: actions com os mesmos argumentos', () => {
  const src = ler(GAVETA)
  assert.ok(src.includes([
    'await criarUsuario({',
    '          nome: nome.trim(),',
    '          login: login.trim(),',
    '          senha,',
    '          role,',
    '          cor,',
    '          paginasAcesso: paginas,',
    '          setores,',
    '        })',
  ].join('\n')))
  tem(src, ["fd.set('nome', nome)", "fd.set('role', role)", "fd.set('cor', cor)", "for (const s of setores) fd.append('setores', s)",
    "for (const c of paginas) fd.append('paginas_acesso', c)", 'await atualizarPerfil(perfil.id, fd)'])
  // Só os cinco campos de sempre vão no FormData.
  assert.equal((src.match(/fd\.(set|append)\(/g) ?? []).length, 5)
})

test('Logs do sistema: cabeçalho a-09 e duas abas guardadas na URL', () => {
  const src = ler(LOGS)
  tem(src, ["{ rotulo: 'Parâmetros', href: '/fiscal/parametros' }, { rotulo: 'Logs do sistema' }", 'titulo="Logs do sistema"',
    'subtitulo="Histórico de alterações feitas por todos os usuários"', 'Gerar relatório', 'window.print()',
    "{ id: 'eventos', rotulo: 'Eventos de clientes', conteudo: eventos }", "{ id: 'tarefas', rotulo: 'Alterações de tarefas', conteudo: tarefas }",
    'ativa={aba}', 'onTrocar={trocarAba}', "params.set('aba', 'tarefas')", 'window.history.replaceState'])
  const page = ler(LOGS_PAGE)
  tem(page, ["title: 'Logs do sistema — Tesserato'", "abaInicial={aba === 'tarefas' ? 'tarefas' : 'eventos'}",
    "if (profile?.role !== 'admin') redirect('/intranet')"])
})

test('Logs, aba Eventos de clientes: filtros, colunas e cores dos selos', () => {
  const src = ler(LOGS)
  tem(src, ['rotulo="Tipo de evento" className="w-full sm:w-[190px]"', 'rotulo="Setor" className="w-full sm:w-[140px]"',
    'rotulo="Cliente" className="w-full sm:w-[220px]"', 'rotulo="Item" className="w-full sm:w-[200px]"',
    'rotulo="De" className="w-full sm:w-[150px]"', 'rotulo="Até" className="w-full sm:w-[150px]"',
    '<Button type="submit" variante="primario">Aplicar</Button>', '<Button variante="fantasma" onClick={limpar}>Limpar</Button>',
    '<Th largura={170}>Data e hora</Th>', '<Th largura={160}>Usuário</Th>', '<Th largura={110}>Setor</Th>', '<Th>Cliente</Th>',
    '<Th largura={200}>Item</Th>', '<Th largura={200}>Evento</Th>', '<Th largura={220}>Detalhes</Th>',
    "log.setor ? (SETOR_LABEL[log.setor] ?? log.setor) : 'Geral'", '{itemTexto(log)}', '{detalheTexto(log)}',
    "exclusao: 'dng'", "troca_responsavel: 'warn'", "criacao: 'ok'", "edicao: 'info'", "desabilitacao: 'warn'", "reabilitacao: 'ok'", "tarefas: 'neu'",
    // Impressão: título, filtros aplicados e data de geração.
    'Relatório de Log de Eventos', 'Filtros: {filtrosAplicados}', 'Gerado em', 'print:hidden',
    // Filtros continuam indo para a URL com os mesmos nomes.
    "params.set('tipo', form.tipo)", "params.set('setor', form.setor)", "params.set('clienteId', form.clienteId)",
    "params.set('item', form.item)", "params.set('de', form.de)", "params.set('ate', form.ate)"])
  const page = ler(LOGS_PAGE)
  tem(page, ["supabase.from('evento_log').select('*').order('created_at', { ascending: false }).limit(1000)",
    "query.eq('tipo_evento', tipo)", "query.is('setor', null)", "query.eq('cliente_id', clienteId)", "query.eq('detalhes->>entidade', item)",
    "supabase.from('profiles').select('id, cor')"])
})

test('Logs, aba Alterações de tarefas: consulta veio para cá, sem filtros', () => {
  const page = ler(LOGS_PAGE)
  assert.ok(page.includes("supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50)"))
  const src = ler(LOGS)
  const aba = src.slice(src.indexOf('const tarefas = ('), src.indexOf('return (\n    <Pagina'))
  const colunas = ['Data e hora', 'Usuário', 'Cliente', 'Tarefa', 'Competência', 'Antes', 'Depois', 'Motivo']
  const posicoes = colunas.map(c => aba.indexOf(`>${c}</Th>`))
  assert.ok(posicoes.every(i => i >= 0), colunas.join(', '))
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes)
  tem(aba, ['titulo="Nenhum registro"', 'log.tarefa', 'log.competencia', 'log.valor_antigo', 'log.valor_novo', 'log.motivo'])
  assert.ok(!aba.includes('<Select'))
  assert.ok(!aba.includes('<Input'))
})
