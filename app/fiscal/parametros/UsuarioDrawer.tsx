'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { Profile, UserSetor } from '@/lib/types'
import { SETORES, SETOR_LABEL } from '@/lib/types'
import { PAGINAS_POR_SETOR } from '@/lib/paginas-setor'
import { Aviso, Button, Checkbox, Chip, Drawer, Field, Input, Segmentado, cn } from '@/components/ui'
import { atualizarPerfil, criarUsuario } from './actions'

export const PERFIL_LABEL: Record<Profile['role'], string> = { admin: 'Administrador', operador: 'Operador' }

const CORES = [
  { valor: '#16A34A', nome: 'Verde' },
  { valor: '#6366F1', nome: 'Índigo' },
  { valor: '#D9772B', nome: 'Laranja' },
  { valor: '#C2417E', nome: 'Rosa' },
  { valor: '#0E9F8A', nome: 'Turquesa' },
  { valor: '#9D5CE0', nome: 'Roxo' },
]

const COR_PADRAO = '#6366f1'
const mesmaCor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Usuário novo começa no Fiscal, com todas as páginas do setor liberadas.
const paginasIniciais = () => PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`)

// Rótulo + conteúdo para grupos de controles (botões, chips, caixas), que
// não têm um campo único para o <label> do Field apontar.
function Grupo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: (idRotulo: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={id} className="text-[13px] font-medium text-fg-2">{rotulo}</span>
      {children(id)}
      {ajuda && <p className="text-xs text-fg-3">{ajuda}</p>}
    </div>
  )
}

interface Props {
  // null = usuário novo
  perfil: Profile | null
  currentUserId: string
  onFechar: () => void
  onSalvo: (mensagem: string) => void
  onExcluir: (perfil: Profile) => void
}

// Gaveta de cadastro e edição de usuário. Na edição não há Login nem Senha:
// trocar e-mail ou senha de outra pessoa não é função do portal. Monte com
// `key` por usuário para o formulário começar limpo a cada abertura.
export default function UsuarioDrawer({ perfil, currentUserId, onFechar, onSalvo, onExcluir }: Props) {
  const novo = perfil === null
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<Profile['role']>(perfil?.role ?? 'operador')
  const [cor, setCor] = useState(perfil?.cor || COR_PADRAO)
  const [setores, setSetores] = useState<UserSetor[]>(perfil ? perfil.setores : ['fiscal'])
  const [paginas, setPaginas] = useState<string[]>(perfil ? (perfil.paginas_acesso ?? []) : paginasIniciais())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // A cor que o usuário já tem entra como 7ª bolinha quando não é da paleta.
  const corOriginal = perfil?.cor || COR_PADRAO
  const cores = CORES.some(c => mesmaCor(c.valor, corOriginal)) ? CORES : [...CORES, { valor: corOriginal, nome: 'Cor atual' }]

  function toggleSetor(setor: UserSetor) {
    const removendo = setores.includes(setor)
    // Tirar o setor leva junto as páginas liberadas dele.
    if (removendo) setPaginas(p => p.filter(chave => !chave.startsWith(`${setor}:`)))
    setSetores(removendo ? setores.filter(s => s !== setor) : [...setores, setor])
  }

  function togglePagina(chave: string) {
    setPaginas(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])
  }

  function tecladoCores(e: KeyboardEvent<HTMLDivElement>) {
    const proxima = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    if (!proxima && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const atual = cores.findIndex(c => mesmaCor(c.valor, cor))
    const indice = (atual + (proxima ? 1 : -1) + cores.length) % cores.length
    setCor(cores[indice].valor)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[indice]?.focus()
  }

  async function salvar() {
    setErro('')
    if (!perfil) {
      if (!nome.trim() || !login.trim() || !senha.trim()) {
        setErro('Preencha nome, login e senha.')
        return
      }
      setSalvando(true)
      let result: Awaited<ReturnType<typeof criarUsuario>>
      try {
        result = await criarUsuario({
          nome: nome.trim(),
          login: login.trim(),
          senha,
          role,
          cor,
          paginasAcesso: paginas,
          setores,
        })
      } catch {
        setSalvando(false)
        setErro('Não foi possível criar o usuário.')
        return
      }
      setSalvando(false)
      if (result.error) { setErro(result.error); return }
      onSalvo('Usuário criado')
      return
    }

    if (!nome.trim()) {
      setErro('Preencha o nome.')
      return
    }
    setSalvando(true)
    const fd = new FormData()
    fd.set('nome', nome)
    fd.set('role', role)
    fd.set('cor', cor)
    for (const s of setores) fd.append('setores', s)
    for (const c of paginas) fd.append('paginas_acesso', c)
    try {
      await atualizarPerfil(perfil.id, fd)
    } catch {
      setSalvando(false)
      setErro('Não foi possível salvar o usuário.')
      return
    }
    setSalvando(false)
    onSalvo('Usuário salvo')
  }

  const subtitulo = `${setores.length > 0 ? setores.map(s => SETOR_LABEL[s]).join(', ') : 'Sem setor'} · ${PERFIL_LABEL[role]}`
  const setoresComPaginas = SETORES.filter(s => setores.includes(s) && PAGINAS_POR_SETOR[s].length > 0)

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={novo ? 'Novo usuário' : 'Editar usuário'}
      subtitulo={subtitulo}
      bloqueado={salvando}
      rodape={
        <>
          {perfil && perfil.id !== currentUserId && (
            <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => onExcluir(perfil)} disabled={salvando}>
              Excluir usuário
            </Button>
          )}
          <div className="ml-auto flex gap-2.5">
            <Button variante="fantasma" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" onClick={salvar} carregando={salvando}>Salvar usuário</Button>
          </div>
        </>
      }
    >
      <Field rotulo="Nome" obrigatorio>
        {c => <Input id={c.id} value={nome} onChange={e => setNome(e.target.value)} autoComplete="off" data-autofocus="" />}
      </Field>

      {novo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field rotulo="Login (e-mail)" obrigatorio>
            {c => <Input id={c.id} type="email" value={login} onChange={e => setLogin(e.target.value)} placeholder="usuario@email.com" autoComplete="off" />}
          </Field>
          <Field rotulo="Senha" obrigatorio>
            {c => <Input id={c.id} type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />}
          </Field>
        </div>
      )}

      <Grupo rotulo="Perfil">
        {() => (
          <Segmentado<Profile['role']>
            rotulo="Perfil"
            className="self-start"
            opcoes={[{ valor: 'operador', rotulo: 'Operador' }, { valor: 'admin', rotulo: 'Administrador' }]}
            valor={role}
            onMudar={setRole}
          />
        )}
      </Grupo>

      <Grupo rotulo="Cor de identificação">
        {idRotulo => (
          <div role="radiogroup" aria-labelledby={idRotulo} onKeyDown={tecladoCores} className="flex flex-wrap gap-2.5 p-1">
            {cores.map((c, i) => {
              const escolhida = mesmaCor(c.valor, cor)
              const algumaEscolhida = cores.some(x => mesmaCor(x.valor, cor))
              return (
                <button
                  key={c.valor}
                  type="button"
                  role="radio"
                  aria-checked={escolhida}
                  aria-label={c.nome}
                  title={c.nome}
                  tabIndex={escolhida || (!algumaEscolhida && i === 0) ? 0 : -1}
                  onClick={() => setCor(c.valor)}
                  style={{ backgroundColor: c.valor }}
                  className={cn(
                    'h-7 w-7 flex-none rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    escolhida && 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--fg)]',
                  )}
                />
              )
            })}
          </div>
        )}
      </Grupo>

      <Grupo rotulo="Setores com acesso">
        {idRotulo => (
          <div role="group" aria-labelledby={idRotulo} className="flex flex-wrap gap-2">
            {SETORES.map(setor => (
              <Chip key={setor} ativo={setores.includes(setor)} onClick={() => toggleSetor(setor)}>{SETOR_LABEL[setor]}</Chip>
            ))}
          </div>
        )}
      </Grupo>

      {setoresComPaginas.map((setor, i) => (
        <Grupo
          key={setor}
          rotulo={setor === 'configuracoes' ? 'Páginas liberadas em Configurações' : `Páginas liberadas no ${SETOR_LABEL[setor]}`}
          ajuda={i === setoresComPaginas.length - 1 ? 'Sem a página marcada, ela some do menu e o acesso é bloqueado.' : undefined}
        >
          {idRotulo => (
            <div role="group" aria-labelledby={idRotulo} className="grid grid-cols-2 gap-2.5">
              {PAGINAS_POR_SETOR[setor].filter(p => p.slug !== 'dashboard').map(p => {
                const chave = `${setor}:${p.slug}`
                return <Checkbox key={chave} rotulo={p.label} checked={paginas.includes(chave)} onChange={() => togglePagina(chave)} />
              })}
            </div>
          )}
        </Grupo>
      ))}

      <div role="alert">{erro && <Aviso tom="dng">{erro}</Aviso>}</div>
    </Drawer>
  )
}
