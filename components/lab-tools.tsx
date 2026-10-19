'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight, Check, CircleCheck, CircleX, Copy, GitCompareArrows, GraduationCap, Lightbulb, Link2, Play, Regex, TriangleAlert, X,
  type LucideIcon,
} from 'lucide-react'
import type { AutomatonGraph } from '../lib/automaton-graph'
import { automatonToRegex, combineAutomata, compareAutomata, type Comparison, type SetOperation } from '../lib/regular-ops'
import { regexToNfa } from '../lib/regex-to-nfa'
import { EXERCISES, type Exercise, type ExerciseVerdict } from '../lib/exercises'
import { encodeShare, type ShareContent } from '../lib/share-link'
import './lab-tools.css'

/** The address that opens a copy of a tab: the save rides in the fragment, which never reaches a server. */
export async function shareUrl(content: ShareContent): Promise<string> {
  const code = await encodeShare(content)
  return `${location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/${content.mode}/#share=${code}`
}

export function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** How a string reads in a result: the empty string is shown as ε. */
export const showWord = (word: string) => word === '' ? 'ε' : word

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }, () => setCopied(false))
  }
  return [copied, copy]
}

export function ToolModal({ title, icon: Icon, className = '', onClose, children, actions }: {
  title: string; icon: LucideIcon; className?: string; onClose: () => void; children: ReactNode; actions?: ReactNode
}) {
  // Escape closes the dialog wherever focus is (it often stays on the menu item that opened it).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])
  return <div className="modal-overlay" role="presentation" onClick={onClose}>
    <div className={`modal-box tool-modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation() }}>
      <h3><Icon className="modal-icon tool-modal-icon" size={17} aria-hidden="true" /> {title}
        <button type="button" className="tool-close" aria-label="Close" onClick={onClose}><X size={14} /></button></h3>
      {children}
      <div className="modal-actions">{actions ?? <button type="button" className="modal-button" onClick={onClose}>Close</button>}</div>
    </div>
  </div>
}

/** A string from a result, with a button that puts it in the test input. */
function WordRow({ word, children, onUse }: { word: string; children: ReactNode; onUse?: (word: string) => void }) {
  return <li className="word-row">
    <code className="word-chip">{showWord(word)}</code>
    <span>{children}</span>
    {onUse && <button type="button" className="secondary-button word-try" onClick={() => onUse(word)} title="Put this string in the test input"><Play size={12} aria-hidden="true" /> Try it</button>}
  </li>
}

export type PeerTab = { id: string; title: string; graph: AutomatonGraph | null }

const operations: { op: SetOperation; swap?: boolean; label: string; symbol: string }[] = [
  { op: 'union', label: 'Union', symbol: 'A ∪ B' },
  { op: 'intersection', label: 'Intersection', symbol: 'A ∩ B' },
  { op: 'difference', label: 'Difference', symbol: 'A − B' },
  { op: 'difference', swap: true, label: 'Difference', symbol: 'B − A' },
]

/**
 * Compare this tab's language with another tab or a regex, or build their union, intersection or
 * difference as a new DFA tab. A is always this tab, B the other machine.
 */
export function CompareDialog({ graph, title, peers, onOpen, onUse, onClose }: {
  graph: AutomatonGraph; title: string; peers: PeerTab[]
  onOpen: (graph: AutomatonGraph, title: string) => void; onUse: (word: string) => void; onClose: () => void
}) {
  const usable = peers.filter(peer => peer.graph)
  const [source, setSource] = useState<'tab' | 'regex'>(usable.length ? 'tab' : 'regex')
  const [peerId, setPeerId] = useState(usable[0]?.id ?? '')
  const [pattern, setPattern] = useState('')
  const [result, setResult] = useState<{ comparison: Comparison; other: string } | null>(null)
  const [error, setError] = useState('')

  const other = (): { ok: true; graph: AutomatonGraph; name: string } | { ok: false; message: string } => {
    if (source === 'tab') {
      const peer = usable.find(item => item.id === peerId)
      return peer?.graph ? { ok: true, graph: peer.graph, name: peer.title } : { ok: false, message: 'Pick a tab to compare with.' }
    }
    if (!pattern.trim()) return { ok: false, message: 'Type a regular expression, like (a|b)*ab.' }
    const built = regexToNfa(pattern)
    return built.ok ? { ok: true, graph: built.graph, name: `/${pattern.trim()}/` } : { ok: false, message: built.message }
  }
  const check = () => {
    setResult(null)
    const b = other()
    if (!b.ok) { setError(b.message); return }
    const compared = compareAutomata(graph, b.graph)
    if (!compared.ok) { setError(compared.message.replace('First machine', 'This tab').replace('Second machine', b.name)); return }
    setError('')
    setResult({ comparison: compared.comparison, other: b.name })
  }
  const combine = (op: SetOperation, swap: boolean, symbol: string) => {
    const b = other()
    if (!b.ok) { setError(b.message); return }
    const combined = swap ? combineAutomata(b.graph, graph, op) : combineAutomata(graph, b.graph, op)
    if (!combined.ok) { setError(combined.message.replace('First machine', swap ? b.name : 'This tab').replace('Second machine', swap ? 'This tab' : b.name)); return }
    const [left, right] = swap ? [b.name, title] : [title, b.name]
    onOpen(combined.graph, `${left} ${symbol.split(' ')[1]} ${right}`)
    onClose()
  }
  const use = (word: string) => { onUse(word); onClose() }
  const comparison = result?.comparison

  return <ToolModal title="Compare or combine" icon={GitCompareArrows} className="compare-dialog" onClose={onClose}>
    <p className="tool-lead"><b>A</b> is this tab, <em>{title}</em>. Pick <b>B</b>:</p>
    <div className="tool-segment" role="tablist" aria-label="Compare with">
      <button type="button" role="tab" aria-selected={source === 'tab'} onClick={() => { setSource('tab'); setResult(null); setError('') }}>Another tab</button>
      <button type="button" role="tab" aria-selected={source === 'regex'} onClick={() => { setSource('regex'); setResult(null); setError('') }}>A regex</button>
    </div>
    {source === 'tab'
      ? usable.length
        ? <label className="tool-field">Tab B<select value={peerId} onChange={event => { setPeerId(event.target.value); setResult(null) }}>
          {usable.map(peer => <option key={peer.id} value={peer.id}>{peer.title}</option>)}
        </select></label>
        : <p className="tool-note">Open another DFA or NFA tab first, or compare with a regex.</p>
      : <label className="tool-field">Regex B<input value={pattern} autoFocus spellCheck={false} autoComplete="off" placeholder="e.g. (a|b)*ab"
        onChange={event => { setPattern(event.target.value); setResult(null); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter') check() }} /></label>}
    <button type="button" className="modal-button is-primary tool-wide" onClick={check}><GitCompareArrows size={14} aria-hidden="true" /> Check if A and B accept the same strings</button>
    {error && <p className="tool-error" role="alert"><TriangleAlert size={14} aria-hidden="true" /> {error}</p>}
    {comparison && (comparison.equivalent
      ? <p className="tool-verdict is-good" role="status"><CircleCheck size={16} aria-hidden="true" /> Same language. Every string gets the same answer from both.</p>
      : <div className="tool-verdict is-bad" role="status">
        <p><CircleX size={16} aria-hidden="true" /> Different languages. The shortest strings that tell them apart:</p>
        <ul className="word-list">
          {comparison.onlyFirst !== null && <WordRow word={comparison.onlyFirst} onUse={use}>accepted by A, rejected by B</WordRow>}
          {comparison.onlySecond !== null && <WordRow word={comparison.onlySecond} onUse={use}>accepted by B, rejected by A</WordRow>}
        </ul>
        {comparison.onlyFirst === null && <p className="tool-note">Everything A accepts, B accepts too: A’s language is inside B’s.</p>}
        {comparison.onlySecond === null && <p className="tool-note">Everything B accepts, A accepts too: B’s language is inside A’s.</p>}
      </div>)}
    <div className="tool-divider"><span>Or build a new DFA tab</span></div>
    <div className="combine-grid">
      {operations.map(item => <button key={item.symbol} type="button" className="secondary-button combine-button" onClick={() => combine(item.op, !!item.swap, item.symbol)}>
        <b>{item.symbol}</b><small>{item.label}</small>
      </button>)}
    </div>
    <p className="tool-note">Built with the product construction, then minimized.</p>
  </ToolModal>
}

/** The machine's language as a regular expression, found by state elimination. */
export function RegexDialog({ graph, onOpenNfa, onClose }: { graph: AutomatonGraph; onOpenNfa: (graph: AutomatonGraph, pattern: string) => void; onClose: () => void }) {
  const result = useMemo(() => automatonToRegex(graph), [graph])
  const [copied, copy] = useCopy()
  const openNfa = () => {
    if (!result.ok || result.empty) return
    const built = regexToNfa(result.pattern)
    if (built.ok) { onOpenNfa(built.graph, result.pattern); onClose() }
  }
  return <ToolModal title="Regular expression" icon={Regex} onClose={onClose}
    actions={result.ok && !result.empty ? <>
      <button type="button" className="modal-button" onClick={onClose}>Close</button>
      <button type="button" className="modal-button is-primary" onClick={openNfa} title="Builds the NFA with Thompson's construction in a new tab">Open as NFA tab</button>
    </> : undefined}>
    {!result.ok ? <p className="tool-error" role="alert"><TriangleAlert size={14} aria-hidden="true" /> {result.message}</p>
      : result.empty ? <p className="tool-verdict">No accepting state can be reached, so this machine accepts nothing. Its language is ∅, which this regex syntax has no way to write.</p>
      : <>
        <div className="regex-result">
          <code>{result.display}</code>
          <button type="button" className="secondary-button" onClick={() => copy(result.pattern)} title="Copy in the Regex → NFA syntax">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="tool-note">Found by state elimination: unreachable and dead states go first, then each state is ripped out and its loops become a star. <code>x+</code> means <code>xx*</code> and <code>x?</code> means <code>x|ε</code>. This syntax is the one Regex → NFA reads, so you can paste it back in.</p>
      </>}
  </ToolModal>
}

export function ShareDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [copied, copy] = useCopy()
  return <ToolModal title="Share link" icon={Link2} onClose={onClose}>
    {url ? <>
      <div className="share-row">
        <input className="modal-input" readOnly value={url} onFocus={event => event.target.select()} aria-label="Share link" />
        <button type="button" className="secondary-button" onClick={() => copy(url)}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="tool-note">The whole tab is packed into the link itself, so nothing is uploaded anywhere. Whoever opens it gets their own copy in a new tab; your version stays as it is.</p>
    </> : <p className="tool-note">Making the link…</p>}
  </ToolModal>
}

const levelName = { 1: 'Warm-up', 2: 'Practice', 3: 'Challenge' }

export function PracticeDialog({ solved, onStart, onClose }: { solved: string[]; onStart: (exercise: Exercise) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'dfa' | 'nfa'>('dfa')
  const list = EXERCISES.filter(exercise => exercise.mode === mode)
  const done = EXERCISES.filter(exercise => solved.includes(exercise.id)).length
  return <ToolModal title="Practice" icon={GraduationCap} className="practice-dialog" onClose={onClose}>
    <p className="tool-lead">Pick a language and build a machine for it. <b>Check</b> compares your machine with the answer exactly, so any correct design passes, and a wrong one shows the shortest string it gets wrong.</p>
    <div className="practice-progress"><span className="practice-progress-bar"><span style={{ width: `${(done / EXERCISES.length) * 100}%` }} /></span><b>{done} of {EXERCISES.length} solved</b></div>
    <div className="tool-segment" role="tablist" aria-label="Machine type">
      <button type="button" role="tab" aria-selected={mode === 'dfa'} onClick={() => setMode('dfa')}>Build a DFA</button>
      <button type="button" role="tab" aria-selected={mode === 'nfa'} onClick={() => setMode('nfa')}>Build an NFA</button>
    </div>
    <ul className="practice-list">
      {list.map(exercise => <li key={exercise.id} className={`practice-item is-${exercise.mode} ${solved.includes(exercise.id) ? 'is-solved' : ''}`}>
        <span className="practice-level" title={levelName[exercise.level]} aria-label={levelName[exercise.level]}>{[1, 2, 3].map(dot => <i key={dot} className={dot <= exercise.level ? 'is-on' : ''} />)}</span>
        <span className="practice-copy"><b>{exercise.title}</b><small>{exercise.prompt}</small></span>
        {solved.includes(exercise.id) && <span className="practice-solved" title="Solved"><Check size={14} aria-hidden="true" /></span>}
        <button type="button" className="secondary-button" onClick={() => { onStart(exercise); onClose() }}>Start <ArrowRight size={13} aria-hidden="true" /></button>
      </li>)}
    </ul>
  </ToolModal>
}

/** The problem statement above a practice tab's canvas, with Check and its verdict. */
export function ExerciseBanner({ exercise, verdict, onCheck, onUse }: {
  exercise: Exercise; verdict: ExerciseVerdict | null; onCheck: () => void; onUse: (word: string) => void
}) {
  const [hintOpen, setHintOpen] = useState(false)
  return <section className={`exercise-banner is-${exercise.mode} ${verdict ? `is-${verdict.status}` : ''}`} aria-label="Practice exercise">
    <div className="exercise-main">
      <span className="exercise-badge"><GraduationCap size={13} aria-hidden="true" /> {exercise.mode.toUpperCase()} · {levelName[exercise.level]}</span>
      <div className="exercise-copy">
        <h2>{exercise.title}</h2>
        <p>{exercise.prompt} <span className="exercise-alphabet">Σ = {'{'}{exercise.alphabet.join(', ')}{'}'}</span></p>
        {hintOpen && <p className="exercise-hint"><Lightbulb size={13} aria-hidden="true" /> {exercise.hint}</p>}
      </div>
      <div className="exercise-actions">
        <button type="button" className="text-button" aria-expanded={hintOpen} onClick={() => setHintOpen(open => !open)}>{hintOpen ? 'Hide hint' : 'Hint'}</button>
        <button type="button" className="primary-button" onClick={onCheck}><CircleCheck size={15} aria-hidden="true" /> Check my answer</button>
      </div>
    </div>
    {verdict && <div className="exercise-verdict" role="status">
      {verdict.status === 'correct' ? <p><CircleCheck size={16} aria-hidden="true" /> <b>Correct!</b> Your machine accepts exactly this language. 🎉</p>
        : verdict.status === 'error' ? <p><TriangleAlert size={16} aria-hidden="true" /> {verdict.message}</p>
        : <><p><CircleX size={16} aria-hidden="true" /> <b>Not yet.</b> The shortest string{verdict.accepts !== null && verdict.rejects !== null ? 's' : ''} your machine gets wrong:</p>
          <ul className="word-list">
            {verdict.accepts !== null && <WordRow word={verdict.accepts} onUse={onUse}>is accepted, but shouldn’t be</WordRow>}
            {verdict.rejects !== null && <WordRow word={verdict.rejects} onUse={onUse}>is rejected, but should be accepted</WordRow>}
          </ul></>}
    </div>}
  </section>
}
