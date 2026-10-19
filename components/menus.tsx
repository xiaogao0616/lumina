'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Button + floating panel (menus, help, diagnostics). Closes on outside pointerdown or Escape. */
export function Dropdown({ label, trigger, title, className = '', triggerClassName = 'tool-button', align = 'start', role = 'menu', children }: {
  label: string; trigger: React.ReactNode; title?: string; className?: string; triggerClassName?: string
  align?: 'start' | 'end'; role?: 'menu' | 'dialog'; children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as globalThis.Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown) }
  }, [open])
  return <div ref={rootRef} className={`dropdown ${className}`}>
    <button type="button" className={triggerClassName} aria-haspopup={role === 'menu' ? 'menu' : 'dialog'} aria-expanded={open}
      aria-label={label} title={title} onClick={() => setOpen(value => !value)}>{trigger}</button>
    {open && <div className={`dropdown-panel is-${align} is-${role}`} role={role} aria-label={label}>{children(() => setOpen(false))}</div>}
  </div>
}

export function MenuItem({ icon: Icon, label, hint, disabled, onSelect, close }: {
  icon: LucideIcon; label: string; hint?: string; disabled?: boolean; onSelect: () => void; close: () => void
}) {
  return <button type="button" className="menu-item" role="menuitem" disabled={disabled} onClick={() => { close(); onSelect() }}>
    <Icon size={16} aria-hidden="true" /><span className="menu-item-copy"><span>{label}</span>{hint && <small>{hint}</small>}</span>
  </button>
}
