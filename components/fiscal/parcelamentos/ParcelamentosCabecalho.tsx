'use client'

import { Plus, Printer, Search } from 'lucide-react'
import { CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { TODOS, type SecaoParcelamento } from '@/lib/parcelamentos-tela'

interface Props {
  ano: number
  subtitulo: string
  busca: string
  onBusca: (v: string) => void
  secaoFiltro: string
  onSecao: (v: string) => void
  respFiltro: string
  onResp: (v: string) => void
  secoes: SecaoParcelamento[]
  responsaveis: string[]
  mostrarResponsavel: boolean
  onImprimir: () => void
  onNovo: () => void
}

// Título, ações (Relatório e o único botão primário) e filtros da tela.
export default function ParcelamentosCabecalho({
  ano, subtitulo, busca, onBusca, secaoFiltro, onSecao, respFiltro, onResp,
  secoes, responsaveis, mostrarResponsavel, onImprimir, onNovo,
}: Props) {
  return (
    <>
      <CabecalhoPagina
        titulo={`Parcelamentos ${ano}`}
        subtitulo={subtitulo}
        acoes={
          <>
            <Button icone={<Printer size={16} aria-hidden="true" />} onClick={onImprimir}>Relatório</Button>
            <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={onNovo}>Novo parcelamento</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => (
            <Input
              id={c.id}
              type="search"
              iconeEsquerda={<Search size={16} />}
              placeholder="Empresa, CNPJ ou responsável"
              value={busca}
              onChange={e => onBusca(e.target.value)}
            />
          )}
        </Field>
        {/* Celular (mob-08): seções em chips, com o mesmo filtro do Select. */}
        <div role="group" aria-label="Seção" className="flex w-full gap-2 overflow-x-auto pb-0.5 sm:hidden">
          <Chip ativo={secaoFiltro === TODOS} onClick={() => onSecao(TODOS)} className="h-9">Todas as seções</Chip>
          {secoes.map(s => (
            <Chip key={s.id} ativo={secaoFiltro === s.nome} onClick={() => onSecao(s.nome)} className="h-9">{s.nome}</Chip>
          ))}
        </div>
        <Field rotulo="Seção" className="hidden w-full sm:flex sm:w-[240px]">
          {c => (
            <Select id={c.id} value={secaoFiltro} onChange={e => onSecao(e.target.value)}>
              <option value={TODOS}>Todas as seções</option>
              {secoes.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </Select>
          )}
        </Field>
        {mostrarResponsavel && (
          <Field rotulo="Responsável" className="w-full sm:w-[200px]">
            {c => (
              <Select id={c.id} value={respFiltro} onChange={e => onResp(e.target.value)}>
                <option value={TODOS}>Todos</option>
                {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </Field>
        )}
      </div>
    </>
  )
}
