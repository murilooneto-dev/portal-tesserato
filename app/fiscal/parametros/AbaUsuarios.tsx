'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { SETORES, SETOR_LABEL } from '@/lib/types'
import {
  Avatar, Badge, Button, Card, EmptyState, Field, Input, Select, Tabela, Td, Th, useConfirmar, useToast,
} from '@/components/ui'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import { deletarUsuario } from './actions'
import UsuarioDrawer, { PERFIL_LABEL } from './UsuarioDrawer'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function AbaUsuarios({ profiles, currentUserId }: { profiles: Profile[]; currentUserId: string }) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const toast = useToast()

  // Filtros só na tela (não vão ao servidor).
  const [busca, setBusca] = useState('')
  const [perfil, setPerfil] = useState('')
  const [setor, setSetor] = useState('')

  // Gaveta: 'novo', o id do usuário em edição ou fechada (null).
  const [gaveta, setGaveta] = useState<string | null>(null)
  const emEdicao = gaveta && gaveta !== 'novo' ? profiles.find(p => p.id === gaveta) ?? null : null

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    return profiles.filter(p =>
      (!termo || semAcento(p.nome).includes(termo)) &&
      (!perfil || p.role === perfil) &&
      (!setor || p.setores.some(s => s === setor)),
    )
  }, [profiles, busca, perfil, setor])

  async function excluir(p: Profile) {
    const ok = await confirmar({
      titulo: `Excluir o usuário "${p.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const result = await deletarUsuario(p.id)
    if (result.error) {
      toast(result.error, 'dng')
      return
    }
    setGaveta(null)
    toast('Usuário excluído')
    router.refresh()
  }

  function aoSalvar(mensagem: string) {
    // Depois de criar, limpa os filtros para o usuário novo aparecer na lista.
    if (gaveta === 'novo') { setBusca(''); setPerfil(''); setSetor('') }
    setGaveta(null)
    toast(mensagem)
    router.refresh()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[280px]">
          {c => (
            <Input
              id={c.id}
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome"
              iconeEsquerda={<Search size={16} />}
            />
          )}
        </Field>
        <Field rotulo="Perfil" className="w-full sm:w-[150px]">
          {c => (
            <Select id={c.id} value={perfil} onChange={e => setPerfil(e.target.value)}>
              <option value="">Todos</option>
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
            </Select>
          )}
        </Field>
        <Field rotulo="Setor" className="w-full sm:w-[170px]">
          {c => (
            <Select id={c.id} value={setor} onChange={e => setSetor(e.target.value)}>
              <option value="">Todos</option>
              {SETORES.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        <Button
          variante="primario"
          icone={<Plus size={16} aria-hidden="true" />}
          onClick={() => setGaveta('novo')}
          className="max-sm:h-11 max-sm:w-full sm:ml-auto"
        >
          Novo usuário
        </Button>
      </div>

      {/* A partir de 1280 px a tabela cabe inteira e o cartão deixa o menu ⋯ das últimas linhas aparecer por cima da borda. */}
      <Card semPadding className="overflow-hidden">
        {visiveis.length === 0 ? (
          <EmptyState
            icone={<Users size={24} />}
            titulo="Nenhum usuário encontrado."
            descricao={profiles.length > 0 ? 'Mude a busca ou os filtros para ver outros usuários.' : undefined}
          />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[760px]">
              <thead>
                <tr>
                  <Th largura={280}>Usuário</Th>
                  <Th>Setores</Th>
                  <Th largura={160}>Perfil</Th>
                  <Th largura={56}><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(p => (
                  <tr key={p.id}>
                    <Td>
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar nome={p.nome} cor={p.cor} />
                        <span className="truncate text-fg-2" title={p.nome}>{p.nome}</span>
                      </span>
                    </Td>
                    <Td className="break-words text-fg-2">{p.setores.map(s => SETOR_LABEL[s]).join(', ')}</Td>
                    <Td><Badge tom={p.role === 'admin' ? 'acc' : 'neu'}>{PERFIL_LABEL[p.role] ?? p.role}</Badge></Td>
                    <Td alinhar="dir" className="px-2">
                      <MenuMaisAcoes
                        rotulo={p.id === currentUserId ? `Editar ${p.nome}` : `Editar ou excluir ${p.nome}`}
                        itens={[
                          { rotulo: 'Editar', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => setGaveta(p.id) },
                          // Ninguém exclui o próprio usuário.
                          ...(p.id !== currentUserId
                            ? [{ rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => { void excluir(p) } }]
                            : []),
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      {(gaveta === 'novo' || emEdicao) && (
        <UsuarioDrawer
          key={gaveta}
          perfil={emEdicao}
          currentUserId={currentUserId}
          onFechar={() => setGaveta(null)}
          onSalvo={aoSalvar}
          onExcluir={p => { void excluir(p) }}
        />
      )}
    </div>
  )
}
