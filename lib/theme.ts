'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tesserato-theme'

export type Theme = 'dark' | 'light'

function lerTemaAtual(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(lerTemaAtual())
  }, [])

  function toggleTheme() {
    const novo: Theme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('light', novo === 'light')
    localStorage.setItem(STORAGE_KEY, novo)
    setTheme(novo)
  }

  return { theme, toggleTheme }
}
