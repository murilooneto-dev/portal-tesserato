// lib/exclusao-cliente.ts
//
// Regras puras (sem React, sem Supabase) da exclusão de cliente: o que a
// ação realmente apaga, o que dizer ao usuário antes e quando a confirmação
// está válida. Usadas pelo modal compartilhado e pelas Server Actions de
// Contábil/Pessoal, para que tela e servidor concordem sobre o que acontece.

import { SETOR_LABEL, type UserSetor } from './types'

export type NivelExclusao = 'setor' | 'total'

export interface PlanoExclusaoSetor {
  removeCliente: boolean
  novosSetores: UserSetor[]
}

// "Remover do setor X": tira X de clientes.setores. Se não sobrar setor
// nenhum, a própria linha de clientes deixa de fazer sentido e é apagada
// (com cascata em tudo que referencia o cliente).
export function planejarExclusaoNoSetor(setores: UserSetor[], setor: UserSetor): PlanoExclusaoSetor {
  const novosSetores = setores.filter(s => s !== setor)
  return { removeCliente: novosSetores.length === 0, novosSetores }
}

export interface ImpactoExclusao {
  nivel: NivelExclusao
  titulo: string
  descricao: string
  detalhes: string[]
  exigeDeletar: boolean
  rotuloBotao: string
}

const DETALHES_TOTAL = [
  'Tarefas de todos os meses, com respostas e etapas',
  'Eventos avulsos e anexos',
  'Notas, observações e arquivos do cliente',
  'Grupos de tarefas e histórico de responsável',
]

function listar(setores: UserSetor[]): string {
  return setores.map(s => SETOR_LABEL[s]).join(', ')
}

export function descreverImpactoExclusao(input: {
  origem: UserSetor | 'geral'
  acao: 'remover-do-setor' | 'excluir-do-sistema'
  setoresDoCliente: UserSetor[]
}): ImpactoExclusao {
  const { origem, acao, setoresDoCliente } = input
  const outros = setoresDoCliente.filter(s => s !== origem)

  if (acao === 'remover-do-setor' && origem !== 'geral' && outros.length > 0) {
    const label = SETOR_LABEL[origem]
    return {
      nivel: 'setor',
      titulo: `Remover do ${label}`,
      descricao: `O cliente continua em: ${listar(outros)}. Só os dados dele no ${label} serão apagados.`,
      detalhes: [`Tarefas do ${label} de todos os meses`, `Dados do cliente no ${label}`],
      exigeDeletar: false,
      rotuloBotao: `Remover do ${label}`,
    }
  }

  const afetados = origem === 'geral' ? setoresDoCliente : outros
  const tambem = afetados.length > 0 ? ` Os dados dele em ${listar(afetados)} também serão apagados.` : ''
  return {
    nivel: 'total',
    titulo: 'Excluir cliente',
    descricao: `Apaga o cliente do sistema inteiro.${tambem}`,
    detalhes: DETALHES_TOTAL,
    exigeDeletar: true,
    rotuloBotao: 'Excluir definitivamente',
  }
}

// O nome precisa bater exatamente (mesma caixa, só ignora espaços nas pontas).
// No nível total exige também a palavra DELETAR, em qualquer caixa.
export function confirmacaoExclusaoValida(
  nivel: NivelExclusao,
  nomeCliente: string,
  nomeDigitado: string,
  palavraDigitada: string,
): boolean {
  const nomeOk = nomeDigitado.trim() !== '' && nomeDigitado.trim() === nomeCliente
  if (!nomeOk) return false
  if (nivel === 'setor') return true
  return palavraDigitada.trim().toUpperCase() === 'DELETAR'
}
