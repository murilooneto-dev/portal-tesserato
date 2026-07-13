/** Busca dados de uma empresa pelo CNPJ na BrasilAPI. Retorna null se o CNPJ for inválido/incompleto ou a busca falhar. */
export async function buscarCnpj(cnpjRaw: string): Promise<{ nome?: string; municipio?: string; uf?: string } | null> {
  const digits = cnpjRaw.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      nome: data.razao_social || undefined,
      municipio: data.municipio || undefined,
      uf: data.uf || undefined,
    }
  } catch {
    return null
  }
}
