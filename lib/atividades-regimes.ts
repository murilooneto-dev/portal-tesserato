// Usado pelo filtro e pelo badge de regime das telas de listagem do
// Contábil e Pessoal (ClientesListaContabil.tsx/ClientesListaPessoal.tsx)
// — o cadastro do cliente em si (EmpresaContabilModal/EmpresaPessoalModal)
// passou a puxar as opções do catálogo (lib/catalogo-cliente.ts) em vez
// dessa lista fixa; ela continua existindo só pra esses dois pontos.
export const REGIMES = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
  { value: 'isento',  label: 'Isento' },
]

export function labelRegime(regime: string): string {
  return REGIMES.find(r => r.value === regime)?.label ?? regime
}
