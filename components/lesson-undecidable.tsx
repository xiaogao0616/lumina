'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Choices, Feedback, Learned, LessonShell, type LessonStep, type StepProps } from './lesson-kit'

/**
 * Lesson 7: undecidability (Sipser 4.2). The learner builds the diagonal machine D by flipping the
 * diagonal of a table, finds that D has no consistent answer on its own description, and uses that
 * to see why A_TM has no decider. Then: A_TM is still recognizable, and its complement is not.
 */

const MACHINES = ['M₁', 'M₂', 'M₃', 'M₄']
// TABLE[i][j]: does Mᵢ accept ⟨Mⱼ⟩? (true = accept, false = reject)
const TABLE = [
  [true, false, true, false],
  [true, true, true, true],
  [false, false, false, false],
  [true, false, true, true],
]
const word = (yes: boolean) => yes ? 'accept' : 'reject'

/** 1. Flip the diagonal. */
function StepDiagonal({ onSolved, solved }: StepProps) {
  const [row, setRow] = useState<(boolean | null)[]>([null, null, null, null])
  const set = (at: number) => {
    const next = row.map((value, index) => index === at ? !(value ?? false) : value)
    setRow(next)
    if (next.every((value, index) => value === !TABLE[index][index])) onSolved()
  }
  const clash = row.map((value, index) => value !== null && value === TABLE[index][index])
  const complete = row.every((value, index) => value === !TABLE[index][index])
  return <>
    <p>List every Turing machine as M₁, M₂, M₃, … (each one is a finite description, so they can be listed). Now feed each machine every machine’s description. Row i, column j says what Mᵢ does on input ⟨Mⱼ⟩.</p>
    <p>Build a new machine <b>D</b> that does the <b>opposite</b> of the diagonal: on input ⟨Mᵢ⟩, D accepts exactly when Mᵢ rejects ⟨Mᵢ⟩.</p>
    <div className="lesson-table-wrap">
      <table className="lesson-rules lesson-diag">
        <thead><tr><th />{MACHINES.map(name => <th key={name}>⟨{name}⟩</th>)}</tr></thead>
        <tbody>
          {TABLE.map((cells, i) => <tr key={i}><th>{MACHINES[i]}</th>{cells.map((value, j) => <td key={j} className={i === j ? 'is-diagonal' : ''}>{word(value)}</td>)}</tr>)}
          <tr className="is-new"><th>D</th>{row.map((value, at) => <td key={at}>
            <button type="button" className={clash[at] ? 'is-clash' : ''} onClick={() => set(at)} aria-label={`D on ⟨${MACHINES[at]}⟩: ${value === null ? 'not set' : word(value)}. Click to change.`}>{value === null ? 'set' : word(value)}</button>
          </td>)}</tr>
        </tbody>
      </table>
    </div>
    {complete || solved
      ? <Feedback ok>D differs from M₁ on ⟨M₁⟩, from M₂ on ⟨M₂⟩, and so on down the whole list. So D is <b>not any machine in the list</b>. This is Cantor’s <b>diagonalization</b>.</Feedback>
      : <p className="lesson-task">Click D’s cells to fill in its row. {clash.some(Boolean) ? 'A red cell agrees with the diagonal entry above it; flip it.' : 'Compare each one with the highlighted diagonal.'}</p>}
  </>
}

/** 2. D on its own description. */
function StepSelf({ onSolved, solved }: StepProps) {
  const [tried, setTried] = useState<string[]>([])
  const [last, setLast] = useState<string | null>(null)
  const pick = (value: string) => {
    setLast(value)
    const next = tried.includes(value) ? tried : [...tried, value]
    setTried(next)
    if (next.length === 2) onSolved()
  }
  return <>
    <p>Suppose some machine <b>H</b> decided A<sub>TM</sub> = {'{'} ⟨M, w⟩ | M is a TM that accepts w {'}'}. Then the table above is something we could <b>compute</b>: H fills in any cell and always halts. So D is a real machine:</p>
    <p className="lesson-formula">D on input ⟨M⟩: run H on ⟨M, ⟨M⟩⟩. If H accepts, reject. If H rejects, accept.</p>
    <p>D is a Turing machine, so it has a row in the table. Its diagonal cell is D on <b>⟨D⟩</b>.</p>
    <p className="lesson-task">Try both answers for what D does on ⟨D⟩.</p>
    <Choices picked={last} answer="none" onPick={pick} options={[
      { value: 'accept', label: 'D accepts ⟨D⟩' }, { value: 'reject', label: 'D rejects ⟨D⟩' },
    ]} />
    {last === 'accept' && <Feedback ok={false}>If D accepts ⟨D⟩, then H accepts ⟨D, ⟨D⟩⟩, so D does the opposite and <b>rejects</b> ⟨D⟩. Contradiction.</Feedback>}
    {last === 'reject' && <Feedback ok={false}>If D rejects ⟨D⟩, then H rejects ⟨D, ⟨D⟩⟩, so D does the opposite and <b>accepts</b> ⟨D⟩. Contradiction.</Feedback>}
    {(tried.length === 2 || solved) && <Feedback ok>Both answers are impossible. D was built honestly from H, so the only thing that can be wrong is the assumption: <b>no decider H for A<sub>TM</sub> exists</b>. A<sub>TM</sub> is undecidable (Sipser, Theorem 4.11).</Feedback>}
  </>
}

/** 3. Still recognizable. */
function StepRecognize({ onSolved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  return <>
    <p>A<sub>TM</sub> isn’t hopeless. The <b>universal machine</b> U, on input ⟨M, w⟩, simulates M on w and accepts if M accepts. So U <b>recognizes</b> A<sub>TM</sub>.</p>
    <p className="lesson-task">M runs forever on w. What does U do on ⟨M, w⟩?</p>
    <Choices picked={picked} answer="forever" onPick={value => { setPicked(value); if (value === 'forever') onSolved() }} options={[
      { value: 'reject', label: 'Rejects' }, { value: 'forever', label: 'Runs forever too' }, { value: 'accept', label: 'Accepts' },
    ]} />
    {picked && (picked === 'forever'
      ? <Feedback ok>Right. U only ever learns “yes”. When the answer is “no” because M loops, U waits forever. That’s the gap between <b>recognizable</b> and <b>decidable</b>.</Feedback>
      : <Feedback ok={false}>U is just simulating M. If M never stops, can the simulation stop?</Feedback>)}
  </>
}

/** 4. The complement. */
function StepComplement({ onSolved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  return <>
    <p>A language is <b>co-recognizable</b> when its complement is recognizable. Sipser’s Theorem 4.22: a language is decidable exactly when it is <b>both</b> recognizable and co-recognizable. Run the two recognizers side by side, one step each at a time. One of them must accept, and that tells you the answer.</p>
    <p className="lesson-task">A<sub>TM</sub> is recognizable but not decidable. What does that say about its complement, the pairs ⟨M, w⟩ where M does <b>not</b> accept w?</p>
    <Choices picked={picked} answer="not" onPick={value => { setPicked(value); if (value === 'not') onSolved() }} options={[
      { value: 'decidable', label: 'It is decidable' }, { value: 'recognizable', label: 'It is recognizable' }, { value: 'not', label: 'It is not recognizable' },
    ]} />
    {picked && (picked === 'not'
      ? <Feedback ok>Yes. If the complement were recognizable too, Theorem 4.22 would make A<sub>TM</sub> decidable. So the complement of A<sub>TM</sub> is <b>not even Turing-recognizable</b> (Corollary 4.23).</Feedback>
      : <Feedback ok={false}>{picked === 'decidable' ? 'If the complement were decidable, so would A_TM be: just flip the answer.' : 'If it were recognizable, A_TM would be both recognizable and co-recognizable. What would Theorem 4.22 then say?'}</Feedback>)}
  </>
}

/** 5. Recap. */
function StepDone() {
  return <>
    <p>You’ve met the first problem no computer can solve.</p>
    <Learned items={[
      <>Turing machines can be listed, so a <b>diagonal</b> machine that disagrees with every one of them on its own description can’t be in the list.</>,
      <>If a decider H for A<sub>TM</sub> existed, D would be a real machine with no consistent answer on ⟨D⟩. So <b>A<sub>TM</sub> is undecidable</b>.</>,
      <>A<sub>TM</sub> is still <b>recognizable</b>: simulate and wait. It just can’t always say no.</>,
      <>Decidable = recognizable + co-recognizable, so the complement of A<sub>TM</sub> is <b>not recognizable</b>.</>,
      <>Next lesson: use A<sub>TM</sub> to prove other problems undecidable, by <b>reduction</b>.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/deciders">See A<sub>TM</sub> on the deciders page <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Flip the diagonal', Body: StepDiagonal },
  { title: 'D meets itself', Body: StepSelf },
  { title: 'Recognize, don’t decide', Body: StepRecognize },
  { title: 'The other side', Body: StepComplement },
  { title: 'Undecidable', Body: StepDone, free: true },
]

export function UndecidableLesson() {
  return <LessonShell id="undecidable" steps={steps} />
}
