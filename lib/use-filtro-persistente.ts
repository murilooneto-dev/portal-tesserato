import { useEffect, useState } from 'react'

export function useFiltroPersistente<T>(chave: string, valorInicial: T): [T, (valor: T) => void] {
  const [valor, setValorState] = useState<T>(valorInicial)

  useEffect(() => {
    const salvo = sessionStorage.getItem(chave)
    if (salvo === null) return
    try {
      setValorState(JSON.parse(salvo))
    } catch {
      // valor corrompido no storage — ignora, mantém o default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setValor(novoValor: T) {
    setValorState(novoValor)
    sessionStorage.setItem(chave, JSON.stringify(novoValor))
  }

  return [valor, setValor]
}
