import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const clientes = [
  { cod: '00005', nome: 'Construtora e Empreendimentos São Bento', cnpj: '07387700000120', regime: 'Presumido', atividade: 'Servico', responsavel: 'SANDRA', grupo: 'normal' },
  { cod: '00058', nome: 'DF Medicina Aplicada LTDA', cnpj: '40620996000152', regime: 'Presumido / EPP', atividade: 'Servico', responsavel: 'DAYNNE', grupo: 'normal' },
  { cod: '00046', nome: 'Complexo Cultural Shoenberg LTDA', cnpj: '01426689000183', regime: 'Simples', atividade: 'Servico', responsavel: 'SANDRA', grupo: 'normal' },
  { cod: '00102', nome: 'Instituto de Psiquiatria do Cariri LTDA', cnpj: '47053879000101', regime: 'Presumido', atividade: 'Servico', responsavel: 'SANDRA', grupo: 'normal' },
  { cod: '00200', nome: 'Atacadão do Lar LTDA', cnpj: '32649437000147', regime: 'Presumido', atividade: 'Comercio', responsavel: 'SANDRA', grupo: 'normal', obs: 'Nfe / NFCe' },
  { cod: '00249', nome: 'JD Construtora', cnpj: '49787578000129', regime: 'Presumido', atividade: 'Servico', responsavel: 'SANDRA', grupo: 'normal' },
  { cod: '00174', nome: 'Francisco de Assis de Alencar Freitas LTDA', cnpj: '00404607000137', regime: 'Presumido', atividade: 'Industria/ Serv', responsavel: 'DAYNNE', grupo: 'normal', obs: 'NFe' },
  { cod: '00178', nome: 'Paraiso Piscinas LTDA', cnpj: '13579246000101', regime: 'Simples', atividade: 'Servico', responsavel: 'GABRYELA', grupo: 'normal' },
]

async function seed() {
  console.log('Inserindo clientes placeholder...')

  const { error } = await supabase.from('clientes').upsert(clientes, { onConflict: 'cnpj' })

  if (error) {
    console.error('Erro:', error.message)
    process.exit(1)
  }

  console.log(`✓ ${clientes.length} clientes inseridos`)
}

seed()
