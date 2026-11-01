'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Choices, Diagram, Feedback, Learned, LessonShell, PredictList, TestList, allWords, regexMatches, useSolvedWhen, type LessonStep, type StepProps } from './lesson-kit'
import { regexToNfa } from '../lib/regex-to-nfa'
import { nfaToDfa } from '../lib/nfa-to-dfa'
import { minimizeDfa } from '../lib/dfa-minimize'
import type { AutomatonGraph } from '../lib/automaton-graph'

/**
 * Lesson 3: regular expressions. Union, concatenation and star are taught by predicting matches,
 * then the learner reads and writes regexes, and finally sees that each one is a DFA in disguise.
 */

const matcher = (pattern: string) => (word: string) => regexMatches(pattern, word) === true

/** 1. Concatenation and union. */
function StepUnion({ onSolved }: StepProps) {
  return <>
    <p>A <b>regular expression</b> is a short formula for a set of strings. Letters written side by side mean “this, <b>then</b> that”: <code>ab</code> matches only the string ab. A bar means “<b>or</b>”: <code>ab|ba</code> matches ab or ba. (Sipser writes the bar as ∪.)</p>
    <p className="lesson-task">Which strings does <code>ab|ba</code> match? A match must cover the whole string.</p>
    <PredictList words={['ab', 'ba', 'aa', 'abba', '']} truth={matcher('ab|ba')} onSolved={onSolved} yes="matches" no="no match"
      success={<>Right. <code>abba</code> doesn’t match: it is <b>ab then ba</b>, which would be <code>(ab|ba)(ab|ba)</code>.</>} />
  </>
}

/** 2. Star. */
function StepStar({ onSolved }: StepProps) {
  return <>
    <p>The <b>star</b> means “<b>repeat any number of times</b>, including zero”. <code>a*</code> matches ε, a, aa, aaa, … Parentheses group, so <code>(ab)*</code> repeats the whole block ab.</p>
    <p className="lesson-task">Which strings does <code>(ab)*</code> match? ε is the empty string.</p>
    <PredictList words={['', 'ab', 'abab', 'aba', 'ba']} truth={matcher('(ab)*')} onSolved={onSolved} yes="matches" no="no match"
      success={<>Right. Zero repetitions is allowed, so ε matches. <code>aba</code> leaves a half block over.</>} />
  </>
}

/** 3. Read a regex aloud. */
function StepRead({ onSolved }: StepProps) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  const pick = (setter: (value: string) => void, other: string | null, otherAnswer: string, answer: string) => (value: string) => {
    setter(value)
    if (value === answer && other === otherAnswer) onSolved()
  }
  return <>
    <p>The most useful piece is <code>(a|b)*</code>: any letter, any number of times, so it means “<b>anything</b>”. With it you can read most regexes aloud.</p>
    <p className="lesson-task">What does <code>(a|b)*b</code> describe?</p>
    <Choices picked={first} answer="ends" onPick={pick(setFirst, second, 'order', 'ends')} options={[
      { value: 'contains', label: 'Contains a b' }, { value: 'ends', label: 'Ends in b' }, { value: 'one', label: 'Exactly one b' },
    ]} />
    {first && (first === 'ends' ? <Feedback ok>Yes: anything, then a final b.</Feedback> : <Feedback ok={false}>Read it left to right: anything, and then what has to come last?</Feedback>)}
    <p className="lesson-task">And <code>a*b*</code>?</p>
    <Choices picked={second} answer="order" onPick={pick(setSecond, first, 'ends', 'order')} options={[
      { value: 'same', label: 'As many a’s as b’s' }, { value: 'order', label: 'No a comes after a b' }, { value: 'any', label: 'Anything' },
    ]} />
    {second && (second === 'order' ? <Feedback ok>Yes: some a’s, then some b’s. <code>ba</code> doesn’t match. The counts are independent, so it can’t insist on equal numbers.</Feedback> : <Feedback ok={false}>Try a few strings: does <code>aab</code> match? Does <code>ba</code>?</Feedback>)}
  </>
}

const STARTS_TESTS = ['a', 'ab', 'abb', 'aab', '', 'b', 'ba', 'bab']
const startsWithA = (word: string) => word.startsWith('a')

/** 4. Write one. */
function StepWrite({ onSolved, solved }: StepProps) {
  const [pattern, setPattern] = useState('')
  const clean = pattern.replace(/\s/g, '')
  const valid = clean !== '' && regexToNfa(clean).ok && /^[ab|*()+?]*$/.test(clean)
  const rows = STARTS_TESTS.map(word => ({ word, want: startsWithA(word), got: valid ? regexMatches(clean, word) : null }))
  // Every string up to length 7, not just the visible tests, so a regex can't pass by luck.
  const counterexample = useMemo(() => valid ? allWords(['a', 'b'], 7).find(word => regexMatches(clean, word) !== startsWithA(word)) ?? null : null, [clean, valid])
  const passing = valid && counterexample === null
  useSolvedWhen(passing, solved, onSolved)
  return <>
    <p>Your turn. Write a regex for <b>every string over a and b that starts with a</b>. You can use letters, <code>|</code>, <code>*</code> and parentheses.</p>
    <label className="lesson-input">
      <span>Regex</span>
      <input value={pattern} onChange={event => setPattern(event.target.value)} placeholder="for example a(ab)*" spellCheck={false} autoCapitalize="off" autoComplete="off" />
    </label>
    <TestList rows={rows} yes="should match" no="shouldn’t" />
    {passing
      ? <Feedback ok>That works for every string up to length 7. <code>a(a|b)*</code> is the usual answer: an a, then anything.</Feedback>
      : clean && !valid ? <Feedback ok={false}>That doesn’t parse. Check that every parenthesis is closed, and use only a, b, |, * and ( ).</Feedback>
      : counterexample !== null ? <Feedback ok={false}>Not yet. It gets <code>{counterexample || 'ε'}</code> wrong: that string {startsWithA(counterexample) ? 'starts with a but doesn’t match' : 'matches but doesn’t start with a'}. Hint: an a, then “anything”.</Feedback>
      : <p className="lesson-task">Type a regex until every test passes.</p>}
  </>
}

function regexDfa(pattern: string): AutomatonGraph | null {
  const nfa = regexToNfa(pattern)
  if (!nfa.ok) return null
  const dfa = nfaToDfa(nfa.graph)
  if (!dfa.ok) return null
  const small = minimizeDfa(dfa.graph)
  if (!small.ok) return null
  let q = 0
  return { ...small.graph, states: small.graph.states.map(state => ({ ...state, label: `q${'₀₁₂₃₄₅₆₇₈₉'[q++ % 10]}` })) }
}

/** 5. Every regex is a DFA in disguise. */
function StepSame() {
  const [pattern, setPattern] = useState('(a|b)*b')
  const clean = pattern.replace(/\s/g, '')
  const graph = useMemo(() => /^[ab|*()+?]*$/.test(clean) && clean.length <= 30 ? regexDfa(clean) : null, [clean])
  return <>
    <p>Regular expressions describe <b>exactly the same languages</b> as DFAs and NFAs. That is why those languages are called <b>regular</b>. A regex turns into an NFA piece by piece, and the NFA turns into a DFA with the subset construction. Edit the regex and watch its smallest DFA.</p>
    <label className="lesson-input">
      <span>Regex</span>
      <input value={pattern} onChange={event => setPattern(event.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" />
    </label>
    {graph ? <Diagram graph={graph} label={`The smallest DFA for ${clean}`} /> : <p className="lesson-task">Use only a, b, |, * and parentheses to see a machine.</p>}
    <p>Try <code>a*b*</code>, <code>(ab)*</code> or <code>(a|b)*ab</code>, which is the lock from lesson 1.</p>
  </>
}

/** 6. Recap. */
function StepDone() {
  return <>
    <Learned items={[
      <>Side by side means <b>then</b>, <code>|</code> (∪) means <b>or</b>, and <code>*</code> means <b>any number of times</b>, zero included.</>,
      <><code>(a|b)*</code> is “anything”. Most patterns are built around it.</>,
      <>Regexes, NFAs and DFAs all describe the same class: the <b>regular languages</b>.</>,
    ]} />
    <p>So is every language regular? No. Next lesson finds one that no regex and no DFA can describe.</p>
    <div className="lesson-next">
      <Link className="secondary-button" href="/nfa">Try regex to NFA in the workspace <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </>
}

const steps: LessonStep[] = [
  { title: 'Then, or', Body: StepUnion },
  { title: 'Star: repeat it', Body: StepStar },
  { title: 'Read it aloud', Body: StepRead },
  { title: 'Write your own', Body: StepWrite },
  { title: 'Same power as a DFA', Body: StepSame, free: true },
  { title: 'What you learned', Body: StepDone, free: true },
]

export function RegexLesson() {
  return <LessonShell id="regex" steps={steps} />
}
