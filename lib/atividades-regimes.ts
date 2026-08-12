// Mesmos valores usados em components/fiscal/CamposFiscais.tsx (ATIVIDADES
// e GRUPOS) — duplicados deliberadamente aqui em vez de importados de lá,
// pra não criar acoplamento com o Fiscal (ver spec 2026-08-03).

export const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

export const REGIMES = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
  { value: 'isento',  label: 'Isento' },
]

export function labelRegime(regime: string): string {
  return REGIMES.find(r => r.value === regime)?.label ?? regime
}
