'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { Choices, Feedback, Learned, LessonShell, PredictList, type LessonStep, type StepProps } from './lesson-kit'
import { ZIGZAG_ROWS, euclidPairs, zigzagMoves } from '../lib/complexity'

/**
 * Lesson 9: time complexity and P (Sipser 7.1 and 7.2). The learner times a real single-tape TM on
 * longer and longer inputs and sees the steps quadruple, reads off big-O, sorts running times into
 * polynomial and exponential, and runs the Euclidean algorithm to see RELPRIME is in P.
 */

const SIZES = [8, 16, 32, 64]
const TIMES = Object.fromEntries(SIZES.map(n => [n, zigzagMoves(n).moves]))
const MAX = Math.max(...Object.values(TIMES))

/** 1. Count the steps. */
function StepCount({ onSolved, solved }: StepProps) {
  const [ran, setRan] = useState<number[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const allRan = SIZES.every(n => ran.includes(n))
  return <>
    <p>Decidable isn’t the end of the story: a decider can still be <b>too slow</b> to use. We measure a decider’s <b>running time</b> t(n): the most steps it takes on any input of length n.</p>
    <p>Here is a single-tape machine for {'{'} 0<sup>k</sup>1<sup>k</sup> {'}'} (Sipser’s M₁). It crosses off a 0 with <code>x</code>, walks right to the first 1 and crosses it off with <code>y</code>, walks back, and repeats.</p>
    <div className="lesson-table-wrap">
      <table className="lesson-rules">
        <thead><tr><th>In state</th><th>reading</th><th>write</th><th>move</th><th>go to</th></tr></thead>
        <tbody>{ZIGZAG_ROWS.map(row => <tr key={row.join()}>{row.map((cell, at) => <td key={at}><code>{cell}</code></td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="lesson-task">Run it on 0<sup>k</sup>1<sup>k</sup> for each length n and count the moves.</p>
    <div className="lesson-bars">
      {SIZES.map(n => {
        const shown = ran.includes(n) || solved
        return <div key={n} className="lesson-bar-row">
          <code>n = {n}</code>
          {shown
            ? <div className="lesson-bar"><span style={{ width: `${Math.max(2, TIMES[n] / MAX * 100)}%` }} /><b>{TIMES[n].toLocaleString('en-US')} moves</b></div>
            : <button type="button" className="secondary-button" onClick={() => setRan(current => [...current, n])}><Play size={13} aria-hidden="true" /> Run</button>}
        </div>
      })}
    </div>
    {(allRan || solved) && <>
      <p className="lesson-task">Each time n doubles, the number of moves gets multiplied by about…</p>
      <Choices picked={picked} answer="4" onPick={value => { setPicked(value); if (value === '4') onSolved() }} options={[
        { value: '2', label: '× 2' }, { value: '4', label: '× 4' }, { value: '8', label: '× 8' },
      ]} />
      {picked && (picked === '4'
        ? <Feedback ok>Right: 41, 145, 545, 2113. About n/2 round trips, each about n moves long, so roughly n²/2 moves. Doubling n quadruples n². The machine runs in <b>O(n²)</b> time.</Feedback>
        : <Feedback ok={false}>Divide each count by the one above it: 145 / 41, 545 / 145, 2113 / 545.</Feedback>)}
    </>}
  </>
}

/** 2. Big-O. */
function StepBigO({ onSolved, solved }: StepProps) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  return <>
    <p>Exact step counts depend on small details of the machine. <b>Big-O</b> keeps only what matters for large n: drop the constant factors and keep the fastest-growing term. f(n) = O(g(n)) means f(n) ≤ c·g(n) for some constant c once n is large enough.</p>
    <p className="lesson-task">f(n) = 6n³ + 2n² + 20n + 45. Then f(n) = O(…)?</p>
    <Choices picked={first} answer="n3" onPick={setFirst} options={[
      { value: 'n3', label: 'n³' }, { value: '6n3', label: '6n³ + 2n²' }, { value: 'n', label: 'n' },
    ]} />
    {first && (first === 'n3'
      ? <Feedback ok>Yes. 6n³ + 2n² + 20n + 45 is at most 7n³ once n ≥ 7, so it’s O(n³). (6n³ + 2n² is also true, but big-O drops the extra terms and the 6.)</Feedback>
      : <Feedback ok={false}>{first === 'n' ? 'n³ outgrows any constant times n.' : 'True, but big-O keeps only the leading term and drops its constant.'}</Feedback>)}
    {(first === 'n3' || solved) && <>
      <p className="lesson-task">A two-tape machine decides {'{'} 0<sup>k</sup>1<sup>k</sup> {'}'} in O(n): copy the 0s to the second tape, then match them against the 1s. What does Sipser’s Theorem 7.8 promise about a <b>single-tape</b> machine for any O(t(n)) multitape one?</p>
      <Choices picked={second} answer="square" onPick={value => { setSecond(value); if (value === 'square') onSolved() }} options={[
        { value: 'same', label: 'Also O(t(n))' }, { value: 'square', label: 'O(t(n)²)' }, { value: 'exp', label: 'O(2^t(n))' },
      ]} />
      {second && (second === 'square'
        ? <Feedback ok>Right. Switching between reasonable models costs at most a <b>polynomial</b> factor, here a square. So “runs in polynomial time” doesn’t depend on which deterministic model you pick.</Feedback>
        : <Feedback ok={false}>{second === 'same' ? 'Not always: our single-tape machine above takes O(n²) where two tapes take O(n).' : 'The simulation is slower, but not exponentially. Each multitape step costs one scan of the used tape.'}</Feedback>)}
    </>}
  </>
}

/** 3. Polynomial or exponential. */
const RUNTIMES = [
  { text: 'n²', poly: true, why: 'Polynomial.' },
  { text: 'n log n', poly: true, why: 'At most n², so polynomial.' },
  { text: 'n¹⁰⁰', poly: true, why: 'Huge, but still a polynomial.' },
  { text: '2ⁿ', poly: false, why: 'Exponential: one more input symbol doubles the time.' },
  { text: 'n!', poly: false, why: 'Grows even faster than 2ⁿ.' },
  { text: '1.01ⁿ', poly: false, why: 'Slow at first, but any cⁿ with c > 1 eventually beats every polynomial.' },
]
function StepPoly({ onSolved }: StepProps) {
  return <>
    <p><b>P</b> is the class of languages decided by a deterministic single-tape TM in <b>polynomial time</b>, O(n<sup>k</sup>) for some fixed k (Sipser, Definition 7.12). It is the same class for every reasonable deterministic model, and it roughly matches “problems a computer can actually solve”.</p>
    <p>The real dividing line is <b>polynomial</b> against <b>exponential</b>. Brute-force search through all candidates is usually exponential.</p>
    <p className="lesson-task">Is each running time polynomial?</p>
    <PredictList wide words={RUNTIMES.map(row => row.text)} yes="polynomial" no="not polynomial"
      truth={text => RUNTIMES.find(row => row.text === text)!.poly}
      explain={text => RUNTIMES.find(row => row.text === text)!.why}
      onSolved={onSolved}
      success={<>n¹⁰⁰ isn’t practical, but polynomial algorithms found in practice tend to have small exponents. Exponential ones stop working after a few dozen symbols.</>} />
  </>
}

/** 4. RELPRIME is in P (Theorem 7.15). */
const START: [number, number] = [91, 35]
const PAIRS = euclidPairs(...START)
function StepEuclid({ onSolved, solved }: StepProps) {
  const [reached, setReached] = useState(1)
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const done = reached >= PAIRS.length || solved
  const [x, y] = PAIRS[Math.min(reached, PAIRS.length) - 1]
  const submit = () => {
    if (Number(typed) === x % y && typed.trim() !== '') { setReached(reached + 1); setTyped(''); setWrong(false) } else setWrong(true)
  }
  return <>
    <p>RELPRIME = {'{'} ⟨x, y⟩ | x and y are relatively prime {'}'}: their greatest common divisor is 1. Trying every divisor up to x is exponential in the <b>number of digits</b>, which is the input length. The Euclidean algorithm is much faster:</p>
    <p className="lesson-formula">Repeat until y = 0: replace (x, y) with (y, x mod y). Then x is the gcd.</p>
    <ol className="lesson-euclid">
      {PAIRS.slice(0, done ? PAIRS.length : reached).map(([a, b]) => <li key={`${a},${b}`}><code>({a}, {b})</code></li>)}
    </ol>
    {!done
      ? <>
        <p className="lesson-task">What is {x} mod {y}?</p>
        <form className="lesson-row" onSubmit={event => { event.preventDefault(); submit() }}>
          <label className="lesson-input"><span>{x} mod {y}</span><input inputMode="numeric" value={typed} onChange={event => { setTyped(event.target.value); setWrong(false) }} /></label>
          <button type="submit" className="primary-button">Next pair</button>
        </form>
        {wrong && <Feedback ok={false}>x mod y is what’s left after taking out as many copies of y as fit: {x} = {Math.floor(x / y)} × {y} + ?</Feedback>}
      </>
      : <>
        <p className="lesson-task">y reached 0. Are 91 and 35 relatively prime?</p>
        <Choices picked={picked} answer="no" onPick={value => { setPicked(value); if (value === 'no') onSolved() }} options={[
          { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
        ]} />
        {picked && (picked === 'no'
          ? <Feedback ok>Right: the gcd is 7 (91 = 7 × 13, 35 = 7 × 5). Every two rounds at least halve x, so the number of rounds is at most about twice the number of <b>digits</b>. RELPRIME is in <b>P</b> (Theorem 7.15).</Feedback>
          : <Feedback ok={false}>The last pair is (7, 0), so the gcd is 7, not 1.</Feedback>)}
      </>}
  </>
}

/** 5. Recap. */
function StepDone() {
  return <>
    <p>You can now tell a fast decider from a slow one.</p>
    <Learned items={[
      <>The <b>running time</b> t(n) is the most steps on any input of length n. Our single-tape machine for 0<sup>k</sup>1<sup>k</sup> takes <b>O(n²)</b>.</>,
      <><b>Big-O</b> keeps the leading term and drops constants. Changing between reasonable models costs at most a polynomial factor.</>,
      <><b>P</b> is everything decidable in polynomial time. Polynomial against exponential is the line that matters.</>,
      <>Clever algorithms beat brute force: PATH (the marking idea from the E<sub>DFA</sub> decider) and RELPRIME (Euclid) are both in P.</>,
      <>Next lesson: problems where a <b>solution is easy to check</b> but seems hard to find. That’s NP.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/tm">Time your own machine in the TM workspace <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Count the steps', Body: StepCount },
  { title: 'Big-O', Body: StepBigO },
  { title: 'Polynomial or not', Body: StepPoly },
  { title: 'A fast gcd', Body: StepEuclid },
  { title: 'Time and P', Body: StepDone, free: true },
]

export function TimeLesson() {
  return <LessonShell id="time" steps={steps} />
}
