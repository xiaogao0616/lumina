'use client'

import { useEffect, useRef, useState } from 'react'

/** Decorative automaton on the home page that keeps reading example words and accepting them. */
const NODES = [
  { id: 'q0', x: 70, y: 150, label: 'q₀', fill: 'var(--dfa-fill)' },
  { id: 'q1', x: 220, y: 70, label: 'q₁', fill: 'var(--pda-fill)' },
  { id: 'q2', x: 360, y: 170, label: 'q₂', fill: 'var(--cfg-fill)', accept: true },
]
const EDGES = [
  { id: 'q0-q1', d: 'M104 130 Q140 80 184 74', label: { x: 130, y: 92, t: 'a' }, to: 'q1' },
  { id: 'q1-q2', d: 'M254 88 Q310 110 326 146', label: { x: 302, y: 104, t: 'b' }, to: 'q2' },
  { id: 'q0-q2', d: 'M108 158 Q220 230 322 180', label: { x: 220, y: 206, t: 'ε' }, to: 'q2' },
  { id: 'q1-q1', d: 'M204 38 C190 -4 252 -4 238 38', label: { x: 221, y: 8, t: 'a' }, to: 'q1' },
]
// Each word is the input and the edges its accepting run takes (an ε-move reads nothing).
const WORDS = [
  { input: 'aab', path: ['q0-q1', 'q1-q1', 'q1-q2'] },
  { input: 'ab', path: ['q0-q1', 'q1-q2'] },
  { input: '', path: ['q0-q2'] },
]
const STEP_MS = 850
const HOLD_MS = 1400

export function HeroAutomaton() {
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({})
  const [frame, setFrame] = useState({ word: 0, step: 0, progress: 0, done: false })
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    if (query.matches) return
    let raf = 0
    let word = 0
    let start = performance.now()
    const tick = (now: number) => {
      const steps = WORDS[word].path.length
      const elapsed = Math.max(0, now - start) // rAF timestamps can predate `start`
      if (elapsed >= steps * STEP_MS + HOLD_MS) { word = (word + 1) % WORDS.length; start = now }
      else {
        const step = Math.min(steps - 1, Math.floor(elapsed / STEP_MS))
        const done = elapsed >= steps * STEP_MS
        setFrame({ word, step, progress: done ? 1 : (elapsed - step * STEP_MS) / STEP_MS, done })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const current = WORDS[frame.word]
  const edgeId = current.path[frame.step]
  const edge = EDGES.find(item => item.id === edgeId)!
  const path = pathRefs.current[edgeId]
  const eased = 1 - Math.pow(1 - frame.progress, 3)
  const point = path ? path.getPointAtLength(path.getTotalLength() * eased) : null
  // The state the token is at (or heading to once it arrives).
  const at = frame.progress >= 1 || frame.done ? edge.to : frame.step === 0 ? 'q0' : EDGES.find(item => item.id === current.path[frame.step - 1])!.to
  // Characters read so far: every non-ε edge fully taken.
  const read = current.path.slice(0, frame.done ? current.path.length : frame.step)
    .filter(id => EDGES.find(item => item.id === id)!.label.t !== 'ε').length

  return <figure className={`hero-automaton ${reduced ? 'is-still' : ''}`} aria-hidden="true">
    <svg className="lab-hero-art" viewBox="0 0 430 250">
      <defs><marker id="art-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path className="art-head" d="M0 0 L10 5 L0 10 Z" /></marker></defs>
      <path className="art-edge" d="M4 150 H30" markerEnd="url(#art-arrow)" />
      {EDGES.map(item => <path key={item.id} ref={element => { pathRefs.current[item.id] = element }}
        className={`art-edge ${!reduced && item.id === edgeId && !frame.done ? 'is-active' : ''}`} d={item.d} markerEnd="url(#art-arrow)" />)}
      {NODES.map((node, index) => <g key={node.id} className={`art-state ${!reduced && node.id === at ? 'is-current' : ''} ${!reduced && frame.done && node.accept ? 'is-accepting' : ''}`}
        style={{ animationDelay: `${index * -1.1}s` }}>
        <circle className="art-shadow" cx={node.x + 5} cy={node.y + 5} r="36" />
        <circle className="art-node" cx={node.x} cy={node.y} r="36" style={{ fill: node.fill }} />
        {node.accept && <circle className="art-node" cx={node.x} cy={node.y} r="28" style={{ fill: 'none' }} />}
        <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central">{node.label}</text>
      </g>)}
      {EDGES.map(item => <g key={item.id} className={`art-label ${!reduced && item.id === edgeId && !frame.done ? 'is-active' : ''}`}>
        <rect x={item.label.x - 13} y={item.label.y - 12} width="26" height="24" rx="4" />
        <text x={item.label.x} y={item.label.y} textAnchor="middle" dominantBaseline="central">{item.label.t}</text>
      </g>)}
      {!reduced && point && !frame.done && <circle className="art-token" cx={point.x} cy={point.y} r="8" />}
    </svg>
    {!reduced && <figcaption className="hero-tape">
      <span className="hero-tape-label">input</span>
      <span className="hero-tape-cells">{current.input
        ? Array.from(current.input).map((char, index) => <span key={index} className={index < read ? 'is-read' : index === read && !frame.done ? 'is-next' : ''}>{char}</span>)
        : <span className={frame.done ? 'is-read' : 'is-next'}>ε</span>}</span>
      <span className={`hero-tape-verdict ${frame.done ? 'is-shown' : ''}`}>accepted ✓</span>
    </figcaption>}
  </figure>
}
