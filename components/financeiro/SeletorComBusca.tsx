'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { normalizarNome } from '@/lib/config-entidades'
import { cn } from '@/components/ui/cn'

interface Opcao { id: string; nome: string }

interface Props {
  value: string
  onChange: (id: string) => void
  opcoes: Opcao[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** id do campo (vem do Field, para o rótulo apontar para ele) */
  id?: string
  describedBy?: string
  invalido?: boolean
  /** Lupa à esquerda (m-16: no Tipo sim, no Centro de custo não). */
  iconeBusca?: boolean
}

// Campo de texto que filtra uma lista de opções (m-16): lupa à esquerda,
// seta à direita, linhas de 44 px e a opção escolhida em destaque.
// Setas ↑ ↓ andam pela lista, Enter escolhe, Esc fecha.
export default function SeletorComBusca({
  value, onChange, opcoes, placeholder, disabled, className, id, describedBy, invalido = false, iconeBusca = true,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [paraCima, setParaCima] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const idLista = useId()

  const selecionado = opcoes.find(o => o.id === value)
  const nomeEscolhido = selecionado?.nome ?? ''
  const [texto, setTexto] = useState(nomeEscolhido)

  // O campo acompanha a escolha quando ela muda por fora (carregou a lista,
  // "Limpar", tipo recém-criado). Ao digitar por cima de uma escolha, a
  // escolha é desfeita mas o que foi digitado fica.
  const [nomeAnterior, setNomeAnterior] = useState(nomeEscolhido)
  if (nomeAnterior !== nomeEscolhido) {
    setNomeAnterior(nomeEscolhido)
    setTexto(nomeEscolhido)
  }

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
        setTexto(selecionado?.nome ?? '')
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [selecionado?.nome])

  const termoNormalizado = normalizarNome(texto)
  // Com o nome escolhido no campo, a lista mostra tudo (senão só apareceria ele).
  const filtrando = termoNormalizado && !(selecionado && texto === selecionado.nome)
  const filtradas = filtrando
    ? opcoes.filter(o => normalizarNome(o.nome).includes(termoNormalizado))
    : opcoes

  // A janela corta o que passa da borda dela: sem espaço embaixo (campo perto
  // do rodapé), a lista abre para cima em vez de ficar com o fim escondido.
  function abrir() {
    const el = containerRef.current
    if (el) {
      const campo = el.getBoundingClientRect()
      const janela = el.closest('[role="dialog"]')?.getBoundingClientRect()
      const abaixo = (janela ? janela.bottom : window.innerHeight) - campo.bottom
      const acima = campo.top - (janela ? janela.top : 0)
      setParaCima(abaixo < 248 && acima > abaixo)
    }
    setAberto(true)
  }

  function selecionar(opcao: Opcao) {
    onChange(opcao.id)
    setTexto(opcao.nome)
    setAberto(false)
    setAtivo(-1)
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (aberto) { e.preventDefault(); e.stopPropagation() }
      setAberto(false)
      setTexto(selecionado?.nome ?? '')
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) { abrir(); return }
      if (filtradas.length === 0) return
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setAtivo(a => (a + passo + filtradas.length) % filtradas.length)
      return
    }
    if (e.key === 'Enter' && aberto && ativo >= 0 && filtradas[ativo]) {
      e.preventDefault()
      selecionar(filtradas[ativo])
    }
  }

  const mostrarLista = aberto && !disabled

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      {iconeBusca && (
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
      )}
      <input
        id={id}
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={mostrarLista ? idLista : undefined}
        aria-autocomplete="list"
        aria-activedescendant={mostrarLista && ativo >= 0 ? `${idLista}-${ativo}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalido || undefined}
        autoComplete="off"
        className={cn(
          'h-9 w-full rounded-lg border border-line bg-inset pr-9 text-sm text-fg placeholder:text-ph',
          'focus:border-acc focus:outline-none focus:ring-[3px] focus:ring-acc-soft disabled:cursor-not-allowed disabled:opacity-60',
          iconeBusca ? 'pl-9' : 'pl-3',
          invalido && 'border-danger ring-[3px] ring-danger-soft',
        )}
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={abrir}
        onClick={abrir}
        onChange={e => {
          setTexto(e.target.value)
          if (!aberto) abrir()
          setAtivo(-1)
          if (value) { setNomeAnterior(''); onChange('') }
        }}
        onKeyDown={aoTeclar}
      />
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-3" />
      {mostrarLista && (
        <ul
          id={idLista}
          role="listbox"
          className={cn(
            'absolute z-10 max-h-[232px] w-full overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-modal',
            paraCima ? 'bottom-full mb-1' : 'mt-1',
          )}
        >
          {filtradas.length === 0 ? (
            <li className="flex min-h-11 items-center px-3 text-sm text-fg-3">Nenhum resultado</li>
          ) : (
            filtradas.map((o, i) => (
              <li
                key={o.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={o.id === value}
                onMouseDown={e => e.preventDefault()}
                onClick={() => selecionar(o)}
                onMouseEnter={() => setAtivo(i)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm transition-colors',
                  o.id === value ? 'bg-acc-soft font-semibold text-fg' : 'text-fg',
                  i === ativo && o.id !== value && 'bg-surface',
                )}
              >
                <span className="truncate" title={o.nome}>{o.nome}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
