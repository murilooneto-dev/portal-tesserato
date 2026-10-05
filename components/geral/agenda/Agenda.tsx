'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Clock, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { CabecalhoPagina } from '@/components/ui/Pagina'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { mesVizinho } from '@/lib/mes-navegacao'
import {
  chaveDia, chaveDeHoje, compromissosDoDia, dataDaChave, formVazio, horaCurta, lembretesProximos, payloadCompromisso,
  rotuloLembrete, tituloDoDia, tomDoCompromisso, type Compromisso, type FormCompromisso,
} from '@/lib/agenda'
import { CalendarioMes, PONTO_DO_TOM } from './CalendarioMes'
import { DiaModal } from './DiaModal'
import { CompromissoModal } from './CompromissoModal'

// Agenda pessoal (tabela `agenda`, só os compromissos do próprio usuário).
// Usada no Início e em /fiscal/agenda.
// `hojeInicial` (aaaa-mm-dd, fuso de São Paulo) vem do servidor: servidor e navegador renderizam o mesmo dia.
export default function Agenda({ titulo, subtitulo, topo, hojeInicial }: { titulo: string; subtitulo: string; topo?: ReactNode; hojeInicial: string }) {
  const [hoje, setHoje] = useState(() => dataDaChave(hojeInicial))
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<Compromisso[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [diaAberto, setDiaAberto] = useState<number | null>(null)
  const [form, setForm] = useState<{ id: string | null; inicial: FormCompromisso } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sb] = useState(() => createClient())
  const confirmar = useConfirmar()
  const avisar = useToast()

  async function carregar(uid: string) {
    const { data, error } = await sb.from('agenda').select('*').eq('usuario_id', uid).order('data_compromisso')
    if (error) { avisar('Não foi possível carregar a agenda.', 'dng'); return }
    setItens((data ?? []) as Compromisso[])
  }

  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); carregar(user.id) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Hoje" não fica congelado: se a janela volta ao foco em outro dia, recalcula.
  useEffect(() => {
    function atualizarHoje() {
      const agora = new Date()
      setHoje(atual => (chaveDeHoje(atual) === chaveDeHoje(agora) ? atual : agora))
    }
    function aoVoltar() { if (document.visibilityState === 'visible') atualizarHoje() }
    window.addEventListener('focus', atualizarHoje)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.removeEventListener('focus', atualizarHoje)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  function irPara(delta: -1 | 1) {
    const v = mesVizinho(mes, ano, delta)
    setMes(v.mes)
    setAno(v.ano)
  }

  const lembretes = useMemo(() => lembretesProximos(itens, hoje), [itens, hoje])
  const deHoje = useMemo(() => compromissosDoDia(itens, chaveDeHoje(hoje)), [itens, hoje])
  const chaveAberta = diaAberto === null ? null : chaveDia(ano, mes, diaAberto)

  function novo(data: string) {
    setForm({ id: null, inicial: formVazio(data) })
  }

  function editar(c: Compromisso) {
    setForm({
      id: c.id,
      inicial: {
        titulo: c.titulo, descricao: c.descricao ?? '', data_compromisso: c.data_compromisso,
        hora_compromisso: horaCurta(c.hora_compromisso), status: c.status, lembrete_3_dias: c.lembrete_3_dias,
      },
    })
  }

  async function salvar(f: FormCompromisso) {
    if (!form) return
    if (!userId) { avisar('Aguarde a agenda carregar e tente de novo.', 'dng'); return }
    setSalvando(true)
    const dados = payloadCompromisso(f)
    const { error } = form.id
      ? await sb.from('agenda').update(dados).eq('id', form.id)
      : await sb.from('agenda').insert({ usuario_id: userId, ...dados })
    setSalvando(false)
    if (error) { avisar('Não foi possível salvar o compromisso.', 'dng'); return }
    setForm(null)
    avisar('Compromisso salvo.', 'ok')
    await carregar(userId)
  }

  async function excluir(c: Compromisso) {
    if (!userId) return
    const ok = await confirmar({ titulo: 'Excluir compromisso?', descricao: `"${c.titulo}" sai da sua agenda.`, textoConfirmar: 'Excluir', perigo: true })
    if (!ok) return
    const { error } = await sb.from('agenda').delete().eq('id', c.id)
    if (error) { avisar('Não foi possível excluir o compromisso.', 'dng'); return }
    avisar('Compromisso excluído.', 'ok')
    await carregar(userId)
  }

  return (
    <>
      <CabecalhoPagina
        titulo={titulo}
        subtitulo={subtitulo}
        acoes={<Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => novo(chaveDeHoje(hoje))}>Novo compromisso</Button>}
      />
      {topo}
      {lembretes.length > 0 && (
        <section aria-label="Lembretes dos próximos 3 dias" className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-[18px] py-3 sm:flex-row sm:items-center sm:gap-3.5">
          <h2 className="flex flex-none items-center gap-2 text-sm font-semibold text-fg">
            <Clock size={18} aria-hidden="true" className="text-warn" />
            Lembretes · próximos 3 dias
          </h2>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {lembretes.map(item => (
              <li key={item.id} className="min-w-0 max-w-full">
                <Badge tom="warn" grande className="max-w-full overflow-hidden"><span className="truncate">{rotuloLembrete(item, hoje)}</span></Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CalendarioMes
        ano={ano}
        mes={mes}
        hoje={hoje}
        itens={itens}
        onAbrirDia={setDiaAberto}
        onMesAnterior={() => irPara(-1)}
        onProximoMes={() => irPara(1)}
        onHoje={() => { setMes(hoje.getMonth() + 1); setAno(hoje.getFullYear()) }}
      />
      <section aria-label="Compromissos de hoje" className="rounded-xl border border-line-soft bg-surface px-3.5 py-3 sm:hidden">
        <h2 className="text-sm font-semibold text-fg">{`Hoje · ${tituloDoDia(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())}`}</h2>
        {deHoje.length === 0 ? (
          <EmptyState compacto icone={<CalendarDays size={20} />} titulo="Nenhum compromisso hoje" />
        ) : (
          <ul>
            {deHoje.map(item => (
              <li key={item.id} className="mt-1 flex min-h-11 items-center gap-2.5">
                <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', PONTO_DO_TOM[tomDoCompromisso(item, hoje)])} />
                <button type="button" onClick={() => editar(item)} className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-fg">{item.titulo}</button>
                <span className="font-mono text-[13px] text-fg-3">{horaCurta(item.hora_compromisso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {chaveAberta && diaAberto !== null && (
        <DiaModal
          key={chaveAberta}
          aberto={form === null}
          titulo={tituloDoDia(ano, mes, diaAberto)}
          ehHoje={chaveAberta === chaveDeHoje(hoje)}
          itens={compromissosDoDia(itens, chaveAberta)}
          hoje={hoje}
          onNovo={() => novo(chaveAberta)}
          onEditar={editar}
          onExcluir={excluir}
          onFechar={() => setDiaAberto(null)}
        />
      )}
      {form && (
        <CompromissoModal
          key={form.id ?? `novo-${form.inicial.data_compromisso}`}
          aberto
          inicial={form.inicial}
          editando={form.id !== null}
          salvando={salvando}
          onSalvar={salvar}
          onFechar={() => setForm(null)}
        />
      )}
    </>
  )
}
