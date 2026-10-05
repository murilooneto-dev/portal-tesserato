'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CreditCard, FileText, ListChecks, RotateCcw, Search, Trash2, User, type LucideIcon } from 'lucide-react'
import { restaurarExclusao } from '@/lib/lixeira-actions'
import type { ExclusaoAgrupada } from '@/lib/lixeira'
import { CabecalhoPagina } from '@/components/ui/Pagina'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'

interface Props {
  exclusoesIniciais: ExclusaoAgrupada[]
  erroInicial: string | null
}

const ORIGEM_TEXTO: Record<ExclusaoAgrupada['origemAutor'], string> = {
  sessao: 'pela sessão do usuário',
  servico: 'pelo sistema',
  desconhecido: 'autor desconhecido',
}

const ICONE_POR_TABELA: Record<string, LucideIcon> = {
  clientes: User,
  tarefas: ListChecks,
  clientes_fiscal: FileText,
  clientes_contabil: FileText,
  clientes_pessoal: FileText,
  parcelamentos: CreditCard,
}

// Fuso fixo para servidor e navegador renderizarem igual (evita erro de hidratação).
const SEM_NOME = '__sem_nome__'

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

// "por Fulano" quando o nome é conhecido; senão o texto da origem
// ("autor desconhecido" vai separado por um ponto, para a frase fechar).
function textoAutor(e: ExclusaoAgrupada): string {
  if (e.excluidoPorNome) return ` por ${e.excluidoPorNome}`
  return e.origemAutor === 'desconhecido' ? ` · ${ORIGEM_TEXTO.desconhecido}` : ` ${ORIGEM_TEXTO[e.origemAutor]}`
}

export default function LixeiraClient({ exclusoesIniciais, erroInicial }: Props) {
  const router = useRouter()
  const avisar = useToast()
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [restaurando, setRestaurando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(erroInicial)
  const [busca, setBusca] = useState('')
  const [autor, setAutor] = useState('')

  const autores = useMemo(
    () => Array.from(new Set(exclusoesIniciais.map(e => e.excluidoPorNome).filter((n): n is string => Boolean(n)))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [exclusoesIniciais],
  )

  const temSemNome = exclusoesIniciais.some(e => !e.excluidoPorNome)

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return exclusoesIniciais.filter(e =>
      (termo === '' || e.titulo.toLowerCase().includes(termo) || e.resumo.toLowerCase().includes(termo)) &&
      (autor === '' || (autor === SEM_NOME ? !e.excluidoPorNome : e.excluidoPorNome === autor)),
    )
  }, [exclusoesIniciais, busca, autor])

  async function restaurar(grupo: number) {
    setRestaurando(grupo)
    setErro(null)
    let r: Awaited<ReturnType<typeof restaurarExclusao>>
    try {
      r = await restaurarExclusao(grupo)
    } catch {
      setRestaurando(null)
      setErro('Não foi possível restaurar. Tente novamente.')
      return
    }
    setRestaurando(null)
    if (r.error) { setErro(r.error); return }
    setConfirmando(null)
    avisar('Exclusão restaurada.', 'ok')
    router.refresh()
  }

  function selo(e: ExclusaoAgrupada) {
    if (e.restaurada) return <Badge tom="ok" icone={<Check size={13} aria-hidden="true" />}>Já restaurado</Badge>
    return (
      <Badge tom={e.diasRestantes <= 7 ? 'warn' : 'neu'}>
        Expira em {e.diasRestantes} dia{e.diasRestantes === 1 ? '' : 's'}
      </Badge>
    )
  }

  // `celular` só troca a altura dos botões (44 px para o dedo).
  function acoes(e: ExclusaoAgrupada, celular: boolean) {
    if (e.restaurada) return null
    const alto = celular ? 'h-11 px-3.5 text-sm' : undefined
    if (confirmando === e.grupo) {
      return (
        <span className="flex flex-none items-center gap-2">
          <span className="whitespace-nowrap text-[13px] text-fg-2">Restaurar?</span>
          <Button tamanho="p" variante="primario" className={alto} onClick={() => restaurar(e.grupo)} carregando={restaurando === e.grupo}>
            {restaurando === e.grupo ? 'Restaurando…' : 'Confirmar'}
          </Button>
          <Button tamanho="p" variante="fantasma" className={alto} onClick={() => setConfirmando(null)} disabled={restaurando === e.grupo}>
            Cancelar
          </Button>
        </span>
      )
    }
    return (
      <Button
        tamanho="p"
        className={cn('flex-none', alto)}
        icone={<RotateCcw size={15} aria-hidden="true" />}
        aria-label={`Restaurar ${e.titulo}`}
        onClick={() => { setErro(null); setConfirmando(e.grupo) }}
      >
        Restaurar
      </Button>
    )
  }

  const semNada = exclusoesIniciais.length === 0

  return (
    <>
      <CabecalhoPagina titulo="Lixeira" subtitulo="Tudo o que é apagado fica aqui por 60 dias" />

      <Aviso tom="info">
        <span className="hidden sm:inline">
          Restaurar devolve a exclusão inteira, com as tarefas e anexos que foram junto. Remover um cliente de um setor gera duas entradas: <b>restaure as tarefas antes da ficha.</b>
        </span>
        <span className="sm:hidden">Restaure as tarefas antes da ficha do setor.</span>
      </Aviso>

      {!semNada && (
        <div className="flex flex-wrap items-end gap-3">
          <Field rotulo="Buscar" className="w-full sm:w-[300px]">
            {c => (
              <Input id={c.id} type="search" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="O que foi apagado" iconeEsquerda={<Search size={16} />} />
            )}
          </Field>
          <Field rotulo="Apagado por" className="w-full sm:w-[190px]">
            {c => (
              <Select id={c.id} value={autor} onChange={e => setAutor(e.target.value)}>
                <option value="">Todos</option>
                {autores.map(n => <option key={n} value={n}>{n}</option>)}
                {temSemNome && <option value={SEM_NOME}>Sem nome (sistema ou sessão)</option>}
              </Select>
            )}
          </Field>
        </div>
      )}

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      {semNada ? (
        !erro && <Card semPadding><EmptyState icone={<Trash2 size={24} />} titulo="Nenhuma exclusão guardada." /></Card>
      ) : visiveis.length === 0 ? (
        <Card semPadding><EmptyState icone={<Search size={24} />} titulo="Nenhuma exclusão encontrada com esse filtro." /></Card>
      ) : (
        <>
          {/* Computador: uma lista só, dentro de um cartão */}
          <Card semPadding className="hidden overflow-hidden sm:block">
            <ul>
              {visiveis.map((e, i) => {
                const Icone = ICONE_POR_TABELA[e.tabelaRaiz] ?? Trash2
                return (
                  <li key={e.grupo} className={cn('flex items-center gap-4 px-5 py-3.5', i > 0 && 'border-t border-line-soft')}>
                    <span aria-hidden="true" className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-raised text-fg-2">
                      <Icone size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg" title={e.titulo}>{e.titulo}</p>
                      <p className="text-[13px] text-fg-2">{e.resumo}</p>
                      <p className="text-[13px] text-fg-3">
                        Apagado em <span suppressHydrationWarning>{formatarData(e.excluidoEm)}</span>
                        {textoAutor(e)}
                      </p>
                    </div>
                    {selo(e)}
                    {acoes(e, false)}
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* Celular: um cartão por exclusão */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {visiveis.map(e => (
              <li key={e.grupo} className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-4 py-3.5">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">{e.titulo}</p>
                  <p className="text-[13px] text-fg-2">{e.resumo}</p>
                  <p className="text-[13px] text-fg-3">{!e.excluidoPorNome && e.origemAutor === 'desconhecido' ? 'Autor desconhecido' : `Apagado${textoAutor(e)}`}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {selo(e)}
                  {acoes(e, true)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
