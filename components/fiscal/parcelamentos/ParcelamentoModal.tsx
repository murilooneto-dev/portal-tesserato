'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { montarUpdateParcelamento } from '@/lib/parcelamento-campos'
import { AVISO_CLIENTE_SEM_CNPJ, decidirCnpj } from '@/lib/parcelamento-cnpj'
import type { StatusParcelamento } from '@/lib/parcelamentos-aviso'
import {
  MESES_ABREV, MESES_COLS, SETORES_PARCELAMENTO,
  type Parcelamento, type SecaoParcelamento,
} from '@/lib/parcelamentos-tela'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Chip } from '@/components/ui/Chip'
import { Aviso } from '@/components/ui/Aviso'

export type FormParcelamento = Omit<Parcelamento, 'id'>

export const FORM_PARCELAMENTO_VAZIO: FormParcelamento = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', setores: [], tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}

export interface ClienteCadastrado {
  nome: string
  cnpj: string | null
  responsavel: string | null
}

interface Props {
  /** null = novo parcelamento */
  item: Parcelamento | null
  secoes: SecaoParcelamento[]
  clientes: ClienteCadastrado[]
  responsaveis: string[]
  regimes: string[]
  onClose: () => void
  /** Chamado depois de gravar com sucesso (recarrega a lista); a janela fecha em seguida. */
  onSalvo: () => Promise<void>
  /** Abre a janela de seções; `aoCriar` recebe o nome de uma seção criada ali (fica selecionada). */
  onGerenciarSecoes: (aoCriar: (nome: string) => void) => void
}

function formInicial(item: Parcelamento | null, secoes: SecaoParcelamento[]): FormParcelamento {
  if (item) {
    const resto: Partial<Parcelamento> = { ...item }
    delete resto.id
    return resto as FormParcelamento
  }
  return { ...FORM_PARCELAMENTO_VAZIO, secao: secoes[0]?.nome ?? '' }
}

export default function ParcelamentoModal({
  item, secoes, clientes, responsaveis, regimes, onClose, onSalvo, onGerenciarSecoes,
}: Props) {
  const sb = createClient()
  const [form, setForm] = useState<FormParcelamento>(() => formInicial(item, secoes))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [secoesVistas, setSecoesVistas] = useState(secoes)

  // Quando a lista de seções muda (renomear/remover na janela de seções), a
  // seção escolhida que sumiu cai para a primeira — mesma regra de antes.
  if (secoesVistas !== secoes) {
    setSecoesVistas(secoes)
    if (!secoes.some(s => s.nome === form.secao)) {
      setForm(prev => ({ ...prev, secao: secoes[0]?.nome ?? '' }))
    }
  }

  function setF<K extends keyof FormParcelamento>(k: K, v: FormParcelamento[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function alternarSetor(setor: string) {
    setForm(prev => ({
      ...prev,
      setores: prev.setores.includes(setor) ? prev.setores.filter(s => s !== setor) : [...prev.setores, setor],
    }))
  }

  const cnpj = decidirCnpj({ avulsa: form.empresa_avulsa, empresa: form.empresa, cnpjAtual: form.cnpj, clientes })
  const clienteEscolhido = !form.empresa_avulsa && clientes.some(c => c.nome === form.empresa)
  // Regime antigo que não está mais no catálogo continua selecionável.
  const regimeForaDaLista = form.regime && !regimes.includes(form.regime) ? form.regime : null

  async function handleSave() {
    setSaving(true)
    setErro(null)
    try {
      // O CNPJ gravado é o que o campo mostra (segue o do cliente).
      const formFinal = { ...form, cnpj: cnpj.valor }
      if (item) {
        // Vinculado a cliente: meses sao somente leitura na UI (preenchidos
        // pela tarefa na ficha do cliente) — nao reenviar, senao o save do
        // admin sobrescreve o que a ficha gravou com o valor capturado na
        // abertura. Avulso: nunca tem tarefa, meses entram no update.
        // Usa form.empresa_avulsa (valor ao vivo), nao o de item (obsoleto).
        const { error } = await sb.from('parcelamentos').update(montarUpdateParcelamento(formFinal, formFinal.empresa_avulsa)).eq('id', item.id)
        if (error) { setErro('Não foi possível salvar o parcelamento. Tente de novo.'); return }
      } else {
        // Mesmo filtro do update: evita criar vinculado ja com meses.
        const { error } = await sb.from('parcelamentos').insert(montarUpdateParcelamento(formFinal, formFinal.empresa_avulsa))
        if (error) { setErro('Não foi possível salvar o parcelamento. Tente de novo.'); return }
      }
      await onSalvo()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={saving}
      largura="g"
      titulo={item ? 'Editar parcelamento' : 'Novo parcelamento'}
      subtitulo={item ? item.empresa : undefined}
      rodape={
        <div className="ml-auto flex gap-2.5">
          <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variante="primario" onClick={handleSave} carregando={saving} disabled={!form.empresa.trim() || !form.secao}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      }
    >
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">Empresa</h3>
        <Switch
          ligado={form.empresa_avulsa}
          rotulo="Empresa avulsa (sem cadastro de cliente)"
          onMudar={avulsa => setForm(p => ({ ...p, empresa_avulsa: avulsa, empresa: '', cnpj: null }))}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field rotulo="Empresa" obrigatorio>
            {c => form.empresa_avulsa ? (
              <Input id={c.id} data-autofocus placeholder="Nome da empresa" value={form.empresa} onChange={e => setF('empresa', e.target.value)} />
            ) : (
              <Select
                id={c.id}
                data-autofocus
                value={form.empresa}
                onChange={e => {
                  const nome = e.target.value
                  const cliente = clientes.find(x => x.nome === nome)
                  setForm(p => ({ ...p, empresa: nome, cnpj: cliente?.cnpj ?? null, responsavel: cliente?.responsavel ?? null }))
                }}
              >
                <option value="">Selecionar…</option>
                {form.empresa && !clienteEscolhido && <option value={form.empresa}>{form.empresa} (atual)</option>}
                {clientes.map(cl => <option key={cl.nome} value={cl.nome}>{cl.nome}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="CNPJ" ajuda={!cnpj.editavel ? 'Segue o CNPJ do cliente cadastrado' : undefined}>
            {c => (
              <Input
                id={c.id}
                aria-describedby={c.describedBy}
                className="font-mono"
                placeholder="00.000.000/0000-00"
                disabled={!cnpj.editavel}
                value={cnpj.valor ?? ''}
                onChange={e => setF('cnpj', e.target.value || null)}
              />
            )}
          </Field>
        </div>
        {cnpj.avisoSemCnpj && <Aviso tom="warn">{AVISO_CLIENTE_SEM_CNPJ}</Aviso>}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">Parcelamento</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field rotulo="Seção" obrigatorio ajuda={secoes.length === 0 ? 'Nenhuma seção cadastrada ainda: crie uma em Nova seção.' : undefined}>
            {c => (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select id={c.id} aria-describedby={c.describedBy} value={form.secao} onChange={e => setF('secao', e.target.value)}>
                    {secoes.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                  </Select>
                </div>
                <Button tamanho="p" onClick={() => onGerenciarSecoes(nome => setF('secao', nome))} disabled={saving}>Nova seção</Button>
              </div>
            )}
          </Field>
          <Field rotulo="Status">
            {c => (
              <Select id={c.id} value={form.status} onChange={e => setF('status', e.target.value as StatusParcelamento)}>
                <option value="EM ANDAMENTO">Em andamento</option>
                <option value="LIQUIDADO">Liquidado</option>
                <option value="CANCELADO">Cancelado</option>
              </Select>
            )}
          </Field>
          <Field rotulo="Regime">
            {c => (
              <Select id={c.id} value={form.regime ?? ''} onChange={e => setF('regime', e.target.value || null)}>
                <option value="">Selecionar…</option>
                {regimeForaDaLista && <option value={regimeForaDaLista}>{regimeForaDaLista} (atual)</option>}
                {regimes.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Responsável" ajuda={clienteEscolhido ? 'Segue o responsável do cliente' : undefined}>
            {c => (
              <Select
                id={c.id}
                aria-describedby={c.describedBy}
                value={form.responsavel ?? ''}
                onChange={e => setF('responsavel', e.target.value || null)}
                disabled={clienteEscolhido}
              >
                <option value="">Selecionar…</option>
                {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Local / Tipo" className="sm:col-span-2">
            {c => <Input id={c.id} value={form.local_tipo ?? ''} onChange={e => setF('local_tipo', e.target.value || null)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">
            Parcelas mensais: data de emissão/envio
            {!form.empresa_avulsa && <span className="ml-1.5 font-normal text-fg-3">(preenchidas pela tarefa na ficha do cliente)</span>}
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {MESES_COLS.map((mes, i) => {
              // Avulso: mostra o digitado. Vinculado: mostra o valor gravado
              // (o save descarta meses digitados de quem nao e avulso).
              const valor = form.empresa_avulsa ? form[mes] : (item?.[mes] ?? null)
              return (
                <div key={mes} className="flex flex-col gap-1">
                  <span className="text-center text-xs text-fg-3">{MESES_ABREV[i]}</span>
                  {form.empresa_avulsa ? (
                    <Input
                      aria-label={`Parcela de ${MESES_ABREV[i]}`}
                      className="px-2 text-center"
                      placeholder="dd/mm"
                      value={valor ?? ''}
                      onChange={e => setF(mes, e.target.value || null)}
                    />
                  ) : (
                    <div className="flex h-9 items-center justify-center rounded-lg border border-line-soft bg-inset text-sm text-fg-2">
                      {valor ?? '—'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">Tarefa automática</h3>
        <div className="flex flex-col gap-1.5">
          <span id="parc-setores" className="text-[13px] font-medium text-fg-2">Gera tarefa nos setores</span>
          <div role="group" aria-labelledby="parc-setores" className="flex flex-wrap gap-2">
            {SETORES_PARCELAMENTO.map(s => (
              <Chip key={s.valor} ativo={form.setores.includes(s.valor)} onClick={() => alternarSetor(s.valor)}>{s.label}</Chip>
            ))}
          </div>
        </div>
        <Field rotulo="Tarefa">
          {c => <Input id={c.id} value={form.tarefa ?? ''} onChange={e => setF('tarefa', e.target.value || null)} />}
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">Senhas</h3>
        <Field rotulo="Senhas / obs">
          {c => <Textarea id={c.id} rows={3} value={form.senhas ?? ''} onChange={e => setF('senhas', e.target.value || null)} />}
        </Field>
      </section>
    </Modal>
  )
}
