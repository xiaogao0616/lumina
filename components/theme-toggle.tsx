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
  const dark = theme === 'dark'
  return <button type="button" role="switch" aria-checked={dark} className={`theme-switch ${dark ? 'is-dark' : ''}`} onClick={toggle}
    title={dark ? 'Dark theme on. Click for light' : 'Light theme on. Click for dark'} aria-label="Dark theme">
    <span className="theme-switch-knob" aria-hidden="true" />
    <Sun size={14} aria-hidden="true" /><Moon size={14} aria-hidden="true" />
  </button>
}
