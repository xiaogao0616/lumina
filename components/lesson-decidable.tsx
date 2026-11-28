'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Play, RotateCcw } from 'lucide-react'
import { runTm, BLANK, type TmStatus } from '../lib/turing'
import { Choices, Diagram, Feedback, Keys, Learned, LessonShell, PredictList, Typed, accepts, labelOf, machine, run, type LessonStep, type StepProps } from './lesson-kit'

/**
 * Lesson 6: decidable problems (Sipser 3.1 and 4.1). The learner watches a Turing machine that
 * halts on some inputs and runs forever on another, then plays three deciders by hand: A_DFA
 * (simulate), E_DFA (mark what the start state reaches) and EQ_DFA (look for a string the two
 * machines disagree on), and says why each one always stops.
 */

// ---------- 1. A machine that can run forever ----------

// Looks for a b. On reaching the blank it steps back onto the last a and tries again, forever.
const SEEKER_STATES = [
  { id: 'q0', label: 'q0', start: true, accepting: false },
  { id: 'q1', label: 'q1', start: false, accepting: false },
  { id: 'qa', label: 'q_accept', start: false, accepting: true },
]
const SEEKER_RULES = [
  { id: 'r1', source: 'q0', target: 'q0', symbols: ['a→a,R'] },
  { id: 'r2', source: 'q0', target: 'qa', symbols: ['b→b,R'] },
  { id: 'r3', source: 'q0', target: 'q1', symbols: [`${BLANK}→${BLANK},L`] },
  { id: 'r4', source: 'q1', target: 'q0', symbols: ['a→a,R'] },
]
const RULE_ROWS: [string, string, string, string, string][] = [
  ['q0', 'a', 'a', 'R', 'q0'], ['q0', 'b', 'b', 'R', 'q_accept'], ['q0', BLANK, BLANK, 'L', 'q1'], ['q1', 'a', 'a', 'R', 'q0'],
]
const SEEKER_INPUTS = ['aab', '', 'aa']

const OUTCOME: Record<TmStatus, string> = { accepted: 'accepts', rejected: 'rejects', loops: 'runs forever', undecided: 'has not stopped yet', error: 'cannot run' }

function StepForever({ onSolved, solved }: StepProps) {
  const [ran, setRan] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const results = useMemo(() => Object.fromEntries(SEEKER_INPUTS.map(word => [word, runTm(SEEKER_STATES, SEEKER_RULES, word, { recordSteps: 12 })])), [])
  const allRan = SEEKER_INPUTS.every(word => ran.includes(word))
  return <>
    <p>A Turing machine on an input can do three things: halt and <b>accept</b>, halt and <b>reject</b>, or <b>never halt</b>. This one scans right looking for a <b>b</b>. A missing rule means reject.</p>
    <table className="lesson-rules">
      <thead><tr><th>In state</th><th>reading</th><th>write</th><th>move</th><th>go to</th></tr></thead>
      <tbody>{RULE_ROWS.map(row => <tr key={row.join()}>{row.map((cell, at) => <td key={at}><code>{cell}</code></td>)}</tr>)}</tbody>
    </table>
    <div className="lesson-runs">
      {SEEKER_INPUTS.map(word => {
        const result = results[word]
        const shown = ran.includes(word)
        return <div key={word} className={`lesson-run ${shown ? `is-${result.status}` : ''}`}>
          <code>{word || 'ε'}</code>
          {shown
            ? <span>It <b>{OUTCOME[result.status]}</b>. {result.status === 'loops' ? 'At the blank it steps back onto the last a, reads it, steps onto the blank again, and repeats.' : result.message}</span>
            : <button type="button" className="secondary-button" onClick={() => setRan(current => [...current, word])}><Play size={13} aria-hidden="true" /> Run</button>}
        </div>
      })}
    </div>
    {allRan && <>
      <p>A machine that halts on <b>every</b> input is called a <b>decider</b>. Any machine <b>recognizes</b> the strings it accepts, but only a decider also gives a firm “no” to every other string.</p>
      <p className="lesson-task">Is this machine a decider?</p>
      <Choices picked={picked} answer="no" onPick={value => { setPicked(value); if (value === 'no') onSolved() }} options={[
        { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
      ]} />
      {picked && (picked === 'no'
        ? <Feedback ok>Right. It recognizes “contains a b”, but on <code>aa</code> it never answers. Waiting longer doesn’t help: from outside you can’t tell “still thinking” from “stuck forever”.</Feedback>
        : <Feedback ok={false}>Look at the run on <code>aa</code>. A decider must halt on every input.</Feedback>)}
    </>}
    {!allRan && <p className="lesson-task">{solved ? 'Run the inputs again if you like.' : 'Run the machine on all three inputs.'}</p>}
  </>
}

// ---------- 2. A question as a language: A_DFA ----------

const ENDS_AB = machine(
  [['p', 'p', 'start', 0, 0], ['q', 'q', 'state', 210, 0], ['r', 'r', 'accept', 420, 0]],
  [['p', 'q', 'a'], ['p', 'p', 'b'], ['q', 'q', 'a'], ['q', 'r', 'b'], ['r', 'q', 'a'], ['r', 'p', 'b']],
)

function StepAdfa({ onSolved }: StepProps) {
  return <>
    <p>Computability turns every yes/no question into a <b>language</b>: the set of inputs whose answer is yes. “Does DFA B accept string w?” becomes</p>
    <p className="lesson-formula">A<sub>DFA</sub> = {'{'} ⟨B, w⟩ | B is a DFA that accepts w {'}'}</p>
    <p>Here ⟨B, w⟩ is B and w written out as one string, the way a file stores a machine. A decider for A<sub>DFA</sub> simply <b>simulates B on w</b>. Take B to be this DFA:</p>
    <Diagram graph={ENDS_AB} label="A DFA B that accepts strings ending in ab" />
    <p className="lesson-task">Decide each pair ⟨B, w⟩: is it in A<sub>DFA</sub>?</p>
    <PredictList words={['ab', 'ba', 'aab', 'abba']} truth={word => accepts(ENDS_AB, word)} onSolved={onSolved} yes="in A_DFA" no="not in A_DFA"
      explain={word => <>B goes {run(ENDS_AB, word).path.map(id => labelOf(ENDS_AB, id)).join(' → ')}.</>}
      success={<>That is the decider (Sipser, Theorem 4.1). It always halts: a DFA reads one letter per step, so the simulation ends after |w| steps.</>} />
  </>
}

// ---------- 3. Is anything accepted? E_DFA ----------

const LONELY = machine(
  [['s', 's', 'start', 0, 0], ['t', 't', 'state', 210, 0], ['u', 'u', 'state', 0, 170], ['f', 'f', 'accept', 210, 170]],
  [['s', 't', 'a'], ['s', 's', 'b'], ['t', 's', 'ab'], ['u', 'f', 'a'], ['u', 'u', 'b'], ['f', 'f', 'ab']],
)
const reachable = (() => {
  const marked = new Set(['s'])
  for (let grew = true; grew;) {
    grew = false
    for (const edge of LONELY.transitions) if (marked.has(edge.source) && !marked.has(edge.target)) { marked.add(edge.target); grew = true }
  }
  return marked
})()

function StepEdfa({ onSolved, solved }: StepProps) {
  const [marked, setMarked] = useState<string[]>(['s'])
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const canMark = (id: string) => LONELY.transitions.some(edge => edge.target === id && marked.includes(edge.source))
  const done = marked.length === reachable.size
  const pick = (id: string) => {
    if (marked.includes(id)) return
    if (!canMark(id)) { setNote(`No arrow comes into ${id} from a marked state, so the decider can’t mark it.`); return }
    setNote('')
    setMarked(current => [...current, id])
  }
  return <>
    <p>Next question: does a DFA accept <b>anything at all</b>? That’s E<sub>DFA</sub> = {'{'} ⟨A⟩ | A is a DFA and L(A) = ∅ {'}'}. Trying every string would never end. Instead the decider (Theorem 4.4) <b>marks</b> states: first the start state, then any state with an arrow coming in from a marked one, until nothing new gets marked.</p>
    <Diagram graph={LONELY} onPick={pick} highlight={Object.fromEntries(LONELY.states.map(state => [state.id, marked.includes(state.id) ? 'marked' as const : 'faded' as const]))} label="A DFA A; marked states are highlighted" />
    <p className="lesson-set">Marked: <b>{marked.join(', ')}</b>{note && <> · {note}</>}</p>
    {!done && <p className="lesson-task">Click each state the decider would mark next, until nothing more can be marked.</p>}
    {done && <>
      <p className="lesson-task">Nothing else can be marked. What does the decider answer?</p>
      <Choices picked={picked} answer="empty" onPick={value => { setPicked(value); if (value === 'empty') onSolved() }} options={[
        { value: 'empty', label: 'L(A) is empty' }, { value: 'not', label: 'A accepts some string' },
      ]} />
      {picked && (picked === 'empty'
        ? <Feedback ok>Right. The accepting state f was never marked, so no string can lead to it: A accepts nothing. The decider stops after at most one round per state.</Feedback>
        : <Feedback ok={false}>Is any accepting state marked? Only a marked accepting state means some string gets there.</Feedback>)}
    </>}
    {solved && !done && <p className="lesson-task">You’ve done this one. Mark again or continue.</p>}
    <button type="button" className="text-button" onClick={() => { setMarked(['s']); setNote(''); setPicked(null) }}><RotateCcw size={13} aria-hidden="true" /> Start over</button>
  </>
}

// ---------- 4. Same language? EQ_DFA ----------

const EVEN = machine(
  [['e0', 'even', 'start', 0, 0, true], ['e1', 'odd', 'state', 220, 0]],
  [['e0', 'e1', 'a'], ['e0', 'e0', 'b'], ['e1', 'e0', 'a'], ['e1', 'e1', 'b']],
)
// Counts a's mod 4 but accepts 0 and 3 instead of 0 and 2.
const MOD4 = machine(
  [['m0', '0', 'start', 0, 0, true], ['m1', '1', 'state', 200, 0], ['m2', '2', 'state', 400, 0], ['m3', '3', 'accept', 200, 150]],
  [['m0', 'm1', 'a'], ['m1', 'm2', 'a'], ['m2', 'm3', 'a'], ['m3', 'm0', 'a'], ['m0', 'm0', 'b'], ['m1', 'm1', 'b'], ['m2', 'm2', 'b'], ['m3', 'm3', 'b']],
)

const last = (path: string[]) => path[path.length - 1]

function StepEqdfa({ onSolved, solved }: StepProps) {
  const [input, setInput] = useState('')
  const first = accepts(EVEN, input)
  const second = accepts(MOD4, input)
  const press = (char: string) => { const next = input + char; setInput(next); if (accepts(EVEN, next) !== accepts(MOD4, next)) onSolved() }
  return <>
    <p>Last one: do two DFAs accept <b>the same</b> language? That’s EQ<sub>DFA</sub>. A should accept strings with an even number of a’s. B was meant to do the same by counting a’s mod 4.</p>
    <div className="lesson-pair">
      <Diagram graph={EVEN} current={last(run(EVEN, input).path)} label="DFA A: an even number of a's" />
      <Diagram graph={MOD4} current={last(run(MOD4, input).path)} label="DFA B: counts a's mod 4" />
    </div>
    <div className="lesson-row"><Typed input={input} /><Keys onPress={press} /><button type="button" className="text-button" onClick={() => setInput('')}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    <p className="lesson-set">A <b>{first ? 'accepts' : 'rejects'}</b>, B <b>{second ? 'accepts' : 'rejects'}</b>.</p>
    {solved
      ? <Feedback ok>{first !== second ? <>They disagree on <code>{input || 'ε'}</code>. </> : null}The decider (Theorem 4.5) builds a DFA C that accepts exactly the strings where A and B disagree, then asks the E<sub>DFA</sub> decider whether L(C) is empty. Here it isn’t, so A and B are <b>not</b> equivalent.</Feedback>
      : <p className="lesson-task">Type a string where A and B give different answers.</p>}
  </>
}

// ---------- 5. Why they always stop ----------

function StepHalts({ onSolved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  return <>
    <p>A decider must halt on every input, including machines with loops in them. The marking decider never tries strings one by one.</p>
    <p className="lesson-task">Why is the E<sub>DFA</sub> decider guaranteed to stop?</p>
    <Choices picked={picked} answer="finite" onPick={value => { setPicked(value); if (value === 'finite') onSolved() }} options={[
      { value: 'finite', label: 'Each round marks a new state, and there are finitely many' },
      { value: 'noloop', label: 'DFAs have no loops' },
      { value: 'timer', label: 'It gives up after a time limit' },
    ]} />
    {picked && (picked === 'finite'
      ? <Feedback ok>Yes. A round that marks nothing ends it, so with n states there are at most n rounds. Every decider needs an argument like this: a reason the work runs out.</Feedback>
      : picked === 'noloop'
        ? <Feedback ok={false}>The DFA in step 3 had loops (b on s, a and b on f). The decider never runs the DFA on a string, so its loops don’t matter.</Feedback>
        : <Feedback ok={false}>A time limit would make it guess. A decider must give the right answer every time.</Feedback>)}
  </>
}

// ---------- 6. Recap ----------

function StepDone() {
  return <>
    <p>A language is <b>decidable</b> when some decider accepts exactly its strings and rejects everything else. You’ve now run three deciders by hand.</p>
    <Learned items={[
      <>A Turing machine can accept, reject or <b>run forever</b>. A <b>decider</b> halts on every input. A <b>recognizer</b> only has to accept the right strings.</>,
      <>Yes/no questions about machines become languages, like A<sub>DFA</sub>, E<sub>DFA</sub> and EQ<sub>DFA</sub>.</>,
      <>All three are decidable (Theorems 4.1, 4.4, 4.5): simulate, mark reachable states, and test the difference machine for emptiness.</>,
      <>Each decider comes with a reason it must stop. Next lesson: a question where no such reason can exist.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/deciders">Step through every decider from chapter 4 <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Halt or run forever', Body: StepForever },
  { title: 'A question as a language', Body: StepAdfa },
  { title: 'Does it accept anything?', Body: StepEdfa },
  { title: 'Do two machines agree?', Body: StepEqdfa },
  { title: 'Why the deciders stop', Body: StepHalts },
  { title: 'Decidable languages', Body: StepDone, free: true },
]

export function DecidableLesson() {
  return <LessonShell id="decidable" steps={steps} />
}
