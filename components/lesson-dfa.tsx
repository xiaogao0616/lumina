'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Lock, LockOpen, RotateCcw, X, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { graphToSvg, type StateHighlight } from '../lib/graph-svg'
import { SOURCE_COLORS, isAcceptingState, type AutomatonGraph, type StateKind } from '../lib/automaton-graph'
import './lesson.css'

/**
 * Lesson 1: what a DFA is, for someone who has never seen one. One idea per step, and each step
 * asks the learner to do something before Continue unlocks, so it is learned by trying, not reading.
 */

// ---------- Machines used in the lesson ----------

type Spec = [id: string, label: string, kind: StateKind, x: number, y: number, accepting?: boolean]

function machine(specs: Spec[], edges: [string, string, string][]): AutomatonGraph {
  return {
    symbols: ['a', 'b'],
    states: specs.map(([id, label, kind, x, y, accepting], index) => ({ id, label, kind, accepting, position: { x, y }, color: SOURCE_COLORS[index % SOURCE_COLORS.length] })),
    transitions: edges.map(([source, target, symbols]) => ({ id: `${source}-${target}`, source, target, symbols: symbols.split('') })),
  }
}

// A lock that opens when the last two buttons pressed were a then b.
const LOCK = machine(
  [['n', 'start', 'start', 0, 170], ['a', 'saw a', 'state', 240, 0], ['o', 'open', 'accept', 480, 170]],
  [['n', 'n', 'b'], ['n', 'a', 'a'], ['a', 'a', 'a'], ['a', 'o', 'b'], ['o', 'a', 'a'], ['o', 'n', 'b']],
)
// The same lock with one arrow missing: "open" has nowhere to go on a.
const BROKEN = { ...LOCK, transitions: LOCK.transitions.filter(edge => edge.id !== 'o-a') }

/** Runs a DFA; returns every state visited, or stops early (null next) on a missing arrow. */
function run(graph: AutomatonGraph, input: string): { path: string[]; stuck: boolean } {
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
const accepts = (graph: AutomatonGraph, input: string) => {
  const result = run(graph, input)
  if (result.stuck) return false
  const last = graph.states.find(state => state.id === result.path[result.path.length - 1])!
  return isAcceptingState(last)
}
const labelOf = (graph: AutomatonGraph, id: string) => graph.states.find(state => state.id === id)?.label ?? id

// ---------- Small building blocks ----------

function Diagram({ graph, current, highlight, activeEdge, onPick, label }: {
  graph: AutomatonGraph; current?: string; highlight?: Record<string, StateHighlight>; activeEdge?: string | null
  onPick?: (stateId: string) => void; label: string
}) {
  const marks = useMemo(() => ({ ...highlight, ...(current ? { [current]: 'current' as const } : {}) }), [highlight, current])
  const svg = useMemo(() => graphToSvg(graph, '', undefined, { themed: true, highlight: marks, activeEdges: activeEdge ? [activeEdge] : [] }), [graph, marks, activeEdge])
  return <div className={`lesson-diagram ${onPick ? 'is-pickable' : ''}`} role="img" aria-label={label}
    onClick={event => {
      const target = (event.target as Element).closest('[data-state]')
      if (target && onPick) onPick(target.getAttribute('data-state')!)
    }} dangerouslySetInnerHTML={{ __html: svg }} />
}

function Keys({ onPress, disabled }: { onPress: (char: string) => void; disabled?: boolean }) {
  return <div className="lesson-keys" role="group" aria-label="Buttons">
    {['a', 'b'].map(char => <button key={char} type="button" className="lesson-key" disabled={disabled} onClick={() => onPress(char)}>{char}</button>)}
  </div>
}

function Typed({ input }: { input: string }) {
  const chars = Array.from(input)
  return <div className="lesson-typed" aria-label={input ? `Pressed ${chars.join(' ')}` : 'Nothing pressed yet'}>
    {chars.length ? chars.slice(-12).map((char, index) => <span key={index}>{char}</span>) : <em>press a button</em>}
  </div>
}

function Feedback({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <p className={`lesson-feedback ${ok ? 'is-ok' : 'is-wrong'}`} role="status">
    {ok ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}<span>{children}</span>
  </p>
}

function Choices<T extends string>({ options, picked, answer, onPick }: { options: { value: T; label: ReactNode }[]; picked: T | null; answer: T; onPick: (value: T) => void }) {
  return <div className="lesson-choices" role="radiogroup">
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={picked === option.value}
      className={`lesson-choice ${picked === option.value ? (option.value === answer ? 'is-right' : 'is-wrong') : ''}`}
      onClick={() => onPick(option.value)}>{option.label}</button>)}
  </div>
}

// ---------- The steps ----------

type StepProps = { onSolved: () => void; solved: boolean }

/** 1. Just play with the lock. */
function StepLock({ onSolved, solved }: StepProps) {
  const [input, setInput] = useState('')
  const open = accepts(LOCK, input)
  const press = (char: string) => { const next = input + char; setInput(next); if (accepts(LOCK, next)) onSolved() }
  return <>
    <p>Here is a strange lock. It has only two buttons, <b>a</b> and <b>b</b>, and no screen. It opens when the <b>last two</b> buttons you pressed were <b>a</b> then <b>b</b>.</p>
    <div className="lesson-lock">
      <div className={`lesson-lock-icon ${open ? 'is-open' : ''}`} aria-live="polite">{open ? <LockOpen size={44} aria-hidden="true" /> : <Lock size={44} aria-hidden="true" />}<span>{open ? 'Open' : 'Locked'}</span></div>
      <Typed input={input} />
      <div className="lesson-row"><Keys onPress={press} /><button type="button" className="text-button" onClick={() => setInput('')}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    </div>
    <p className="lesson-task">{solved ? 'Opened! Now press a few more buttons. Does it stay open?' : 'Your turn: open the lock.'}</p>
  </>
}

/** 2. The same lock, with its inside shown: three states and the arrows between them. */
function StepInside({ onSolved, solved }: StepProps) {
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const { path } = run(LOCK, input)
  const current = path[path.length - 1]
  const previous = path.length > 1 ? path[path.length - 2] : null
  const edge = previous ? LOCK.transitions.find(item => item.source === previous && item.target === current && item.symbols.includes(input.slice(-1))) : null
  return <>
    <p>The lock doesn’t remember everything you typed. It only needs to know <b>one</b> of three things, so that’s all it keeps: you’ve made no progress, you’ve just pressed <b>a</b>, or it’s open. Each circle is one of those situations, and each arrow says where a button press takes you.</p>
    <Diagram graph={LOCK} current={current} activeEdge={edge?.id} label={`The lock, now in ${labelOf(LOCK, current)}`} />
    <div className="lesson-row"><Typed input={input} /><Keys onPress={char => setInput(value => value + char)} /><button type="button" className="text-button" onClick={() => setInput('')}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    <p className="lesson-task">Press some buttons and follow the yellow circle. Then: if you press <code>b a a</code> from the start, where do you end up?</p>
    <Choices options={LOCK.states.map(state => ({ value: state.id, label: state.label }))} picked={picked} answer="a"
      onPick={value => { setPicked(value); if (value === 'a') onSolved() }} />
    {picked && (picked === 'a' || solved
      ? <Feedback ok>Right. <code>b</code> keeps you at start, the first <code>a</code> moves you to “saw a”, and the second <code>a</code> loops back to “saw a”: you still have half of “ab”.</Feedback>
      : <Feedback ok={false}>Not quite. Press <code>b</code>, <code>a</code>, <code>a</code> above and watch where the yellow circle stops.</Feedback>)}
  </>
}

/** 3. The vocabulary, learned by pointing at the parts. */
const PART_TASKS = [
  { id: 'o', ask: 'Tap the state where the lock is open.', name: 'accept state', why: 'An accept state is drawn with a double circle. If the input ends here, the machine says yes.' },
  { id: 'n', ask: 'Now tap the state where every input begins.', name: 'start state', why: 'The start state has a small arrow pointing into it from nowhere. There is exactly one.' },
]

function StepParts({ onSolved }: StepProps) {
  const tasks = PART_TASKS
  const [done, setDone] = useState(0)
  const [miss, setMiss] = useState<string | null>(null)
  const highlight = useMemo(() => Object.fromEntries(tasks.slice(0, done).map(task => [task.id, 'marked' as const])), [done, tasks])
  const pick = (id: string) => {
    if (done >= tasks.length) return
    if (id === tasks[done].id) { setMiss(null); setDone(done + 1); if (done + 1 === tasks.length) onSolved() } else setMiss(id)
  }
  return <>
    <p>What you just used has a name: a <b>deterministic finite automaton</b>, or <b>DFA</b>. The circles are <b>states</b>, and the arrows are <b>transitions</b>, each labelled with the letter that takes it.</p>
    <Diagram graph={LOCK} highlight={highlight} onPick={pick} label="The lock as a DFA. Tap a state." />
    {done < tasks.length && <p className="lesson-task">{tasks[done].ask}</p>}
    {miss && <Feedback ok={false}>That’s “{labelOf(LOCK, miss)}”. {done === 0 ? 'Look for the double circle.' : 'Look for the arrow that comes from nowhere.'}</Feedback>}
    <ul className="lesson-learned">{tasks.slice(0, done).map(task => <li key={task.id}><Check size={14} aria-hidden="true" /><span><b>{task.name}</b>: {task.why}</span></li>)}</ul>
  </>
}

/** 4. Predict before you run: accept or reject? */
function StepPredict({ onSolved }: StepProps) {
  const words = ['ab', 'ba', 'aab', 'abb', 'bbab']
  const [guesses, setGuesses] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState(false)
  const allRight = words.every(word => guesses[word] === accepts(LOCK, word))
  return <>
    <p>A DFA reads a string one letter at a time, following one arrow per letter. When the letters run out, it <b>accepts</b> if it’s in an accept state and <b>rejects</b> otherwise. The set of strings it accepts is called its <b>language</b>.</p>
    <Diagram graph={LOCK} label="The lock DFA" />
    <p className="lesson-task">Will the lock accept each of these? Decide, then check.</p>
    <div className="lesson-predict">
      {words.map(word => {
        const truth = accepts(LOCK, word)
        return <div key={word} className={`lesson-predict-row ${checked ? (guesses[word] === truth ? 'is-right' : 'is-wrong') : ''}`}>
          <code>{word}</code>
          <div role="radiogroup" aria-label={`Does it accept ${word}?`}>
            <button type="button" role="radio" aria-checked={guesses[word] === true} onClick={() => { setGuesses(value => ({ ...value, [word]: true })); setChecked(false) }}><Check size={14} aria-hidden="true" /> accept</button>
            <button type="button" role="radio" aria-checked={guesses[word] === false} onClick={() => { setGuesses(value => ({ ...value, [word]: false })); setChecked(false) }}><X size={14} aria-hidden="true" /> reject</button>
          </div>
          {checked && <small>{run(LOCK, word).path.map(id => labelOf(LOCK, id)).join(' → ')}</small>}
        </div>
      })}
    </div>
    <button type="button" className="primary-button" disabled={words.some(word => guesses[word] === undefined)} onClick={() => { setChecked(true); if (allRight) onSolved() }}>Check</button>
    {checked && (allRight
      ? <Feedback ok>All correct. The lock’s language is “every string that ends in ab”.</Feedback>
      : <Feedback ok={false}>Some are off. Each row now shows the path the machine takes. Change your answers and check again.</Feedback>)}
  </>
}

/** 5. Deterministic: exactly one arrow for every letter in every state. */
function StepDeterministic({ onSolved, solved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const highlight = useMemo(() => picked ? { [picked]: 'marked' as const } : {}, [picked])
  return <>
    <p>“Deterministic” means the machine never has to guess: in every state, each letter has <b>exactly one</b> arrow. Someone erased an arrow from this copy of the lock.</p>
    <Diagram graph={BROKEN} highlight={highlight} onPick={id => { setPicked(id); if (id === 'o') onSolved() }} label="The lock with one arrow missing. Tap a state." />
    <p className="lesson-task">Tap the state that has no arrow for <b>a</b>.</p>
    {picked && (picked === 'o' || solved
      ? <Feedback ok>Yes, “open” has no <code>a</code> arrow. It should go back to “saw a”, since that <code>a</code> could be the start of a new “ab”. In this app a missing arrow means the input is rejected on the spot.</Feedback>
      : <Feedback ok={false}>“{labelOf(BROKEN, picked)}” has an arrow labelled a. Check each state for an <code>a</code> going out.</Feedback>)}
  </>
}

const EVEN_TESTS = ['', 'a', 'aa', 'ab', 'aba', 'bab', 'aaa', 'baab']

/** 6. Finish a machine: pick where two arrows go until every test passes. */
function StepFix({ onSolved, solved }: StepProps) {
  const [aTarget, setATarget] = useState<'e' | 'o'>('o')
  const [bTarget, setBTarget] = useState<'e' | 'o'>('e')
  const graph = useMemo(() => machine(
    [['e', 'even', 'start', 0, 0, true], ['o', 'odd', 'state', 260, 0]],
    [['e', 'o', 'a'], ['e', 'e', 'b'], ['o', aTarget, 'a'], ['o', bTarget, 'b']].reduce<[string, string, string][]>((list, [source, target, symbol]) => {
      const same = list.find(item => item[0] === source && item[1] === target)
      if (same) same[2] += symbol; else list.push([source, target, symbol])
      return list
    }, []),
  ), [aTarget, bTarget])
  const results = EVEN_TESTS.map(word => ({ word, want: Array.from(word).filter(char => char === 'a').length % 2 === 0, got: accepts(graph, word) }))
  const passing = results.every(item => item.want === item.got)
  useEffect(() => { if (passing && !solved) onSolved() }, [passing, solved, onSolved])
  const option = (value: 'e' | 'o', current: 'e' | 'o', set: (next: 'e' | 'o') => void) =>
    <button type="button" role="radio" aria-checked={current === value} className={`lesson-chip ${current === value ? 'is-on' : ''}`} onClick={() => set(value)}>{value === 'e' ? 'even' : 'odd'}</button>
  return <>
    <p>Now you build. This machine should accept strings with an <b>even number of a’s</b> (zero counts as even). It keeps one fact: is the count of a’s so far even or odd? Two arrows out of “odd” are up to you.</p>
    <Diagram graph={graph} label="The even-a machine you are finishing" />
    <div className="lesson-arrows">
      <div><span>From <b>odd</b>, reading <code>a</code>, go to</span><div role="radiogroup" aria-label="odd on a">{option('e', aTarget, setATarget)}{option('o', aTarget, setATarget)}</div></div>
      <div><span>From <b>odd</b>, reading <code>b</code>, go to</span><div role="radiogroup" aria-label="odd on b">{option('e', bTarget, setBTarget)}{option('o', bTarget, setBTarget)}</div></div>
    </div>
    <ul className="lesson-tests" aria-label="Test strings">
      {results.map(item => <li key={item.word} className={item.want === item.got ? 'is-pass' : 'is-fail'}>
        <code>{item.word || 'ε'}</code><span>{item.want ? 'should accept' : 'should reject'}</span>{item.want === item.got ? <Check size={14} aria-label="passes" /> : <X size={14} aria-label="fails" />}
      </li>)}
    </ul>
    {passing
      ? <Feedback ok>Every test passes. An <code>a</code> flips even ↔ odd, and a <code>b</code> changes nothing. (ε is the empty string: zero letters, zero a’s, so it’s accepted.)</Feedback>
      : <p className="lesson-task">Make every row pass.</p>}
  </>
}

/** 7. Recap and where to go next. */
function StepDone() {
  return <>
    <p>That’s a DFA. Everything else in automata theory builds on these few ideas:</p>
    <ul className="lesson-learned">
      <li><Check size={14} aria-hidden="true" /><span>A <b>state</b> is the one thing the machine remembers about what it has read so far.</span></li>
      <li><Check size={14} aria-hidden="true" /><span>A <b>transition</b> says where each letter takes you. A DFA has exactly one for every state and letter.</span></li>
      <li><Check size={14} aria-hidden="true" /><span>It starts at the <b>start state</b> and <b>accepts</b> if the input ends in an <b>accept state</b>.</span></li>
      <li><Check size={14} aria-hidden="true" /><span>The strings it accepts are its <b>language</b>. Designing a DFA means deciding what to remember.</span></li>
    </ul>
    <div className="lesson-next">
      <Link className="primary-button" href="/dfa?practice=1">Build your own in Practice <ArrowRight size={14} aria-hidden="true" /></Link>
      <Link className="secondary-button" href="/dfa">Open the DFA workspace</Link>
    </div>
  </>
}

const steps: { title: string; Body: (props: StepProps) => ReactNode; free?: boolean }[] = [
  { title: 'A lock with two buttons', Body: StepLock },
  { title: 'Look inside the lock', Body: StepInside },
  { title: 'Name the parts', Body: StepParts },
  { title: 'Accept or reject?', Body: StepPredict },
  { title: 'Never guess', Body: StepDeterministic },
  { title: 'Finish a machine', Body: StepFix },
  { title: 'What you learned', Body: StepDone, free: true },
]

export function DfaLesson() {
  const [index, setIndex] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => steps.map(step => !!step.free))
  const step = steps[index]
  const markSolved = useCallback((at: number) => setSolved(current => current[at] ? current : current.map((value, i) => i === at ? true : value)), [])
  const solveCurrent = useCallback(() => markSolved(index), [markSolved, index])
  const Body = step.Body
  return <div className="lesson-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="lesson-main">
      <header className="lesson-head">
        <Link className="lesson-back" href="/"><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <p className="eyebrow">Lesson 1 · No background needed</p>
        <div className="lesson-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((item, at) => <button key={at} type="button" className={`${at === index ? 'is-current' : ''} ${solved[at] && !item.free ? 'is-solved' : ''}`}
            disabled={at > index && !solved.slice(0, at).every(Boolean)} onClick={() => setIndex(at)} aria-label={`Step ${at + 1}: ${item.title}`} />)}
        </div>
      </header>
      <section className="lesson-card" aria-labelledby="lesson-title">
        <h1 id="lesson-title"><span>{index + 1}</span>{step.title}</h1>
        <Body key={index} onSolved={solveCurrent} solved={solved[index]} />
        <footer className="lesson-nav">
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
          {index < steps.length - 1 && <button type="button" className="primary-button" disabled={!solved[index]} onClick={() => setIndex(index + 1)}
            title={solved[index] ? undefined : 'Do the task above to continue'}>Continue <ArrowRight size={14} aria-hidden="true" /></button>}
        </footer>
      </section>
    </main>
  </div>
}
