'use client'

import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Layers, Lock, Plus, X } from 'lucide-react'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import SeletorAtividades from '@/components/geral/SeletorAtividades'
import TarefasAutomaticasCampo from '@/components/geral/TarefasAutomaticasCampo'
import GruposTarefasModal from '@/components/geral/GruposTarefasModal'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select, Checkbox } from '@/components/ui/Input'

export interface CamposFiscaisData {
  cod: string
  regime: string
  atividade: string[]
  responsavel: string
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  faz_dossie: boolean
  login_iss: string
  senha_iss: string
  email_envio_iss: string
  tarefas_personalizadas: string[]
  tarefas_excluidas: string[]
}

interface Props {
  form: CamposFiscaisData
  set: <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void
  responsaveis: string[]
  catalogo: CatalogoCliente
  isEdit: boolean
  clienteId: string | null
  readOnly: boolean
  novaTarefa: string
  setNovaTarefa: (v: string) => void
  addTarefa: () => void
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      {children}
    </section>
  )
}

// As quatro seções da janela Editar empresa, depois de Identificação (que fica
// no EmpresaModal): Enquadramento, Rotinas do cliente e Tarefas do cliente.
export default function CamposFiscais({ form, set, responsaveis, catalogo, isEdit, clienteId, readOnly, novaTarefa, setNovaTarefa, addTarefa }: Props) {
  const [gruposAberto, setGruposAberto] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState(false)

  return (
    <>
      <Secao titulo="Enquadramento">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field rotulo="Regime">
            {c => (
              <Select id={c.id} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
                <option value="">Selecionar…</option>
                {form.regime && !catalogo.regimes.includes(form.regime) && (
                  <option value={form.regime}>{form.regime} (atual)</option>
                )}
                {catalogo.regimes.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Responsável">
            {c => (
              <Select id={c.id} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
                <option value="">Selecionar…</option>
                {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Atividades</span>
          <SeletorAtividades
            valores={form.atividade}
            opcoes={catalogo.atividades}
            onChange={v => set('atividade', v)}
            readOnly={readOnly}
          />
        </div>
      </Secao>

      <Secao titulo="Rotinas do cliente">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Checkbox rotulo="Envia ISS" checked={form.envia_iss} onChange={e => set('envia_iss', e.target.checked)} disabled={readOnly} />
          <Checkbox rotulo="Confere SIGA" checked={form.confere_siga} onChange={e => set('confere_siga', e.target.checked)} disabled={readOnly} />
          <Checkbox rotulo="Faz dossiê" checked={form.faz_dossie} onChange={e => set('faz_dossie', e.target.checked)} disabled={readOnly} />
          <Checkbox rotulo="Declaração anual" checked={form.declaracao_anual} onChange={e => set('declaracao_anual', e.target.checked)} disabled={readOnly} />
        </div>

        {form.envia_iss && (
          <div className="flex flex-col gap-3 rounded-[10px] border border-line-soft bg-page px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-2">
              <Lock size={14} aria-hidden="true" />Acesso ao ISS
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field rotulo="Login do ISS">
                {c => <Input id={c.id} autoComplete="off" value={form.login_iss} onChange={e => set('login_iss', e.target.value)} disabled={readOnly} />}
              </Field>
              <Field rotulo="Senha do ISS">
                {c => (
                  <div className="relative min-w-0">
                    <Input
                      id={c.id}
                      className="pr-11"
                      type={senhaVisivel ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={form.senha_iss}
                      onChange={e => set('senha_iss', e.target.value)}
                      disabled={readOnly}
                    />
                    <IconButton
                      className="absolute right-0.5 top-1/2 -translate-y-1/2"
                      rotulo={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={senhaVisivel}
                      icone={senhaVisivel ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      onClick={() => setSenhaVisivel(v => !v)}
                    />
                  </div>
                )}
              </Field>
              <Field rotulo="E-mail de envio">
                {c => <Input id={c.id} type="email" placeholder="financeiro@cliente.com.br" value={form.email_envio_iss} onChange={e => set('email_envio_iss', e.target.value)} disabled={readOnly} />}
              </Field>
            </div>
          </div>
        )}
      </Secao>

      <Secao titulo="Tarefas do cliente">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-fg-2">Tarefas ({form.tarefas_personalizadas.length})</span>
            {isEdit && clienteId && !readOnly && (
              <Button className="ml-auto" tamanho="p" icone={<Layers size={14} aria-hidden="true" />} onClick={() => setGruposAberto(true)}>
                Agrupar tarefas
              </Button>
            )}
          </div>

          <div className="mb-3 flex min-h-[34px] flex-wrap gap-2">
            {form.tarefas_personalizadas.length === 0 && (
              <p className="text-xs text-fg-3">Nenhuma tarefa adicionada.</p>
            )}
            {form.tarefas_personalizadas.map((t, i) => (
              <span key={i}
                className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acc)_55%,transparent)] bg-acc-soft px-3 text-[13px] text-fg">
                {t}
                {!readOnly && (
                  <button type="button"
                    aria-label={`Remover ${t}`}
                    onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                    className="-mr-1.5 inline-grid h-6 w-6 max-sm:h-11 max-sm:w-11 place-items-center rounded-full text-fg-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {!readOnly && (
            <div className="flex gap-2">
              <Input
                className="flex-1"
                aria-label="Nome da nova tarefa"
                value={novaTarefa}
                onChange={e => setNovaTarefa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
                placeholder="Digite o nome da tarefa e pressione Enter"
              />
              <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addTarefa}>Adicionar</Button>
            </div>
          )}
        </div>

        <TarefasAutomaticasCampo
          setor="fiscal"
          regime={form.regime}
          atividade={form.atividade}
          personalizadas={form.tarefas_personalizadas}
          excluidas={form.tarefas_excluidas}
          onChangeExcluidas={v => set('tarefas_excluidas', v)}
          readOnly={readOnly}
        />
      </Secao>

      {gruposAberto && clienteId && (
        <GruposTarefasModal
          clienteId={clienteId}
          setor="fiscal"
          tarefasDisponiveis={form.tarefas_personalizadas}
          onClose={() => setGruposAberto(false)}
        />
      )}
    </>
  )
}
