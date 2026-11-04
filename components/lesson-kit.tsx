'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, Check, X, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { graphToSvg, type StateHighlight } from '../lib/graph-svg'
import { SOURCE_COLORS, isAcceptingState, type AutomatonGraph, type StateKind } from '../lib/automaton-graph'
import { regexToNfa } from '../lib/regex-to-nfa'
import { LESSONS, LESSONS_DONE_KEY, LESSON_PROGRESS_KEY, lessonById, readLessonProgress, readLessonsDone, resumeLesson } from '../lib/lessons'
import './lesson.css'

/**
 * Shared pieces for the interactive lessons: tiny machines, running them, the diagram, answer
 * widgets, and the shell that steps through a lesson. Each step asks the learner to do something
 * before Continue unlocks, so the idea is learned by trying, not by reading.
 */

// ---------- Machines ----------

type Spec = [id: string, label: string, kind: StateKind, x: number, y: number, accepting?: boolean]

export function machine(specs: Spec[], edges: [string, string, string][], symbols = ['a', 'b']): AutomatonGraph {
  return {
    symbols,
    states: specs.map(([id, label, kind, x, y, accepting], index) => ({ id, label, kind, accepting, position: { x, y }, color: SOURCE_COLORS[index % SOURCE_COLORS.length] })),
    transitions: edges.map(([source, target, list]) => ({ id: `${source}-${target}`, source, target, symbols: Array.from(list) })),
  }
}

export const labelOf = (graph: AutomatonGraph, id: string) => graph.states.find(state => state.id === id)?.label ?? id

/** Runs a DFA; returns every state visited, stopping early on a missing arrow. */
export function run(graph: AutomatonGraph, input: string): { path: string[]; stuck: boolean } {
  let current = graph.states.find(state => state.kind === 'start')!.id
  const path = [current]
  for (const char of input) {
    const edge = graph.transitions.find(item => item.source === current && item.symbols.includes(char))
    if (!edge) return { path, stuck: true }
    current = edge.target
    path.push(current)
  }
  return { path, stuck: false }
}

export function accepts(graph: AutomatonGraph, input: string): boolean {
  const result = run(graph, input)
  if (result.stuck) return false
  return isAcceptingState(graph.states.find(state => state.id === result.path[result.path.length - 1])!)
}

/** Runs an NFA (ε allowed): the set of live states before any input and after each character. */
export function nfaSets(graph: AutomatonGraph, input: string): string[][] {
  const closure = (seeds: string[]) => {
    const reached = new Set(seeds)
    const pending = [...seeds]
    while (pending.length) {
      const source = pending.pop()!
      for (const edge of graph.transitions) {
        if (edge.source === source && edge.symbols.includes('ε') && !reached.has(edge.target)) { reached.add(edge.target); pending.push(edge.target) }
      }
    }
    return graph.states.map(state => state.id).filter(id => reached.has(id))
  }
  let current = closure([graph.states.find(state => state.kind === 'start')!.id])
  const sets = [current]
  for (const char of input) {
    current = closure(graph.transitions.filter(edge => current.includes(edge.source) && edge.symbols.includes(char)).map(edge => edge.target))
    sets.push(current)
  }
  return sets
}

export function nfaAccepts(graph: AutomatonGraph, input: string): boolean {
  const sets = nfaSets(graph, input)
  return sets[sets.length - 1].some(id => isAcceptingState(graph.states.find(state => state.id === id)!))
}

/** Whether a regex (the workspace's dialect) matches the whole word; null if the regex doesn't parse. */
export function regexMatches(pattern: string, word: string): boolean | null {
  const nfa = regexToNfa(pattern)
  return nfa.ok ? nfaAccepts(nfa.graph, word) : null
}

/** Every string over the alphabet up to a length, shortest first. */
export function allWords(alphabet: string[], maxLength: number): string[] {
  const words = ['']
  for (let at = 0; at < words.length; at++) {
    if (words[at].length >= maxLength) continue
    for (const char of alphabet) words.push(words[at] + char)
  }
  return words
}

// ---------- Widgets ----------

export function Diagram({ graph, current, highlight, activeEdges, onPick, label }: {
  graph: AutomatonGraph; current?: string | string[]; highlight?: Record<string, StateHighlight>; activeEdges?: string[]
  onPick?: (stateId: string) => void; label: string
}) {
  const currentKey = Array.isArray(current) ? current.join(',') : current ?? ''
  const marks = useMemo(() => {
    const list = currentKey ? currentKey.split(',') : []
    return { ...highlight, ...Object.fromEntries(list.map(id => [id, 'current' as const])) }
  }, [highlight, currentKey])
  const edgeKey = (activeEdges ?? []).join(',')
  const svg = useMemo(() => graphToSvg(graph, '', undefined, { themed: true, highlight: marks, activeEdges: edgeKey ? edgeKey.split(',') : [] }), [graph, marks, edgeKey])
  return <div className={`lesson-diagram ${onPick ? 'is-pickable' : ''}`} role="img" aria-label={label}
    onClick={event => {
      const target = (event.target as Element).closest('[data-state]')
      if (target && onPick) onPick(target.getAttribute('data-state')!)
    }} dangerouslySetInnerHTML={{ __html: svg }} />
}

export function Keys({ onPress, chars = ['a', 'b'], disabled }: { onPress: (char: string) => void; chars?: string[]; disabled?: boolean }) {
  return <div className="lesson-keys" role="group" aria-label="Buttons">
    {chars.map(char => <button key={char} type="button" className="lesson-key" disabled={disabled} onClick={() => onPress(char)}>{char}</button>)}
  </div>
}

export function Typed({ input, empty = 'press a button' }: { input: string; empty?: string }) {
  const chars = Array.from(input)
  return <div className="lesson-typed" aria-label={input ? `Typed ${chars.join(' ')}` : 'Nothing typed yet'}>
    {chars.length ? chars.slice(-14).map((char, index) => <span key={index}>{char}</span>) : <em>{empty}</em>}
  </div>
}

export function Feedback({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <p className={`lesson-feedback ${ok ? 'is-ok' : 'is-wrong'}`} role="status">
    {ok ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}<span>{children}</span>
  </p>
}

export function Choices<T extends string>({ options, picked, answer, onPick }: { options: { value: T; label: ReactNode }[]; picked: T | null; answer: T; onPick: (value: T) => void }) {
  return <div className="lesson-choices" role="radiogroup">
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={picked === option.value}
      className={`lesson-choice ${picked === option.value ? (option.value === answer ? 'is-right' : 'is-wrong') : ''}`}
      onClick={() => onPick(option.value)}>{option.label}</button>)}
  </div>
}

/**
 * "Accept or reject?" for a list of strings: the learner decides each one, then checks. Solved when
 * every answer is right. `explain` shows under a row after checking (for example the path taken).
 */
export function PredictList({ words, truth, onSolved, yes = 'accept', no = 'reject', explain, success }: {
  words: string[]; truth: (word: string) => boolean; onSolved: () => void; yes?: string; no?: string
  explain?: (word: string) => ReactNode; success: ReactNode
}) {
  const [guesses, setGuesses] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState(false)
  const allRight = words.every(word => guesses[word] === truth(word))
  const guess = (word: string, value: boolean) => { setGuesses(current => ({ ...current, [word]: value })); setChecked(false) }
  return <>
    <div className="lesson-predict">
      {words.map(word => <div key={word} className={`lesson-predict-row ${checked ? (guesses[word] === truth(word) ? 'is-right' : 'is-wrong') : ''}`}>
        <code>{word || 'ε'}</code>
        <div role="radiogroup" aria-label={`${word || 'the empty string'}: ${yes} or ${no}?`}>
          <button type="button" role="radio" aria-checked={guesses[word] === true} onClick={() => guess(word, true)}><Check size={14} aria-hidden="true" /> {yes}</button>
          <button type="button" role="radio" aria-checked={guesses[word] === false} onClick={() => guess(word, false)}><X size={14} aria-hidden="true" /> {no}</button>
        </div>
        {checked && explain && <small>{explain(word)}</small>}
      </div>)}
    </div>
    <button type="button" className="primary-button lesson-check" disabled={words.some(word => guesses[word] === undefined)}
      onClick={() => { setChecked(true); if (allRight) onSolved() }}>Check</button>
    {checked && (allRight ? <Feedback ok>{success}</Feedback>
      : <Feedback ok={false}>Some are off{explain ? '. Each row now shows why' : ''}. Change your answers and check again.</Feedback>)}
  </>
}

/** A row of test strings that pass or fail live, for "build one yourself" steps. */
export function TestList({ rows, yes = 'should accept', no = 'should reject' }: { rows: { word: string; want: boolean; got: boolean | null }[]; yes?: string; no?: string }) {
  return <ul className="lesson-tests" aria-label="Test strings">
    {rows.map(row => <li key={row.word} className={row.got === row.want ? 'is-pass' : 'is-fail'}>
      <code>{row.word || 'ε'}</code><span>{row.want ? yes : no}</span>{row.got === row.want ? <Check size={14} aria-label="passes" /> : <X size={14} aria-label="fails" />}
    </li>)}
  </ul>
}

/** Marks the step solved once a condition holds (for steps solved by building something). */
export function useSolvedWhen(condition: boolean, solved: boolean, onSolved: () => void) {
  useEffect(() => { if (condition && !solved) onSolved() }, [condition, solved, onSolved])
}

export function Learned({ items }: { items: ReactNode[] }) {
  return <ul className="lesson-learned">{items.map((item, index) => <li key={index}><Check size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul>
}

// ---------- The lesson shell ----------

export type StepProps = { onSolved: () => void; solved: boolean }
export type LessonStep = { title: string; Body: (props: StepProps) => ReactNode; free?: boolean }

function markLessonDone(id: string) {
  try {
    const done = readLessonsDone(localStorage.getItem(LESSONS_DONE_KEY))
    if (!done.includes(id)) localStorage.setItem(LESSONS_DONE_KEY, JSON.stringify([...done, id]))
  } catch { /* Progress is a convenience; the lesson works without storage. */ }
}

export function LessonShell({ id, steps }: { id: string; steps: LessonStep[] }) {
  const lesson = lessonById(id)!
  const next = LESSONS.find(item => item.number === lesson.number + 1)
  const [index, setIndex] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => steps.map(step => !!step.free))
  const [loaded, setLoaded] = useState(false)
  // Pick up where this browser left off. Runs after the first render so the static HTML matches.
  useEffect(() => {
    try {
      const finished = readLessonsDone(localStorage.getItem(LESSONS_DONE_KEY)).includes(id)
      const resumed = resumeLesson(readLessonProgress(localStorage.getItem(LESSON_PROGRESS_KEY))[id], steps.map(step => !!step.free), finished)
      setIndex(resumed.step)
      setSolved(resumed.solved)
    } catch { /* No storage: start at step 1. */ }
    setLoaded(true)
  }, [id, steps])
  useEffect(() => {
    if (!loaded) return
    try {
      const all = readLessonProgress(localStorage.getItem(LESSON_PROGRESS_KEY))
      localStorage.setItem(LESSON_PROGRESS_KEY, JSON.stringify({ ...all, [id]: { step: index, solved } }))
    } catch { /* Progress is a convenience; the lesson works without storage. */ }
  }, [loaded, id, index, solved])
  const solveCurrent = useCallback(() => setSolved(current => current[index] ? current : current.map((value, at) => at === index ? true : value)), [index])
  const last = index === steps.length - 1
  useEffect(() => { if (last) markLessonDone(id) }, [last, id])
  const step = steps[index]
  const Body = step.Body
  const go = (at: number) => { setIndex(at); window.scrollTo({ top: 0 }) }
  return <div className="lesson-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="lesson-main">
      <header className="lesson-head">
        <Link className="lesson-back" href="/learn"><ArrowLeft size={14} aria-hidden="true" /> All lessons</Link>
        <p className="eyebrow">Lesson {lesson.number} · {lesson.title}</p>
        <div className="lesson-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((item, at) => <button key={at} type="button" className={`${at === index ? 'is-current' : ''} ${solved[at] && !item.free ? 'is-solved' : ''}`}
            disabled={at > index && !solved.slice(0, at).every(Boolean)} onClick={() => go(at)} aria-label={`Step ${at + 1}: ${item.title}`} />)}
        </div>
      </header>
      <section className="lesson-card" aria-labelledby="lesson-title">
        <h1 id="lesson-title"><span>{index + 1}</span>{step.title}</h1>
        <Body key={index} onSolved={solveCurrent} solved={solved[index]} />
        <footer className="lesson-nav">
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
          {!last && <button type="button" className="primary-button" disabled={!solved[index]} onClick={() => go(index + 1)}
            title={solved[index] ? undefined : 'Do the task above to continue'}>Continue <ArrowRight size={14} aria-hidden="true" /></button>}
          {last && (next
            ? <Link className="primary-button" href={`/learn/${next.id}`}>Next: {next.title} <ArrowRight size={14} aria-hidden="true" /></Link>
            : <Link className="primary-button" href="/learn">All lessons <ArrowRight size={14} aria-hidden="true" /></Link>)}
        </footer>
      </section>
    </main>
  </div>
}
