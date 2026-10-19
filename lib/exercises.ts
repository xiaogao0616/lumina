import { regexToNfa } from './regex-to-nfa'
import { compareAutomata } from './regular-ops'
import type { AutomatonGraph } from './automaton-graph'

/**
 * Practice problems: build a machine for a described language. Each answer is a regular expression
 * in the Regex → NFA syntax, and a submission is checked by deciding equivalence with it, so any
 * correct machine passes, however it is drawn, and a wrong one comes back with the shortest string
 * it gets wrong.
 */

export type Exercise = {
  id: string
  mode: 'dfa' | 'nfa'
  level: 1 | 2 | 3
  title: string
  prompt: string
  alphabet: string[]
  answer: string
  hint: string
}

export const EXERCISES: Exercise[] = [
  { id: 'ends-ab', mode: 'dfa', level: 1, title: 'Ends in ab', alphabet: ['a', 'b'], answer: '(a|b)*ab',
    prompt: 'Accept exactly the strings over {a, b} that end in ab.', hint: 'Remember the last two characters you read: three states are enough.' },
  { id: 'even-a', mode: 'dfa', level: 1, title: 'Even number of a’s', alphabet: ['a', 'b'], answer: 'b*(ab*ab*)*',
    prompt: 'Accept the strings over {a, b} with an even number of a’s (zero counts as even).', hint: 'Two states: “even so far” and “odd so far”. The b’s never change which one you are in.' },
  { id: 'length-3', mode: 'dfa', level: 1, title: 'Length divisible by 3', alphabet: ['a', 'b'], answer: '((a|b)(a|b)(a|b))*',
    prompt: 'Accept the strings over {a, b} whose length is a multiple of 3, including the empty string.', hint: 'Count the length modulo 3.' },
  { id: 'a-then-b', mode: 'dfa', level: 1, title: 'Every a is followed by b', alphabet: ['a', 'b'], answer: '(b|ab)*',
    prompt: 'Accept the strings over {a, b} in which every a is immediately followed by a b.', hint: 'After an a, the only safe next character is b. Don’t forget a sink for “aa”.' },
  { id: 'at-most-two-a', mode: 'dfa', level: 1, title: 'At most two a’s', alphabet: ['a', 'b'], answer: 'b*a?b*a?b*',
    prompt: 'Accept the strings over {a, b} with at most two a’s.', hint: 'Count a’s up to 2, and send a third one to a dead state.' },
  { id: 'contains-aba', mode: 'dfa', level: 2, title: 'Contains aba', alphabet: ['a', 'b'], answer: '(a|b)*aba(a|b)*',
    prompt: 'Accept the strings over {a, b} that contain aba as a substring.', hint: 'Track how much of aba you have matched. On a mismatch, fall back to the longest part that still matches.' },
  { id: 'no-bb', mode: 'dfa', level: 2, title: 'No two b’s in a row', alphabet: ['a', 'b'], answer: '(a|ba)*b?',
    prompt: 'Accept the strings over {a, b} that never have two b’s next to each other.', hint: 'Remember whether the last character was b.' },
  { id: 'same-ends', mode: 'dfa', level: 2, title: 'Starts and ends alike', alphabet: ['a', 'b'], answer: 'a|b|a(a|b)*a|b(a|b)*b',
    prompt: 'Accept the non-empty strings over {a, b} that start and end with the same character.', hint: 'Branch on the first character, then remember the last one.' },
  { id: 'binary-3', mode: 'dfa', level: 3, title: 'Binary multiples of 3', alphabet: ['0', '1'], answer: '(0|1(01*0)*1)*',
    prompt: 'Read a binary number, most significant bit first. Accept when it is divisible by 3 (the empty string counts as 0).', hint: 'Keep the remainder r. Reading bit b turns it into (2r + b) mod 3.' },
  { id: 'third-from-end', mode: 'nfa', level: 1, title: 'Third from the end is a', alphabet: ['a', 'b'], answer: '(a|b)*a(a|b)(a|b)',
    prompt: 'Accept the strings over {a, b} whose third character from the end is a.', hint: 'Guess when you are reading that a, then check exactly two more characters follow.' },
  { id: 'ab-aba-star', mode: 'nfa', level: 2, title: '(ab ∪ aba)*', alphabet: ['a', 'b'], answer: '(ab|aba)*',
    prompt: 'Accept the strings that split into blocks, each block ab or aba.', hint: 'From the start, read ab and either return or read one more a. ε-moves make this easy.' },
  { id: 'aa-or-bab', mode: 'nfa', level: 2, title: 'Ends in aa, or contains bab', alphabet: ['a', 'b'], answer: '(a|b)*aa|(a|b)*bab(a|b)*',
    prompt: 'Accept the strings over {a, b} that end in aa or contain bab somewhere.', hint: 'Build one small NFA for each half, then join them with ε-moves from a new start.' },
]

export const exerciseById = (id: string | undefined) => EXERCISES.find(exercise => exercise.id === id)

export type ExerciseVerdict =
  | { status: 'correct' }
  | { status: 'wrong'; accepts: string | null; rejects: string | null }
  | { status: 'error'; message: string }

/**
 * Checks a machine against an exercise. `accepts` is the shortest string the machine accepts but
 * shouldn't, `rejects` the shortest it rejects but should accept. Characters outside the exercise's
 * alphabet count against the machine like any other mistake.
 */
export function checkExercise(exercise: Exercise, graph: AutomatonGraph): ExerciseVerdict {
  const reference = regexToNfa(exercise.answer)
  if (!reference.ok) return { status: 'error', message: reference.message }
  const result = compareAutomata(graph, { ...reference.graph, symbols: exercise.alphabet })
  if (!result.ok) return { status: 'error', message: result.message.replace(/^First machine: /, '') }
  const { comparison } = result
  return comparison.equivalent ? { status: 'correct' } : { status: 'wrong', accepts: comparison.onlyFirst, rejects: comparison.onlySecond }
}

export const SOLVED_KEY = 'automata-lab-practice-solved'

export function readSolved(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}
