'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LinkRapido } from '@/lib/types'
import { criarLink, atualizarLink, excluirLink } from '@/app/(comum)/intranet/actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  dominioDoLink, hrefDoLink, inicialDoLink, linksAlterados, linksAtivos, temErro, validarLink,
  type EdicaoLink, type ErrosLink,
} from '@/lib/links-uteis'

const contar = (n: number) => (n === 1 ? '1 link' : `${n} links`)
const semChave = <T,>(o: Record<string, T>, chave: string): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([k]) => k !== chave))

export default function LinksUteis({ links, isAdmin }: { links: LinkRapido[]; isAdmin: boolean }) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [ocupado, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const [edicoes, setEdicoes] = useState<Record<string, EdicaoLink>>({})
  const [erros, setErros] = useState<Record<string, ErrosLink>>({})
  const [novo, setNovo] = useState<EdicaoLink>({ titulo: '', url: '' })
  const [erroNovo, setErroNovo] = useState<ErrosLink>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const ativos = linksAtivos(links)
  const pendentes = linksAlterados(ativos, edicoes)
  const valor = (l: LinkRapido): EdicaoLink => edicoes[l.id] ?? { titulo: l.titulo, url: l.url }

  function editar(l: LinkRapido, campo: keyof EdicaoLink, v: string) {
    setEdicoes(p => ({ ...p, [l.id]: { ...valor(l), [campo]: v } }))
    setErros(p => semChave(p, l.id))
    setErroGeral(null)
  }

  const temNovoPreenchido = novo.titulo.trim() !== '' || novo.url.trim() !== ''

  // Sair da edição sem salvar: se o cartão de link novo tem texto, pede confirmação antes de apagar.
  async function descartar() {
    if (temNovoPreenchido) {
      const ok = await confirmar({ titulo: 'Descartar o link novo?', descricao: 'O que você digitou no link novo será apagado.', textoConfirmar: 'Descartar', perigo: true })
      if (!ok) return
    }
    sairDaEdicao()
  }

  function sairDaEdicao() {
    setEditando(false)
    setEdicoes({})
    setErros({})
    setNovo({ titulo: '', url: '' })
    setErroNovo({})
    setErroGeral(null)
  }

  function concluir() {
    const novosErros: Record<string, ErrosLink> = {}
    for (const p of pendentes) {
      const e = validarLink(p.titulo, p.url)
      if (temErro(e)) novosErros[p.id] = e
    }
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return
    if (pendentes.length === 0) { void descartar(); return }
    setErroGeral(null)
    iniciar(async () => {
      const falhas: string[] = []
      for (const p of pendentes) {
        const r = await atualizarLink(p.id, p.titulo, p.url)
        if (r.error) falhas.push(p.id)
      }
      router.refresh()
      if (falhas.length > 0) {
        setEdicoes(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => falhas.includes(id))))
        setErros(Object.fromEntries(falhas.map(id => [id, { url: 'Não foi possível salvar.' }])))
        setErroGeral(`Não foi possível salvar ${contar(falhas.length)}. Tente de novo.`)
        return
      }
      avisar(pendentes.length === 1 ? 'Link salvo.' : `${pendentes.length} links salvos.`, 'ok')
      setEdicoes({})
      setErros({})
      setErroGeral(null)
      void descartar()
    })
  }

  async function excluir(l: LinkRapido) {
    const ok = await confirmar({ titulo: 'Excluir link?', descricao: `"${l.titulo}" sai dos links úteis de todos.`, textoConfirmar: 'Excluir', perigo: true })
    if (!ok) return
    iniciar(async () => {
      await excluirLink(l.id)
      setEdicoes(p => semChave(p, l.id))
      avisar('Link excluído.', 'ok')
      router.refresh()
    })
  }

  function adicionar() {
    const e = validarLink(novo.titulo, novo.url)
    setErroNovo(e)
    if (temErro(e)) return
    iniciar(async () => {
      const r = await criarLink(novo.titulo.trim(), novo.url.trim())
      if (r.error) { setErroGeral(r.error); return }
      setNovo({ titulo: '', url: '' })
      avisar('Link adicionado.', 'ok')
      router.refresh()
    })
  }

  const acoes = !isAdmin ? undefined : editando ? (
    <>
      {pendentes.length > 0 && <Button variante="fantasma" tamanho="p" onClick={descartar} disabled={ocupado}>Descartar</Button>}
      <Button tamanho="p" icone={<Check size={14} aria-hidden="true" />} onClick={concluir} carregando={ocupado}>Concluir edição</Button>
    </>
  ) : (
    <Button variante="fantasma" tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditando(true)}>Editar links</Button>
  )

  return (
    <Card titulo="Links úteis" meta={<Badge>{ativos.length}</Badge>} acoes={acoes} semPadding>
      {editando ? (
        <div className="flex flex-col gap-3 p-4">
          {pendentes.length > 0 && (
            <Aviso tom="warn"><b>Alterações não salvas: {contar(pendentes.length)}.</b> “Concluir edição” salva tudo junto.</Aviso>
          )}
          {erroGeral && <div role="alert"><Aviso tom="dng">{erroGeral}</Aviso></div>}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ativos.map(l => {
              const v = valor(l)
              const e = erros[l.id] ?? {}
              return (
                <li key={l.id} className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-page p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field rotulo="Nome" erro={e.titulo}>
                      {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} value={v.titulo} onChange={ev => editar(l, 'titulo', ev.target.value)} />}
                    </Field>
                    <Field rotulo="Endereço" erro={e.url}>
                      {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} inputMode="url" value={v.url} onChange={ev => editar(l, 'url', ev.target.value)} />}
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button tamanho="p" variante="perigo" icone={<Trash2 size={14} aria-hidden="true" />} onClick={() => excluir(l)} disabled={ocupado}>Excluir</Button>
                  </div>
                </li>
              )
            })}
            <li className="flex flex-col gap-2.5 rounded-xl border border-dashed border-line p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field rotulo="Nome" erro={erroNovo.titulo}>
                  {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} placeholder="Ex.: Portal da Prefeitura" value={novo.titulo} onChange={ev => { setNovo(p => ({ ...p, titulo: ev.target.value })); setErroGeral(null) }} />}
                </Field>
                <Field rotulo="Endereço" erro={erroNovo.url}>
                  {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} inputMode="url" placeholder="https://" value={novo.url} onChange={ev => { setNovo(p => ({ ...p, url: ev.target.value })); setErroGeral(null) }} />}
                </Field>
              </div>
              <div className="flex justify-end">
                <Button tamanho="p" icone={<Plus size={14} aria-hidden="true" />} onClick={adicionar} disabled={ocupado}>Adicionar link</Button>
              </div>
            </li>
          </ul>
        </div>
      ) : ativos.length === 0 ? (
        <EmptyState
          icone={<Link2 size={24} />}
          titulo="Nenhum link cadastrado"
          descricao={isAdmin ? 'Use “Editar links” para adicionar os sites do escritório.' : 'A administração ainda não cadastrou links.'}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {ativos.map(l => (
            <li key={l.id} className="min-w-0">
              <a
                href={hrefDoLink(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-3 rounded-[10px] border border-line-soft bg-page px-3 py-2.5 transition-colors hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-acc-soft font-bold text-acc-text">{inicialDoLink(l.titulo)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-snug text-fg group-hover:text-acc-text">{l.titulo}</span>
                  <span className="block truncate text-xs text-fg-3">{dominioDoLink(l.url)}</span>
                </span>
                <ExternalLink size={14} aria-hidden="true" className="flex-none text-fg-3" />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
