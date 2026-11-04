'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Choices, Diagram, Feedback, Keys, Learned, LessonShell, Typed, accepts, labelOf, machine, run, type LessonStep, type StepProps } from './lesson-kit'

/**
 * Lesson 4: a language finite memory can't handle. The learner breaks a DFA that tries to check
 * aⁿbⁿ, finds the repeated state that every such DFA must have, and pumps the loop to get a
 * string the machine must wrongly accept: the pumping lemma, discovered rather than stated.
 */

const inAnBn = (word: string) => {
  const half = word.length / 2
  return Number.isInteger(half) && word === 'a'.repeat(half) + 'b'.repeat(half)
}

// Counts a's up to two, then gives up and loops; checks the b's against that count.
const COUNTER = machine(
  [['c0', '0', 'start', 0, 0, true], ['c1', '1', 'state', 200, 0], ['c2', '2+', 'state', 400, 0], ['d1', 'need b', 'state', 400, 170], ['ok', 'done', 'accept', 200, 170]],
  [['c0', 'c1', 'a'], ['c1', 'c2', 'a'], ['c2', 'c2', 'a'], ['c1', 'ok', 'b'], ['c2', 'd1', 'b'], ['d1', 'ok', 'b']],
)

const verdict = (yes: boolean) => yes ? 'accepts' : 'rejects'

/** 1. Break a machine that tries to count. */
function StepBreak({ onSolved, solved }: StepProps) {
  const [input, setInput] = useState('')
  const { path, stuck } = run(COUNTER, input)
  const says = accepts(COUNTER, input)
  const truth = inAnBn(input)
  const press = (char: string) => { const next = input + char; setInput(next); if (accepts(COUNTER, next) !== inAnBn(next)) onSolved() }
  return <>
    <p>Take the language <b>aⁿbⁿ</b>: some a’s followed by <b>the same number</b> of b’s, like ε, ab, aabb, aaabbb. Someone built this DFA for it. Its states count a’s, but only up to two: <b>0</b>, <b>1</b>, <b>2+</b>. (A missing arrow means reject.)</p>
    <Diagram graph={COUNTER} current={stuck ? undefined : path[path.length - 1]} label="A DFA that tries to recognize aⁿbⁿ" />
    <div className="lesson-row"><Typed input={input} /><Keys onPress={press} /><button type="button" className="text-button" onClick={() => setInput('')}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    <p className="lesson-set">The machine <b>{verdict(says)}</b>{stuck ? ' (no arrow)' : ''}. The right answer: <b>{truth ? 'in' : 'not in'}</b> aⁿbⁿ.</p>
    {solved && says !== truth
      ? <Feedback ok>Caught it. On <code>{input}</code> the machine {verdict(says)}, but the string is {truth ? 'in' : 'not in'} aⁿbⁿ. Once it reaches “2+” it has forgotten how many a’s it saw.</Feedback>
      : <p className="lesson-task">{solved ? 'You found one earlier. Try another.' : 'Type a string the machine gets wrong.'}</p>}
  </>
}

/** 2. Pigeonhole: a state must repeat. */
function StepRepeat({ onSolved, solved }: StepProps) {
  const [count, setCount] = useState(0)
  const path = run(COUNTER, 'a'.repeat(count)).path
  const repeatAt = path.findIndex((id, at) => path.indexOf(id) < at)
  const press = () => { const next = count + 1; setCount(next); const visited = run(COUNTER, 'a'.repeat(next)).path; if (new Set(visited).size < visited.length) onSolved() }
  return <>
    <p>Fine, add more states? Any DFA has some fixed number of states, say <b>p</b>. Feed it a’s. After reading p a’s it has been in p + 1 states (counting the start), so <b>some state must repeat</b>.</p>
    <Diagram graph={COUNTER} current={path[path.length - 1]} label="The counting DFA reading a's" />
    <div className="lesson-row"><Typed input={'a'.repeat(count)} /><Keys chars={['a']} onPress={press} /><button type="button" className="text-button" onClick={() => setCount(0)}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    <p className="lesson-set">Visited: <b>{path.map(id => labelOf(COUNTER, id)).join(' → ')}</b></p>
    {repeatAt > 0 || solved
      ? <Feedback ok>After <code>aa</code> and after <code>aaa</code> the machine is in the same state. From here on it can’t tell them apart, so <code>aabb</code> and <code>aaabb</code> get the same answer. One of them must be wrong.</Feedback>
      : <p className="lesson-task">Press a until the machine visits a state for the second time.</p>}
  </>
}

/** 3. Same state, same fate. */
function StepFate({ onSolved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  return <>
    <p>This is true of <b>every</b> DFA, not just this one. Whatever comes next, the machine’s answer depends only on the state it is in now.</p>
    <p className="lesson-task">A DFA is in the same state after reading <code>aaaa</code> and after reading <code>aaaaaaa</code>. It accepts <code>aaaabbbb</code>. What does it do on <code>aaaaaaabbbb</code>?</p>
    <Choices picked={picked} answer="accept" onPick={value => { setPicked(value); if (value === 'accept') onSolved() }} options={[
      { value: 'accept', label: 'Accepts' }, { value: 'reject', label: 'Rejects' }, { value: 'unknown', label: 'Can’t tell' },
    ]} />
    {picked && (picked === 'accept'
      ? <Feedback ok>Yes. Both strings continue with <code>bbbb</code> from the same state, so they end in the same place. That means the DFA accepts 7 a’s with 4 b’s, so it does <b>not</b> recognize aⁿbⁿ.</Feedback>
      : <Feedback ok={false}>The rest of the input is <code>bbbb</code> in both cases, and the machine starts reading it from the same state. Where does it end up?</Feedback>)}
  </>
}

const S = 'aaabbb'
const SPLIT = { x: 'a', y: 'a', z: 'abbb' }

/** 4. Pump the loop. */
function StepPump({ onSolved, solved }: StepProps) {
  const [times, setTimes] = useState<number | null>(null)
  const word = useMemo(() => times === null ? null : SPLIT.x + SPLIT.y.repeat(times) + SPLIT.z, [times])
  return <>
    <p>Put it together. Suppose a DFA with p = 3 states recognized aⁿbⁿ, and give it <code>{S}</code>. Somewhere in the a’s a state repeats, so the string splits as <b>x y z</b> where reading <b>y</b> takes the machine around a loop. Say x = <code>a</code>, y = <code>a</code>, z = <code>abbb</code>.</p>
    <p>Going around the loop zero times or twice ends in the same state as going once, so the machine must give <b>x yⁱ z</b> the same answer for every i.</p>
    <div className="lesson-pump" aria-live="polite">
      <code><span className="pump-x">{SPLIT.x}</span>{times === null ? <span className="pump-y">{SPLIT.y}</span> : times === 0 ? <span className="pump-y is-empty" aria-label="y skipped" /> : Array.from({ length: times }, (_, at) => <span key={at} className="pump-y">{SPLIT.y}</span>)}<span className="pump-z">{SPLIT.z}</span></code>
    </div>
    <p className="lesson-task">Pick how many times to go around the loop. Find an i that gives a string outside aⁿbⁿ.</p>
    <Choices picked={times === null ? null : String(times)} answer={times !== null && times !== 1 ? String(times) : '0'}
      onPick={value => { const next = Number(value); setTimes(next); if (next !== 1) onSolved() }}
      options={[0, 1, 2, 3].map(i => ({ value: String(i), label: `i = ${i}` }))} />
    {word !== null && (times === 1
      ? <Feedback ok={false}>i = 1 gives back <code>{S}</code>, which is in the language.{solved ? ' You already found an i that breaks it.' : ' Try another i.'}</Feedback>
      : <Feedback ok>The machine must accept <code>{word || 'ε'}</code>, which has {word.split('a').length - 1} a’s and 3 b’s. Contradiction: no DFA recognizes aⁿbⁿ, so it is <b>not regular</b>.</Feedback>)}
  </>
}

/** 5. Recap: the pumping lemma. */
function StepDone() {
  return <>
    <p>What you just did is the <b>pumping lemma</b>. Sipser states it as: if A is regular, there is a number p such that every string s in A with |s| ≥ p splits as s = xyz with</p>
    <ol className="lesson-list">
      <li>xyⁱz is in A for every i ≥ 0,</li>
      <li>|y| &gt; 0, and</li>
      <li>|xy| ≤ p.</li>
    </ol>
    <Learned items={[
      <>A DFA’s only memory is its state, and it has <b>finitely many</b>.</>,
      <>After p letters some state repeats. The part read in between is a <b>loop</b> you can repeat or skip.</>,
      <>To show a language isn’t regular, pick a string of length at least p such that, for <b>every</b> allowed split, <b>some</b> pumped version xyⁱz falls <b>outside</b> it.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/pumping">Play the pumping lemma game <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'A machine that tries to count', Body: StepBreak },
  { title: 'A state must repeat', Body: StepRepeat },
  { title: 'Same state, same answer', Body: StepFate },
  { title: 'Pump the loop', Body: StepPump },
  { title: 'The pumping lemma', Body: StepDone, free: true },
]

export function NonregularLesson() {
  return <LessonShell id="nonregular" steps={steps} />
}
