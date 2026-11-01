'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Choices, Diagram, Feedback, Keys, Learned, LessonShell, PredictList, Typed, labelOf, machine, nfaAccepts, nfaSets, type LessonStep, type StepProps } from './lesson-kit'
import { nfaToDfa } from '../lib/nfa-to-dfa'
import type { AutomatonGraph } from '../lib/automaton-graph'

/**
 * Lesson 2: nondeterminism. An NFA may have several arrows (or none) for a letter, and ε-arrows
 * that need no letter. The learner watches copies of the machine split and die, then meets the
 * equivalent DFA whose states are sets of NFA states.
 */

// Ends in ab: stay in s, and guess when the final "ab" begins.
const ENDS_AB = machine(
  [['s', 's', 'start', 0, 0], ['p', 'p', 'state', 240, 0], ['f', 'f', 'accept', 480, 0]],
  [['s', 's', 'ab'], ['s', 'p', 'a'], ['p', 'f', 'b']],
)

// a* ∪ b*: two ε-arrows pick a branch before anything is read.
const A_OR_B = machine(
  [['q', 'q', 'start', 0, 100], ['x', 'x', 'accept', 300, 0], ['y', 'y', 'accept', 300, 200]],
  [['q', 'x', 'ε'], ['q', 'y', 'ε'], ['x', 'x', 'a'], ['y', 'y', 'b']],
)

const setText = (graph: AutomatonGraph, ids: string[]) => ids.length ? `{${ids.map(id => labelOf(graph, id)).join(', ')}}` : '∅ (every copy died)'
const trace = (graph: AutomatonGraph, word: string) => nfaSets(graph, word).map(ids => setText(graph, ids)).join(' → ')

/** 1. Two arrows for one letter: the machine splits. */
function StepSplit({ onSolved, solved }: StepProps) {
  const [input, setInput] = useState('')
  const sets = nfaSets(ENDS_AB, input)
  const live = sets[sets.length - 1]
  const press = (char: string) => { const next = input + char; setInput(next); if (nfaAccepts(ENDS_AB, next)) onSolved() }
  return <>
    <p>In a DFA every letter has exactly one arrow. A <b>nondeterministic</b> finite automaton, or <b>NFA</b>, drops that rule. Look at <b>s</b>: reading <code>a</code> it can stay in <b>s</b> or move to <b>p</b>. The NFA doesn’t pick. It <b>splits into copies</b> and follows both.</p>
    <Diagram graph={ENDS_AB} current={live} label={`The NFA. Live states: ${setText(ENDS_AB, live)}`} />
    <div className="lesson-row"><Typed input={input} /><Keys onPress={press} /><button type="button" className="text-button" onClick={() => setInput('')}><RotateCcw size={13} aria-hidden="true" /> Reset</button></div>
    <p className="lesson-set">Live copies: <b>{setText(ENDS_AB, live)}</b></p>
    <p className="lesson-task">{solved ? 'A copy reached f. Keep pressing: watch copies appear on a and vanish when they have no arrow.' : 'Press buttons and watch the yellow states. Get a copy into the accept state f.'}</p>
  </>
}

/** 2. Accept if any copy accepts. */
function StepAccept({ onSolved }: StepProps) {
  return <>
    <p>When the input runs out, the NFA <b>accepts if at least one copy</b> is in an accept state. The other copies don’t matter. A copy in <b>p</b> that reads <code>a</code> has no arrow, so that copy simply dies.</p>
    <Diagram graph={ENDS_AB} label="The ends-in-ab NFA" />
    <p className="lesson-task">Does the NFA accept each string? Decide, then check.</p>
    <PredictList words={['ab', 'ba', 'aab', 'abb', 'bab']} truth={word => nfaAccepts(ENDS_AB, word)} onSolved={onSolved}
      explain={word => trace(ENDS_AB, word)}
      success={<>All correct. This NFA accepts exactly the strings that end in <code>ab</code>, the same language as the lock in lesson 1, with one fewer arrow to think about.</>} />
  </>
}

/** 3. Which copies are still alive? */
function StepAlive({ onSolved, solved }: StepProps) {
  const [picked, setPicked] = useState<string[]>([])
  const [checked, setChecked] = useState(false)
  const answer = nfaSets(ENDS_AB, 'abb').at(-1)!
  const right = picked.length === answer.length && answer.every(id => picked.includes(id))
  const highlight = useMemo(() => Object.fromEntries(picked.map(id => [id, 'marked' as const])), [picked])
  const toggle = (id: string) => { setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); setChecked(false) }
  return <>
    <p>You can run an NFA by hand by keeping a <b>set</b> of live states and updating it one letter at a time: follow every arrow from every live state.</p>
    <Diagram graph={ENDS_AB} highlight={highlight} onPick={toggle} label="The NFA. Tap states to select them." />
    <p className="lesson-task">The NFA reads <code>a b b</code>. Tap every state that still has a live copy, then check.</p>
    <button type="button" className="primary-button lesson-check" disabled={!picked.length} onClick={() => { setChecked(true); if (right) onSolved() }}>Check</button>
    {checked && (right || solved
      ? <Feedback ok>Right, only <b>s</b>. {trace(ENDS_AB, 'abb')}. The copy that reached <b>f</b> on <code>ab</code> had no arrow for the last <code>b</code>, so it died, and the string is rejected.</Feedback>
      : <Feedback ok={false}>Not quite. Start from {'{s}'} and update the set for each letter: <code>a</code>, then <code>b</code>, then <code>b</code>.</Feedback>)}
  </>
}

/** 4. ε-arrows: move without reading. */
function StepEpsilon({ onSolved }: StepProps) {
  return <>
    <p>An NFA may also have <b>ε-arrows</b>. A copy can take one <b>without reading a letter</b>. This machine starts in <b>q</b>, but before reading anything it already has copies in <b>x</b> (which only reads a’s) and <b>y</b> (which only reads b’s). It accepts <code>a*</code> ∪ <code>b*</code>: all a’s, or all b’s.</p>
    <Diagram graph={A_OR_B} current={nfaSets(A_OR_B, '')[0]} label="An NFA with two ε-arrows. q, x and y are live at the start." />
    <p className="lesson-task">Does it accept each string? ε means the empty string.</p>
    <PredictList words={['', 'aaa', 'bb', 'ab', 'ba']} truth={word => nfaAccepts(A_OR_B, word)} onSolved={onSolved}
      explain={word => trace(A_OR_B, word)}
      success={<>All correct. The empty string is accepted because the ε-arrows reach an accept state before reading anything. A mixed string kills both copies.</>} />
  </>
}

const TWIN = (() => {
  const result = nfaToDfa(ENDS_AB)
  if (!result.ok) throw new Error(result.message)
  return result.graph
})()

// The subset construction labels a DFA state with its NFA states' labels in sorted order.
const subsetName = (ids: string[]) => `{${ids.map(id => labelOf(ENDS_AB, id)).sort((a, b) => a.localeCompare(b)).join(', ')}}`
const TWIN_AFTER_A = TWIN.states.find(state => state.label === subsetName(nfaSets(ENDS_AB, 'a').at(-1)!))!.id

/** 5. Every NFA has a DFA twin whose states are sets. */
function StepTwin({ onSolved, solved }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const target = TWIN_AFTER_A
  const highlight = useMemo(() => picked ? { [picked]: 'marked' as const } : {}, [picked])
  return <>
    <p>Here is the surprise: NFAs are <b>not more powerful</b> than DFAs. Since the set of live states is all an NFA needs to remember, you can build a DFA whose states <b>are those sets</b>. This is the <b>subset construction</b>. Here is the DFA it builds from our NFA:</p>
    <Diagram graph={TWIN} highlight={highlight} onPick={id => { setPicked(id); if (id === target) onSolved() }} label="The DFA built from the NFA. Tap a state." />
    <p className="lesson-task">Tap the DFA state that stands for “the NFA after reading <code>a</code>”.</p>
    {picked && (picked === target || solved
      ? <Feedback ok>Yes. After <code>a</code> the NFA has copies in s and p, so the DFA is in {labelOf(TWIN, target)}. It accepts wherever the set contains f. The price: an NFA with n states can need up to 2ⁿ DFA states.</Feedback>
      : <Feedback ok={false}>That’s {labelOf(TWIN, picked)}. Which states are live after the NFA reads one <code>a</code>?</Feedback>)}
  </>
}

/** 6. Recap. */
function StepDone() {
  const [picked, setPicked] = useState<string | null>(null)
  return <>
    <Learned items={[
      <>An <b>NFA</b> may have several arrows for a letter, or none, plus <b>ε-arrows</b> that read nothing.</>,
      <>It runs as a <b>set of live copies</b>, and <b>accepts if any copy</b> ends in an accept state.</>,
      <>The <b>subset construction</b> turns any NFA into a DFA, so both recognize exactly the <b>regular languages</b>.</>,
    ]} />
    <p>One last check: why bother with NFAs if DFAs can do the same?</p>
    <Choices picked={picked} answer="small" onPick={setPicked} options={[
      { value: 'small', label: 'They are often much smaller and easier to design' },
      { value: 'more', label: 'They recognize more languages' },
    ]} />
    {picked && (picked === 'small'
      ? <Feedback ok>Exactly. “Ends in ab” is just “guess where ab starts”. Next lesson, NFAs make regular expressions easy to turn into machines.</Feedback>
      : <Feedback ok={false}>The subset construction says otherwise: every NFA has an equivalent DFA.</Feedback>)}
    <div className="lesson-next">
      <Link className="secondary-button" href="/nfa">Open the NFA workspace <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'One letter, two arrows', Body: StepSplit },
  { title: 'Any copy will do', Body: StepAccept },
  { title: 'Who is still alive?', Body: StepAlive },
  { title: 'Moving for free', Body: StepEpsilon },
  { title: 'The DFA twin', Body: StepTwin },
  { title: 'What you learned', Body: StepDone, free: true },
]

export function NfaLesson() {
  return <LessonShell id="nfa" steps={steps} />
}
