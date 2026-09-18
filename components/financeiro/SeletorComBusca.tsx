'use client'

import { useEffect, useRef, useState } from 'react'
import { normalizarNome } from '@/lib/config-entidades'

interface Opcao { id: string; nome: string }

interface Props {
  value: string
  onChange: (id: string) => void
  opcoes: Opcao[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function SeletorComBusca({ value, onChange, opcoes, placeholder, disabled, className }: Props) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selecionado = opcoes.find(o => o.id === value)

  useEffect(() => {
    setTexto(selecionado?.nome ?? '')
  }, [selecionado?.nome])

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
  const filtradas = termoNormalizado
    ? opcoes.filter(o => normalizarNome(o.nome).includes(termoNormalizado))
    : opcoes

  function selecionar(opcao: Opcao) {
    onChange(opcao.id)
    setTexto(opcao.nome)
    setAberto(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        className={inputCls}
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setAberto(true)}
        onChange={e => {
          setTexto(e.target.value)
          setAberto(true)
          if (value) onChange('')
        }}
        onKeyDown={e => { if (e.key === 'Escape') { setAberto(false); setTexto(selecionado?.nome ?? '') } }}
      />
      {aberto && !disabled && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/12 shadow-xl py-1">
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--fg)]/30">Nenhum resultado</li>
          ) : (
            filtradas.map(o => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => selecionar(o)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--fg)]/8 transition-colors ${o.id === value ? 'text-[var(--accent)]' : 'text-[var(--fg)]'}`}
                >
                  {o.nome}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
