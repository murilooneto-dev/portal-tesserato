// tests/setup.ts
//
// `next/experimental/testing/server` acessa `AsyncLocalStorage` a partir de
// `globalThis` assumindo que o runtime do Next já a expôs ali (o que
// acontece normalmente dentro do próprio servidor Next, mas não num script
// Node "puro" como o test runner). Sem isso, o import falha com
// "Invariant: AsyncLocalStorage accessed in runtime where it is not
// available". Precisa ser importado antes de qualquer import de
// 'next/experimental/testing/server'.
import { AsyncLocalStorage } from 'node:async_hooks'

;(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage =
  AsyncLocalStorage
