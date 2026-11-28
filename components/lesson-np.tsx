'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { Choices, Feedback, Learned, LessonShell, type LessonStep, type StepProps } from './lesson-kit'
import { NpGraphView } from './np-graph'
import { clauseText, clauseTrue, cliqueToAssignment, cnfToClique, edgeSet, formulaTrue, isClique, parseCnf, type Assignment, type Formula } from '../lib/np'

/**
 * Lesson 10: NP, NP-completeness and NP-hardness (Sipser 7.3 to 7.5). The learner checks a
 * certificate for a formula, sees why finding one by brute force blows up, finds a clique in the
 * 3SAT → CLIQUE graph and reads the assignment back, and places problems on the P / NP map.
 */

const formula = (text: string): Formula => {
  const result = parseCnf(text)
  if (!result.ok) throw new Error(result.message)
  return result.formula
}

// ---------- 1. Check a certificate ----------

const PUZZLE = formula('(x ∨ y ∨ z) ∧ (¬x ∨ ¬y) ∧ (¬y ∨ ¬z) ∧ (¬x ∨ ¬z) ∧ (y ∨ w) ∧ (¬w ∨ x)')

function StepCheck({ onSolved, solved }: StepProps) {
  const [values, setValues] = useState<Assignment>(() => Object.fromEntries(PUZZLE.variables.map(variable => [variable, false])))
  const flip = (variable: string) => {
    const next = { ...values, [variable]: !values[variable] }
    setValues(next)
    if (formulaTrue(PUZZLE, next)) onSolved()
  }
  const done = formulaTrue(PUZZLE, values)
  const count = PUZZLE.clauses.filter(clause => clauseTrue(clause, values)).length
  return <>
    <p>Some problems are hard to <b>solve</b> but easy to <b>check</b>. A Boolean formula is <b>satisfiable</b> when some true/false setting of its variables makes it true. SAT is the language of satisfiable formulas.</p>
    <p className="lesson-task">Set the variables so that every clause is true.</p>
    <div className="lesson-row np-vars" role="group" aria-label="Variables">
      {PUZZLE.variables.map(variable => <button key={variable} type="button" className={`lesson-chip ${values[variable] ? 'is-on' : ''}`} aria-pressed={values[variable]} onClick={() => flip(variable)}>
        {variable} = {values[variable] ? 'T' : 'F'}
      </button>)}
    </div>
    <ul className="np-clauses" aria-label="Clauses">
      {PUZZLE.clauses.map((clause, at) => {
        const ok = clauseTrue(clause, values)
        return <li key={at} className={ok ? 'is-true' : 'is-false'}>{ok ? <Check size={13} aria-label="true" /> : <X size={13} aria-label="false" />}<code className="np-f">{clauseText(clause)}</code></li>
      })}
    </ul>
    {done || solved
      ? <Feedback ok>All six clauses are true. Checking that took one pass over the formula, which is <b>polynomial time</b>. Your setting is a <b>certificate</b>: a short piece of evidence that the answer is yes.</Feedback>
      : <p className="lesson-task">{count} of {PUZZLE.clauses.length} clauses are true.</p>}
  </>
}

// ---------- 2. NP ----------

function StepNp({ onSolved, solved }: StepProps) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  return <>
    <p><b>NP</b> is the class of languages with a <b>polynomial-time verifier</b>: an algorithm that, given an input and a certificate, checks the certificate in polynomial time, and some certificate passes exactly when the input is in the language (Sipser, Definition 7.18). Equivalently, a <b>nondeterministic</b> TM decides it in polynomial time by guessing the certificate (Theorem 7.20).</p>
    <p className="lesson-task">Without a clever idea, finding a certificate means trying them. How many settings does brute force try for a formula with 100 variables?</p>
    <Choices picked={first} answer="exp" onPick={setFirst} options={[
      { value: 'n', label: '100' }, { value: 'n2', label: '100² = 10,000' }, { value: 'exp', label: 'up to 2¹⁰⁰' },
    ]} />
    {first && (first === 'exp'
      ? <Feedback ok>Each variable doubles the count: 2¹⁰⁰ is about 10³⁰. At a billion settings a second that’s far longer than the age of the universe. <b>Checking</b> one setting is fast; <b>finding</b> one this way is hopeless.</Feedback>
      : <Feedback ok={false}>Each variable can be T or F, independently of the others. How many combinations is that?</Feedback>)}
    {(first === 'exp' || solved) && <>
      <p className="lesson-task">Is every language in P also in NP?</p>
      <Choices picked={second} answer="yes" onPick={value => { setSecond(value); if (value === 'yes') onSolved() }} options={[
        { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'open', label: 'Nobody knows' },
      ]} />
      {second && (second === 'yes'
        ? <Feedback ok>Yes: the verifier can ignore the certificate and just solve the problem. So <b>P ⊆ NP</b>. Whether P = NP, whether every easy-to-check problem is also easy to solve, is the famous open question.</Feedback>
        : <Feedback ok={false}>{second === 'open' ? 'That’s the other direction. This one is easy:' : 'Think about it:'} if you can solve the problem in polynomial time, does the verifier even need the certificate?</Feedback>)}
    </>}
  </>
}

// ---------- 3. 3SAT → CLIQUE ----------

// Sipser's Figure 7.33 formula.
const SIPSER = formula('(x ∨ x ∨ y) ∧ (¬x ∨ ¬y ∨ ¬y) ∧ (¬x ∨ y ∨ y)')
const SIPSER_GRAPH = cnfToClique(SIPSER)

function StepClique({ onSolved, solved }: StepProps) {
  const { graph, k } = SIPSER_GRAPH
  const [chosen, setChosen] = useState<string[]>([])
  const edges = useMemo(() => edgeSet(graph), [graph])
  const node = (id: string) => graph.nodes.find(item => item.id === id)!
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(item => item !== id) : [...chosen, id]
    setChosen(next)
    if (next.length === k && isClique(graph, next)) onSolved()
  }
  const clique = chosen.length === k && isClique(graph, chosen)
  const sameClause = chosen.some((a, i) => chosen.some((b, j) => j > i && node(a).group === node(b).group))
  const clash = chosen.some((a, i) => chosen.some((b, j) => j > i && node(a).group !== node(b).group && !edges.has(a < b ? `${a}|${b}` : `${b}|${a}`)))
  const assignment = clique ? cliqueToAssignment(SIPSER, graph, chosen) : null
  return <>
    <p>CLIQUE asks: does graph G have <b>k nodes that are all joined to each other</b>? It’s in NP, since the k nodes are the certificate. Sipser’s Theorem 7.32 turns any 3-CNF formula φ into a graph in polynomial time:</p>
    <p className="lesson-formula">One node per literal, grouped by clause. Join every two nodes, except two in the same clause, and except x with ¬x. Set k = the number of clauses.</p>
    <p>Here φ = <code className="np-f">{SIPSER.clauses.map(clauseText).join(' ∧ ')}</code>, so k = {k}.</p>
    <div className="lesson-diagram np-diagram">
      <NpGraphView graph={graph} selected={new Set(chosen)} onToggle={toggle} label="Graph built from the formula"
        groupOf={group => `C${Number(group.slice(1)) + 1}`}
        edgeLook={(a, b) => chosen.includes(a) && chosen.includes(b) ? 'on' : chosen.length ? 'faded' : 'plain'} />
    </div>
    {clique || (solved && !chosen.length)
      ? <Feedback ok>{assignment
        ? <>A {k}-clique: {chosen.map(id => <code key={id}>{node(id).label}</code>).reduce((list, item, at) => at ? <>{list}, {item}</> : item, <></>)}. One node per clause, and never x with ¬x, so making those literals true is consistent: {SIPSER.variables.map(variable => `${variable} = ${assignment[variable] ? 'T' : 'F'}`).join(', ')}. That satisfies every clause. </>
        : null}φ is satisfiable <b>exactly when</b> the graph has a k-clique, and building the graph takes polynomial time. So <b>3SAT ≤<sub>p</sub> CLIQUE</b>.</Feedback>
      : <p className="lesson-task">
        {sameClause ? 'Two of your nodes are in the same clause, and nodes in one clause are never joined. '
          : clash ? 'Two of your nodes are x and ¬x, which are never joined. '
          : ''}Click {k} nodes that are all joined to each other ({chosen.length} chosen).
      </p>}
  </>
}

// ---------- 4. NP-complete ----------

function StepComplete({ onSolved, solved }: StepProps) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  return <>
    <p>A <b>polynomial-time reduction</b> A ≤<sub>p</sub> B is a mapping reduction computed in polynomial time. A language B is <b>NP-complete</b> when B is in NP <b>and</b> every A in NP reduces to it (Definition 7.34). These are the hardest problems in NP.</p>
    <p>The <b>Cook–Levin theorem</b> says SAT is NP-complete: any polynomial-time verifier’s whole computation can be written as one formula (Theorem 7.37). 3SAT is too (Corollary 7.42). After that, each new proof needs only one reduction.</p>
    <p className="lesson-task">You show X is in NP and 3SAT ≤<sub>p</sub> X. What follows?</p>
    <Choices picked={first} answer="npc" onPick={setFirst} options={[
      { value: 'p', label: 'X is in P' }, { value: 'npc', label: 'X is NP-complete' }, { value: 'none', label: 'Nothing yet' },
    ]} />
    {first && (first === 'npc'
      ? <Feedback ok>Right (Theorem 7.36). Every NP problem reduces to 3SAT, and 3SAT reduces to X. Polynomial reductions compose, so every NP problem reduces to X. That’s how CLIQUE, VERTEX-COVER, HAMPATH and SUBSET-SUM were shown NP-complete.</Feedback>
      : <Feedback ok={false}>{first === 'p' ? 'The reduction goes from 3SAT to X, so it says X is at least as hard as 3SAT, not that it is easy.' : 'Remember the direction from lesson 8: reduce the known hard problem to the new one. That’s exactly what you did.'}</Feedback>)}
    {(first === 'npc' || solved) && <>
      <p className="lesson-task">Someone finds a polynomial-time algorithm for CLIQUE. What does that mean?</p>
      <Choices picked={second} answer="pnp" onPick={value => { setSecond(value); if (value === 'pnp') onSolved() }} options={[
        { value: 'only', label: 'Only CLIQUE gets easier' }, { value: 'pnp', label: 'P = NP' }, { value: 'sat', label: 'Only CLIQUE and 3SAT get easier' },
      ]} />
      {second && (second === 'pnp'
        ? <Feedback ok>Yes. Every NP problem reduces to CLIQUE in polynomial time, so all of NP would be in P (Theorem 7.35). That’s why nobody expects it: one fast algorithm for any NP-complete problem would solve them all.</Feedback>
        : <Feedback ok={false}>CLIQUE is NP-complete, so <b>every</b> NP problem reduces to it. What does a fast CLIQUE algorithm do for each of them?</Feedback>)}
    </>}
  </>
}

// ---------- 5. NP-hard and the map ----------

type Bin = 'p' | 'npc' | 'hard'
const BINS: { value: Bin; label: string }[] = [{ value: 'p', label: 'in P' }, { value: 'npc', label: 'NP-complete' }, { value: 'hard', label: 'NP-hard, not in NP' }]
const PROBLEMS: { name: string; bin: Bin; why: string }[] = [
  { name: 'PATH', bin: 'p', why: 'The marking algorithm runs in polynomial time (Theorem 7.14).' },
  { name: '3SAT', bin: 'npc', why: 'Cook–Levin, then the reduction from SAT (Corollary 7.42).' },
  { name: 'RELPRIME', bin: 'p', why: 'The Euclidean algorithm from lesson 9 (Theorem 7.15).' },
  { name: 'VERTEX-COVER', bin: 'npc', why: 'In NP, and 3SAT reduces to it (Theorem 7.44). Try it in the lab.' },
  { name: 'HALT_TM', bin: 'hard', why: 'Undecidable, so not in NP. But 3SAT ≤p HALT_TM: map φ to a machine that tries every setting and loops forever if none works.' },
]

function StepMap({ onSolved }: StepProps) {
  const [guesses, setGuesses] = useState<Record<string, Bin>>({})
  const [checked, setChecked] = useState(false)
  const allRight = PROBLEMS.every(problem => guesses[problem.name] === problem.bin)
  return <>
    <p>A problem is <b>NP-hard</b> when every NP problem reduces to it in polynomial time, <b>whether or not it is in NP itself</b>. NP-complete means NP-hard <b>and</b> in NP. If P ≠ NP, as almost everyone believes, the picture looks like this:</p>
    <div className="lesson-diagram np-map">
      <svg viewBox="0 0 560 250" role="img" aria-label="P sits inside NP. NP-complete is the part of NP that overlaps NP-hard. NP-hard extends beyond NP.">
        <defs><clipPath id="np-clip"><ellipse cx="215" cy="125" rx="185" ry="105" /></clipPath></defs>
        <rect className="np-map-hard" x="330" y="20" width="215" height="210" rx="28" />
        <ellipse className="np-map-np" cx="215" cy="125" rx="185" ry="105" />
        <rect className="np-map-npc" x="330" y="20" width="215" height="210" rx="28" clipPath="url(#np-clip)" />
        <ellipse className="np-map-p" cx="160" cy="125" rx="88" ry="62" />
        <text x="160" y="120" textAnchor="middle">P</text>
        <text x="160" y="142" textAnchor="middle" className="np-map-small">PATH, RELPRIME</text>
        <text x="250" y="50" textAnchor="middle">NP</text>
        <text x="365" y="118" textAnchor="middle" className="np-map-small">NP-</text>
        <text x="365" y="134" textAnchor="middle" className="np-map-small">complete</text>
        <text x="470" y="50" textAnchor="middle">NP-hard</text>
      </svg>
    </div>
    <p className="lesson-task">Place each problem.</p>
    <div className="lesson-predict is-wide np-sort">
      {PROBLEMS.map(problem => <div key={problem.name} className={`lesson-predict-row ${checked ? (guesses[problem.name] === problem.bin ? 'is-right' : 'is-wrong') : ''}`}>
        <code>{problem.name === 'HALT_TM' ? <>HALT<sub>TM</sub></> : problem.name}</code>
        <div role="radiogroup" aria-label={`Where does ${problem.name} go?`}>
          {BINS.map(bin => <button key={bin.value} type="button" role="radio" aria-checked={guesses[problem.name] === bin.value}
            onClick={() => { setGuesses(current => ({ ...current, [problem.name]: bin.value })); setChecked(false) }}>{bin.label}</button>)}
        </div>
        {checked && <small>{problem.why}</small>}
      </div>)}
    </div>
    <button type="button" className="primary-button lesson-check" disabled={PROBLEMS.some(problem => !guesses[problem.name])}
      onClick={() => { setChecked(true); if (allRight) onSolved() }}>Check</button>
    {checked && (allRight
      ? <Feedback ok>That’s the map. P inside NP, NP-complete at the hard edge of NP, and NP-hard reaching beyond it to problems that aren’t even decidable. If P = NP were true, P, NP and NP-complete would collapse into one region (apart from the trivial languages ∅ and Σ*).</Feedback>
      : <Feedback ok={false}>Some are off. Each row now shows why. Change your answers and check again.</Feedback>)}
  </>
}

// ---------- 6. Recap ----------

function StepDone() {
  return <>
    <p>You’ve reached the edge of what anyone knows.</p>
    <Learned items={[
      <><b>NP</b>: a “yes” has a certificate that can be <b>checked</b> in polynomial time. P ⊆ NP, and whether they are equal is open.</>,
      <><b>A ≤<sub>p</sub> B</b>: a polynomial-time mapping reduction. 3SAT ≤<sub>p</sub> CLIQUE takes one node per literal and k = the number of clauses.</>,
      <><b>NP-complete</b>: in NP, and everything in NP reduces to it. SAT is the first (Cook–Levin); 3SAT, CLIQUE and VERTEX-COVER follow by reduction.</>,
      <><b>NP-hard</b>: everything in NP reduces to it, in NP or not. HALT<sub>TM</sub> is NP-hard but not in NP.</>,
      <>A fast algorithm for any one NP-complete problem would give <b>P = NP</b>.</>,
    ]} />
    <div className="lesson-next">
      <Link className="secondary-button" href="/np-lab">Type your own formula into the reduction lab <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Easy to check', Body: StepCheck },
  { title: 'Hard to find', Body: StepNp },
  { title: 'A formula becomes a graph', Body: StepClique },
  { title: 'The hardest problems in NP', Body: StepComplete },
  { title: 'NP-hard', Body: StepMap },
  { title: 'P vs NP', Body: StepDone, free: true },
]

export function NpLesson() {
  return <LessonShell id="np" steps={steps} />
}

