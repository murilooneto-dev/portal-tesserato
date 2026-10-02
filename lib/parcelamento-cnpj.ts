// Regra do CNPJ no formulario de parcelamento (decisao do usuario, 02/10):
// o parcelamento liga ao cliente pelo CNPJ exato, entao com cliente
// cadastrado o campo segue o CNPJ do cliente e nao e editavel; so "empresa
// avulsa" permite digitar. Cliente sem CNPJ gera um aviso (salvar continua
// permitido).

export interface ClienteParaCnpj {
  nome: string
  cnpj: string | null
}

export interface DecisaoCnpj {
  /** Valor que o campo mostra e que vai no payload. */
  valor: string | null
  editavel: boolean
  /** Cliente cadastrado escolhido, mas sem CNPJ no cadastro. */
  avisoSemCnpj: boolean
}

export const AVISO_CLIENTE_SEM_CNPJ =
  'Este cliente não tem CNPJ no cadastro: o parcelamento não vai gerar tarefa nem aviso na ficha. Cadastre o CNPJ do cliente primeiro.'

export function decidirCnpj(entrada: {
  avulsa: boolean
  empresa: string
  cnpjAtual: string | null
  clientes: ClienteParaCnpj[]
}): DecisaoCnpj {
  const { avulsa, empresa, cnpjAtual, clientes } = entrada
  if (avulsa) return { valor: cnpjAtual, editavel: true, avisoSemCnpj: false }
  // Dois clientes podem ter o mesmo nome: ao editar, se o CNPJ gravado e de um
  // deles, ele e mantido (nao troca de cliente); senao vale o primeiro com o nome.
  const cliente =
    clientes.find(c => c.nome === empresa && cnpjAtual !== null && c.cnpj === cnpjAtual) ??
    clientes.find(c => c.nome === empresa)
  if (!cliente) return { valor: cnpjAtual, editavel: false, avisoSemCnpj: false }
  const cnpj = cliente.cnpj?.trim() ? cliente.cnpj : null
  return { valor: cnpj, editavel: false, avisoSemCnpj: cnpj === null }
}
