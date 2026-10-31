import { SOURCE_COLORS, type AutomatonGraph, type AutomatonState, type StateKind } from './automaton-graph'

/** Ready-made inputs for the decider page: small machines and grammars that make each algorithm's steps easy to follow. */

export type MachineExample = { id: string; name: string; graph: AutomatonGraph }
export type GrammarExample = { id: string; name: string; grammar: string }

type StateSpec = [id: string, label: string, kind: StateKind, x: number, y: number]

function machine(symbols: string[], specs: StateSpec[], edges: [source: string, target: string, symbols: string][]): AutomatonGraph {
  const states: AutomatonState[] = specs.map(([id, label, kind, x, y], index) => ({ id, label, kind, position: { x, y }, color: SOURCE_COLORS[index % SOURCE_COLORS.length] }))
  return {
    symbols, states,
    transitions: edges.map(([source, target, list]) => ({ id: `${source}-${target}`, source, target, symbols: list.split('') })),
  }
}

export const DFA_EXAMPLES: MachineExample[] = [
  { id: 'ends-ab', name: 'Ends in ab (3 states)', graph: machine(['a', 'b'],
    [['q1', 'q₁', 'start', 0, 0], ['q2', 'q₂', 'state', 220, 0], ['q3', 'q₃', 'accept', 440, 0]],
    [['q1', 'q1', 'b'], ['q1', 'q2', 'a'], ['q2', 'q2', 'a'], ['q2', 'q3', 'b'], ['q3', 'q2', 'a'], ['q3', 'q1', 'b']]) },
  { id: 'ends-ab-4', name: 'Ends in ab (4 states)', graph: machine(['a', 'b'],
    [['s', 's', 'start', 0, 0], ['t', 't', 'state', 0, 200], ['p', 'p', 'state', 240, 100], ['f', 'f', 'accept', 480, 100]],
    [['s', 'p', 'a'], ['s', 't', 'b'], ['t', 'p', 'a'], ['t', 's', 'b'], ['p', 'p', 'a'], ['p', 'f', 'b'], ['f', 'p', 'a'], ['f', 't', 'b']]) },
  { id: 'contains-ab', name: 'Contains ab', graph: machine(['a', 'b'],
    [['q1', 'q₁', 'start', 0, 0], ['q2', 'q₂', 'state', 220, 0], ['q3', 'q₃', 'accept', 440, 0]],
    [['q1', 'q1', 'b'], ['q1', 'q2', 'a'], ['q2', 'q2', 'a'], ['q2', 'q3', 'b'], ['q3', 'q3', 'ab']]) },
  { id: 'even-a', name: 'Even number of a’s', graph: machine(['a', 'b'],
    [['e', 'even', 'start', 0, 0], ['o', 'odd', 'state', 240, 0]],
    [['e', 'e', 'b'], ['e', 'o', 'a'], ['o', 'e', 'a'], ['o', 'o', 'b']]) },
  { id: 'cut-off', name: 'Accept state cut off', graph: machine(['a', 'b'],
    [['q1', 'q₁', 'start', 0, 0], ['q2', 'q₂', 'state', 240, 0], ['q3', 'q₃', 'accept', 120, 200]],
    [['q1', 'q2', 'a'], ['q1', 'q1', 'b'], ['q2', 'q1', 'a'], ['q2', 'q2', 'b'], ['q3', 'q1', 'ab']]) },
]

// Every DFA is also an NFA, so the A_NFA list adds the DFAs after the genuinely nondeterministic machines.
export const NFA_EXAMPLES: MachineExample[] = [
  { id: 'nfa-ends-ab', name: 'Ends in ab (guess the end)', graph: machine(['a', 'b'],
    [['s', 's', 'start', 0, 0], ['p', 'p', 'state', 220, 0], ['f', 'f', 'accept', 440, 0]],
    [['s', 's', 'ab'], ['s', 'p', 'a'], ['p', 'f', 'b']]) },
  { id: 'third-from-end', name: 'Third from the end is a', graph: machine(['a', 'b'],
    [['q1', 'q₁', 'start', 0, 0], ['q2', 'q₂', 'state', 200, 0], ['q3', 'q₃', 'state', 400, 0], ['q4', 'q₄', 'accept', 600, 0]],
    [['q1', 'q1', 'ab'], ['q1', 'q2', 'a'], ['q2', 'q3', 'ab'], ['q3', 'q4', 'ab']]) },
  { id: 'ab-or-aba', name: '(ab ∪ aba)* with ε', graph: machine(['a', 'b'],
    [['s', 's', 'accept', 0, 0], ['p', 'p', 'state', 220, 0], ['q', 'q', 'state', 440, 0], ['r', 'r', 'state', 220, 200]],
    [['s', 'p', 'a'], ['p', 'q', 'b'], ['q', 's', 'ε'], ['q', 'r', 'a'], ['r', 's', 'ε']]) },
]
// ab-or-aba's start is also accepting, which a start state records with `accepting`.
NFA_EXAMPLES[2].graph.states[0] = { ...NFA_EXAMPLES[2].graph.states[0], kind: 'start', accepting: true }

export const REGEX_EXAMPLES = ['(a|b)*ab', '(ab|aba)*', 'a*b*', '(0|1(01*0)*1)*']

export const ACFG_EXAMPLES: GrammarExample[] = [
  { id: 'anbn', name: 'aⁿbⁿ', grammar: 'S → aSb | ε' },
  { id: 'parens', name: 'Balanced parentheses', grammar: 'S → SS | (S) | ε' },
  { id: 'palindromes', name: 'Palindromes', grammar: 'S → aSa | bSb | a | b | ε' },
]

export const ECFG_EXAMPLES: GrammarExample[] = [
  { id: 'nonempty', name: 'Derives something', grammar: 'S → AB | Ca\nA → aA | a\nB → bB\nC → c' },
  { id: 'empty', name: 'Derives nothing', grammar: 'S → aS | bA\nA → aA | Bb\nB → bB' },
  { id: 'anbn', name: 'aⁿbⁿ', grammar: 'S → aSb | ε' },
]
