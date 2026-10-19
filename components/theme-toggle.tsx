'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export const THEME_STORAGE_KEY = 'automata-lab-theme'
type Theme = 'light' | 'dark'

/** Flips data-theme on <html>. The initial value is set before paint by the script in app/layout.tsx. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') }, [])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* private mode: the choice lasts this page only */ }
    setTheme(next)
  }
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return <button type="button" className="icon-button theme-toggle" onClick={toggle} title={label} aria-label={label}>
    {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
  </button>
}
