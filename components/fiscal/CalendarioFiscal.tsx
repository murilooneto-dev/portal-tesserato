'use client'

interface Obrigacao {
  id: string
  nome: string
  dia: number | 'ultimo'
  cor: string
  desc: string
}

const OBRIGACOES: Obrigacao[] = [
  { id: 'siget',             nome: 'SIGET',             dia: 5,       cor: '#16a34a', desc: 'Prazo interno para rotinas SIGET.' },
  { id: 'speed-gov',         nome: 'SPEED GOV',         dia: 10,      cor: '#0ea5e9', desc: 'Prazo interno para rotinas Speed Gov.' },
  { id: 'efd-reinf',         nome: 'EFD-Reinf',         dia: 15,      cor: '#8b5cf6', desc: 'Retenções na fonte e serviços.' },
  { id: 'das-simples',       nome: 'DAS / PGDAS-D',     dia: 15,      cor: '#10b981', desc: 'Documento de Arrecadação do Simples.' },
  { id: 'iss',               nome: 'ISS',               dia: 15,      cor: '#f59e0b', desc: 'Imposto Sobre Serviços.' },
  { id: 'icms',              nome: 'ICMS / ICMS-ST',    dia: 15,      cor: '#ef4444', desc: 'ICMS e Substituição Tributária.' },
  { id: 'pis-cofins',        nome: 'PIS / COFINS',      dia: 20,      cor: '#f97316', desc: 'Apuração de PIS e COFINS.' },
  { id: 'dctfweb',           nome: 'DCTFWeb',           dia: 20,      cor: '#7c3aed', desc: 'Declaração de débitos federais.' },
  { id: 'efd-contribuicoes', nome: 'EFD-Contribuições', dia: 'ultimo',cor: '#0891b2', desc: 'PIS, COFINS e Contrib. Previdenciária.' },
]

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function ultimoDia(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate()
}

interface Props {
  mes: number
  ano: number
}

export default function CalendarioFiscal({ mes, ano }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Calendário Fiscal
        </h2>
        <span className="text-white/60 text-sm">{MESES[mes - 1]} {ano}</span>
      </div>

      <div className="flex flex-col gap-2">
        {OBRIGACOES.map(ob => {
          const diaNum = ob.dia === 'ultimo' ? ultimoDia(ano, mes) : ob.dia
          const data = new Date(ano, mes - 1, diaNum)
          const hoje = new Date()
          const passado = data < hoje
          const hojeFlag = data.toDateString() === hoje.toDateString()

          return (
            <div
              key={ob.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                hojeFlag
                  ? 'bg-white/8 border-[#00B8D4]/40'
                  : passado
                  ? 'bg-white/2 border-white/5 opacity-50'
                  : 'bg-white/4 border-white/8'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: ob.cor + '33', border: `1px solid ${ob.cor}66` }}
              >
                <span style={{ color: ob.cor }}>{diaNum}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{ob.nome}</p>
                <p className="text-white/40 text-xs truncate">{ob.desc}</p>
              </div>
              {hojeFlag && (
                <span className="text-[10px] text-[#00B8D4] font-semibold uppercase tracking-wide">hoje</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
