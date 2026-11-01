'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Lock, LockOpen, RotateCcw } from 'lucide-react'
import { Choices, Diagram, Feedback, Keys, LessonShell, Learned, PredictList, TestList, Typed, accepts, labelOf, machine, run, useSolvedWhen, type LessonStep, type StepProps } from './lesson-kit'

/**
 * Lesson 1: what a DFA is, for someone who has never seen one. One idea per step, and each step
 * asks the learner to do something before Continue unlocks, so it is learned by trying, not reading.
 */

// A lock that opens when the last two buttons pressed were a then b.
const LOCK = machine(
  [['n', 'start', 'start', 0, 170], ['a', 'saw a', 'state', 240, 0], ['o', 'open', 'accept', 480, 170]],
  [['n', 'n', 'b'], ['n', 'a', 'a'], ['a', 'a', 'a'], ['a', 'o', 'b'], ['o', 'a', 'a'], ['o', 'n', 'b']],
)
// The same lock with one arrow missing: "open" has nowhere to go on a.
const BROKEN = { ...LOCK, transitions: LOCK.transitions.filter(edge => edge.id !== 'o-a') }

// ---------- The steps ----------

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
    <Diagram graph={LOCK} current={current} activeEdges={edge ? [edge.id] : []} label={`The lock, now in ${labelOf(LOCK, current)}`} />
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
    <Learned items={tasks.slice(0, done).map(task => <><b>{task.name}</b>: {task.why}</>)} />
  </>
}

/** 4. Predict before you run: accept or reject? */
function StepPredict({ onSolved }: StepProps) {
  return <>
    <p>A DFA reads a string one letter at a time, following one arrow per letter. When the letters run out, it <b>accepts</b> if it’s in an accept state and <b>rejects</b> otherwise. The set of strings it accepts is called its <b>language</b>.</p>
    <Diagram graph={LOCK} label="The lock DFA" />
    <p className="lesson-task">Will the lock accept each of these? Decide, then check.</p>
    <PredictList words={['ab', 'ba', 'aab', 'abb', 'bbab']} truth={word => accepts(LOCK, word)} onSolved={onSolved}
      explain={word => run(LOCK, word).path.map(id => labelOf(LOCK, id)).join(' → ')}
      success={<>All correct. The lock’s language is “every string that ends in ab”.</>} />
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
  useSolvedWhen(passing, solved, onSolved)
  const option = (value: 'e' | 'o', current: 'e' | 'o', set: (next: 'e' | 'o') => void) =>
    <button type="button" role="radio" aria-checked={current === value} className={`lesson-chip ${current === value ? 'is-on' : ''}`} onClick={() => set(value)}>{value === 'e' ? 'even' : 'odd'}</button>
  return <>
    <p>Now you build. This machine should accept strings with an <b>even number of a’s</b> (zero counts as even). It keeps one fact: is the count of a’s so far even or odd? Two arrows out of “odd” are up to you.</p>
    <Diagram graph={graph} label="The even-a machine you are finishing" />
    <div className="lesson-arrows">
      <div><span>From <b>odd</b>, reading <code>a</code>, go to</span><div role="radiogroup" aria-label="odd on a">{option('e', aTarget, setATarget)}{option('o', aTarget, setATarget)}</div></div>
      <div><span>From <b>odd</b>, reading <code>b</code>, go to</span><div role="radiogroup" aria-label="odd on b">{option('e', bTarget, setBTarget)}{option('o', bTarget, setBTarget)}</div></div>
    </div>
    <TestList rows={results} />
    {passing
      ? <Feedback ok>Every test passes. An <code>a</code> flips even ↔ odd, and a <code>b</code> changes nothing. (ε is the empty string: zero letters, zero a’s, so it’s accepted.)</Feedback>
      : <p className="lesson-task">Make every row pass.</p>}
  </>
}

/** 7. Recap and where to go next. */
function StepDone() {
  return <>
    <p>That’s a DFA. Everything else in automata theory builds on these few ideas:</p>
    <Learned items={[
      <>A <b>state</b> is the one thing the machine remembers about what it has read so far.</>,
      <>A <b>transition</b> says where each letter takes you. A DFA has exactly one for every state and letter.</>,
      <>It starts at the <b>start state</b> and <b>accepts</b> if the input ends in an <b>accept state</b>.</>,
      <>The strings it accepts are its <b>language</b>. Designing a DFA means deciding what to remember.</>,
    ]} />
    <div className="lesson-next">
      <Link className="primary-button" href="/dfa?practice=1">Build your own in Practice <ArrowRight size={14} aria-hidden="true" /></Link>
      <Link className="secondary-button" href="/dfa">Open the DFA workspace</Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'A lock with two buttons', Body: StepLock },
  { title: 'Look inside the lock', Body: StepInside },
  { title: 'Name the parts', Body: StepParts },
  { title: 'Accept or reject?', Body: StepPredict },
  { title: 'Never guess', Body: StepDeterministic },
  { title: 'Finish a machine', Body: StepFix },
  { title: 'What you learned', Body: StepDone, free: true },
]

export function DfaLesson() {
  return <LessonShell id="dfa" steps={steps} />
}
