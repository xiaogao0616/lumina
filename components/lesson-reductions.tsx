'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Choices, Feedback, Learned, LessonShell, PredictList, type LessonStep, type StepProps } from './lesson-kit'

/**
 * Lesson 8: reductions (Sipser 5.1 to 5.3). The learner turns a decider for HALT_TM into a decider
 * for A_TM, learns which way a reduction carries undecidability, builds the mapping reduction
 * A_TM ≤m HALT_TM by choosing what M′ does in each case, reduces A_TM to E_TM, and sorts
 * properties with Rice's theorem.
 */

/** 1. If HALT_TM had a decider, A_TM would too (Theorem 5.1). */
function StepHalt({ onSolved, solved }: StepProps) {
  const [no, setNo] = useState<string | null>(null)
  const [yes, setYes] = useState<string | null>(null)
  const pick = (which: 'no' | 'yes', value: string) => {
    const nextNo = which === 'no' ? value : no, nextYes = which === 'yes' ? value : yes
    if (which === 'no') setNo(value); else setYes(value)
    if (nextNo === 'reject' && nextYes === 'simulate') onSolved()
  }
  return <>
    <p>HALT<sub>TM</sub> = {'{'} ⟨M, w⟩ | M <b>halts</b> on w {'}'}. Halting is a weaker question than accepting: it only asks whether M stops, not how.</p>
    <p>Suppose a machine <b>R</b> decided HALT<sub>TM</sub>. Use it to build a decider <b>S</b> for A<sub>TM</sub>. On input ⟨M, w⟩, S first runs R on ⟨M, w⟩.</p>
    <p className="lesson-task">R rejects: M runs forever on w. What should S do?</p>
    <Choices picked={no} answer="reject" onPick={value => pick('no', value)} options={[
      { value: 'reject', label: 'Reject' }, { value: 'simulate', label: 'Run M on w' }, { value: 'accept', label: 'Accept' },
    ]} />
    {no && (no === 'reject'
      ? <Feedback ok>Right. A machine that never stops never accepts, so ⟨M, w⟩ is not in A<sub>TM</sub>.</Feedback>
      : <Feedback ok={false}>{no === 'simulate' ? 'R just said M runs forever on w. Would S ever finish?' : 'If M never stops, can it accept w?'}</Feedback>)}
    {(no === 'reject' || solved) && <>
      <p className="lesson-task">R accepts: M halts on w. What should S do now?</p>
      <Choices picked={yes} answer="simulate" onPick={value => pick('yes', value)} options={[
        { value: 'accept', label: 'Accept' }, { value: 'simulate', label: 'Run M on w and copy its answer' }, { value: 'reject', label: 'Reject' },
      ]} />
      {yes && yes !== 'simulate' && <Feedback ok={false}>Halting can mean accepting or rejecting. S doesn’t know which yet. But it now knows the simulation will <b>finish</b>.</Feedback>}
    </>}
    {(solved || (no === 'reject' && yes === 'simulate')) && <Feedback ok>S always halts, and it accepts exactly A<sub>TM</sub>. But A<sub>TM</sub> has no decider, so R can’t exist: <b>HALT<sub>TM</sub> is undecidable</b> (Sipser, Theorem 5.1). This is a <b>reduction</b>: solving A<sub>TM</sub> using HALT<sub>TM</sub>.</Feedback>}
  </>
}

/** 2. Which way does undecidability flow? (Theorem 5.22, Corollary 5.23, Theorem 5.28) */
function StepDirection({ onSolved, solved }: StepProps) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  return <>
    <p>A <b>mapping reduction</b> A ≤<sub>m</sub> B is a computable function f with <b>w ∈ A exactly when f(w) ∈ B</b>. It turns every question about A into a question about B with the same answer.</p>
    <p>So a decider for B gives a decider for A: compute f(w), then ask B. In short, <b>B easy ⇒ A easy</b>, and turned around, <b>A hard ⇒ B hard</b>.</p>
    <p className="lesson-task">You know A<sub>TM</sub> is undecidable and want to prove E<sub>TM</sub> undecidable too. Which reduction do you need?</p>
    <Choices picked={first} answer="to" onPick={setFirst} options={[
      { value: 'to', label: <>A<sub>TM</sub> ≤<sub>m</sub> E<sub>TM</sub></> }, { value: 'from', label: <>E<sub>TM</sub> ≤<sub>m</sub> A<sub>TM</sub></> },
    ]} />
    {first && (first === 'to'
      ? <Feedback ok>Yes. Reduce the <b>known hard</b> problem <b>to</b> the new one. If E<sub>TM</sub> were decidable, A<sub>TM</sub> would be too.</Feedback>
      : <Feedback ok={false}>That shows E<sub>TM</sub> is no harder than A<sub>TM</sub>. An undecidable problem can be “no harder” than another undecidable one, so this proves nothing.</Feedback>)}
    {(first === 'to' || solved) && <>
      <p className="lesson-task">Someone shows X ≤<sub>m</sub> A<sub>TM</sub>. What does that tell you about X?</p>
      <Choices picked={second} answer="recognizable" onPick={value => { setSecond(value); if (value === 'recognizable') onSolved() }} options={[
        { value: 'undecidable', label: 'X is undecidable' }, { value: 'recognizable', label: 'X is recognizable' }, { value: 'decidable', label: 'X is decidable' },
      ]} />
      {second && (second === 'recognizable'
        ? <Feedback ok>Right. A<sub>TM</sub> is recognizable, and “easy” flows backwards along ≤: compute f(w) and run the universal machine on it. So <b>X is recognizable</b> (Theorem 5.28). It says nothing about X being hard.</Feedback>
        : <Feedback ok={false}>{second === 'undecidable' ? 'The arrow points the wrong way for that. Hardness flows from left to right, X sits on the left.' : 'A_TM isn’t decidable, so there’s no decider to borrow.'} What do we know A<sub>TM</sub> <b>is</b>?</Feedback>)}
    </>}
  </>
}

/** 3. Build f for A_TM ≤m HALT_TM (Example 5.24). */
const CASES = [
  { label: 'M accepts w', inA: true },
  { label: 'M rejects w', inA: false },
  { label: 'M runs forever on w', inA: false },
]
function StepMapping({ onSolved, solved }: StepProps) {
  const [halts, setHalts] = useState<(boolean | null)[]>([null, null, null])
  const toggle = (at: number) => {
    const next = halts.map((value, index) => index === at ? !(value ?? false) : value)
    setHalts(next)
    if (next.every((value, index) => value === CASES[index].inA)) onSolved()
  }
  const done = halts.every((value, index) => value === CASES[index].inA)
  return <>
    <p>Now build a mapping reduction A<sub>TM</sub> ≤<sub>m</sub> HALT<sub>TM</sub>. The function f takes ⟨M, w⟩ and writes down a new machine M′, giving f(⟨M, w⟩) = ⟨M′, w⟩. M′ runs M and then decides when to stop.</p>
    <p>The rule is: <b>M′ halts on w exactly when M accepts w</b>, so membership in A<sub>TM</sub> and in HALT<sub>TM</sub> match.</p>
    <div className="lesson-table-wrap">
      <table className="lesson-rules lesson-map">
        <thead><tr><th>What M does on w</th><th>⟨M, w⟩ ∈ A<sub>TM</sub>?</th><th>What M′ does</th><th>⟨M′, w⟩ ∈ HALT<sub>TM</sub>?</th></tr></thead>
        <tbody>{CASES.map((row, at) => {
          const value = halts[at]
          return <tr key={row.label}>
            <td>{row.label}</td><td>{row.inA ? 'yes' : 'no'}</td>
            <td><button type="button" className={value !== null && value !== row.inA ? 'is-clash' : ''} onClick={() => toggle(at)}
              aria-label={`When ${row.label}, M′ ${value === null ? 'is not set' : value ? 'halts' : 'loops forever'}. Click to change.`}>{value === null ? 'set' : value ? 'halts' : 'loops'}</button></td>
            <td>{value === null ? '?' : value ? 'yes' : 'no'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    {done || solved
      ? <Feedback ok>So M′ on x: run M on x; if M accepts, <b>accept</b>; if M rejects, <b>loop forever</b>. When M itself loops, M′ loops along with it. f only <b>writes down</b> M′, it never runs M, so f is computable and always halts.</Feedback>
      : <p className="lesson-task">Click each cell in the M′ column. {halts.some((value, at) => value !== null && value !== CASES[at].inA) ? 'A red cell makes the two “∈?” columns disagree; flip it.' : 'The last two columns have to agree in every row.'}</p>}
  </>
}

/** 4. A_TM reduces to E_TM (Theorem 5.2). */
function StepEmpty({ onSolved, solved }: StepProps) {
  const [accepts, setAccepts] = useState<string | null>(null)
  const [not, setNot] = useState<string | null>(null)
  return <>
    <p>E<sub>TM</sub> = {'{'} ⟨M⟩ | L(M) = ∅ {'}'}. Given ⟨M, w⟩, write down this machine:</p>
    <p className="lesson-formula">M₁ on input x: if x ≠ w, reject. If x = w, run M on w and accept if M accepts.</p>
    <p className="lesson-task">M accepts w. What is L(M₁)?</p>
    <Choices picked={accepts} answer="w" onPick={setAccepts} options={[
      { value: 'empty', label: '∅' }, { value: 'w', label: '{ w }' }, { value: 'all', label: 'Σ*' },
    ]} />
    {accepts && accepts !== 'w' && <Feedback ok={false}>M₁ rejects every x other than w straight away. What happens on w itself?</Feedback>}
    {(accepts === 'w' || solved) && <>
      <p className="lesson-task">M does not accept w. What is L(M₁) now?</p>
      <Choices picked={not} answer="empty" onPick={value => { setNot(value); if (value === 'empty') onSolved() }} options={[
        { value: 'empty', label: '∅' }, { value: 'w', label: '{ w }' }, { value: 'all', label: 'Σ*' },
      ]} />
      {not && (not === 'empty'
        ? <Feedback ok>So L(M₁) is empty <b>exactly when</b> M does not accept w. A decider for E<sub>TM</sub>, run on ⟨M₁⟩ with its answer flipped, would decide A<sub>TM</sub>. So <b>E<sub>TM</sub> is undecidable</b> (Theorem 5.2).</Feedback>
        : <Feedback ok={false}>M₁ accepts w only if M accepts w, and M doesn’t.</Feedback>)}
    </>}
  </>
}

/** 5. Rice's theorem. */
const PROPERTIES = [
  { text: 'L(M) contains ab', undecidable: true, why: 'A nontrivial property of L(M): Rice applies.' },
  { text: 'L(M) is regular', undecidable: true, why: 'Some TMs have regular languages, some don’t: Rice applies (Theorem 5.3).' },
  { text: 'M has at most 5 states', undecidable: false, why: 'About the machine, not its language. Just count the states.' },
  { text: 'M runs 100+ steps on ε', undecidable: false, why: 'Simulate M for 100 steps and look.' },
  { text: 'L(M) is recognizable', undecidable: false, why: 'Trivial: every TM’s language is recognizable, so the answer is always yes.' },
]
function StepRice({ onSolved }: StepProps) {
  return <>
    <p>These reductions all follow one pattern, and <b>Rice’s theorem</b> packages it: any property of <b>the language L(M)</b> that some TMs’ languages have and some don’t is undecidable (Sipser, Problem 5.28).</p>
    <p>Two ways out: a property of the <b>machine itself</b> (its states, its first 100 steps) can be decidable, and so can a <b>trivial</b> property that every language or no language has.</p>
    <p className="lesson-task">Is each question about a TM M decidable?</p>
    <PredictList wide words={PROPERTIES.map(property => property.text)} yes="decidable" no="undecidable"
      truth={text => !PROPERTIES.find(property => property.text === text)!.undecidable}
      explain={text => PROPERTIES.find(property => property.text === text)!.why}
      onSolved={onSolved}
      success={<>Rice turns a whole family of questions into one-line proofs. Ask: is it about the <b>language</b>, and is it <b>nontrivial</b>? Then it’s undecidable.</>} />
  </>
}

/** 6. Recap. */
function StepDone() {
  return <>
    <p>You can now prove problems undecidable without a new diagonal argument each time.</p>
    <Learned items={[
      <>A <b>reduction</b> solves one problem with another. If a decider for B would give a decider for A<sub>TM</sub>, then B is undecidable.</>,
      <><b>A ≤<sub>m</sub> B</b>: a computable f with w ∈ A ⇔ f(w) ∈ B. B decidable ⇒ A decidable, and A undecidable ⇒ B undecidable.</>,
      <>Reduce the <b>known hard</b> problem <b>to</b> the new one, never the other way.</>,
      <>HALT<sub>TM</sub> and E<sub>TM</sub> are undecidable, and by <b>Rice’s theorem</b> so is every nontrivial property of a TM’s language.</>,
      <>Next lesson: problems we <b>can</b> decide, and how much <b>time</b> that takes.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/tm">Try the Turing machine workspace <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Borrow a decider', Body: StepHalt },
  { title: 'Which way it points', Body: StepDirection },
  { title: 'Build the reduction', Body: StepMapping },
  { title: 'Is the language empty?', Body: StepEmpty },
  { title: 'Rice’s theorem', Body: StepRice },
  { title: 'Reductions', Body: StepDone, free: true },
]

export function ReductionsLesson() {
  return <LessonShell id="reductions" steps={steps} />
}
