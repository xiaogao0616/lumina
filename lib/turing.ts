import { SOURCE_COLORS, isAcceptingState, type AutomatonGraph, type AutomatonState } from './automaton-graph'

/**
 * Single-tape deterministic Turing machines (Sipser, chapter 3), stored in the same AutomatonGraph
 * shape as the other modes. Each transition's `symbols` holds rules in the canonical form `a→b,R`:
 * read `a`, write `b`, move the head L or R. `⊔` is the blank.
 *
 * The tape is infinite to the right only. The input starts at the left end with the head on its
 * first cell, and a move left from the first cell leaves the head where it is. Entering an
 * accepting state halts and accepts. A (state, symbol) pair with no rule halts and rejects, as if
 * the arrow went to q_reject, so a reject state never has to be drawn.
 */

export const BLANK = '⊔'
export type TmMove = 'L' | 'R'
export type TmRule = { read: string; write: string; move: TmMove }

const isTapeSymbol = (value: string) => Array.from(value).length === 1 && !!value.trim() && value !== 'ε'

/** Parses the canonical `a→b,R` form. Positional, so ',' and '→' can still be tape symbols. */
export function parseTmRule(raw: string): TmRule | null {
  const chars = Array.from(raw)
  if (chars.length !== 5 || chars[1] !== '→' || chars[3] !== ',') return null
  const [read, , write, , move] = chars
  if (!isTapeSymbol(read) || !isTapeSymbol(write) || (move !== 'L' && move !== 'R')) return null
  return { read, write, move }
}

export function formatTmRule(rule: TmRule): string {
  return `${rule.read}→${rule.write},${rule.move}`
}

/** Always the full `a → b, R`, as the course writes it, even when the symbol is written back unchanged (`a → a, R`). */
export function displayTmRule(raw: string): string {
  const rule = parseTmRule(raw)
  if (!rule) return raw
  return `${rule.read} → ${rule.write}, ${rule.move}`
}

export function tmEdgeCaption(rules: string[]): string {
  return rules.length ? rules.map(displayTmRule).join('\n') : '∅'
}

/** `_`, a blank field, `⊔`, `B` written as "blank" all mean the blank symbol where one is expected. */
export function normalizeTapeSymbol(value: string): string {
  const trimmed = value.replace(/\s+/g, '').normalize('NFC')
  return trimmed === '_' || trimmed === '⊔' || /^(blank|␣|□)$/i.test(trimmed) ? BLANK : trimmed
}

/**
 * Builds a canonical rule from the read / write / move fields. Read and write take one tape symbol
 * (`_` for the blank); a blank write keeps the symbol that was read. Move is L or R.
 */
export function buildTmRule(read: string, write: string, move: string): { ok: true; rule: string } | { ok: false; message: string } {
  const readSymbol = read.trim() ? normalizeTapeSymbol(read) : ''
  if (!readSymbol) return { ok: false, message: 'Read takes one tape symbol. Type _ for the blank ⊔.' }
  if (Array.from(readSymbol).length !== 1 || readSymbol === 'ε') return { ok: false, message: 'Read takes exactly one tape symbol. Type _ for the blank ⊔.' }
  const writeSymbol = write.trim() ? normalizeTapeSymbol(write) : readSymbol
  if (Array.from(writeSymbol).length !== 1 || writeSymbol === 'ε') return { ok: false, message: 'Write takes one tape symbol, or leave it blank to keep the one read.' }
  const direction = move.trim().toUpperCase()
  if (direction !== 'L' && direction !== 'R') return { ok: false, message: 'Move is L or R.' }
  return { ok: true, rule: formatTmRule({ read: readSymbol, write: writeSymbol, move: direction }) }
}

export type TmStep = { edgeId: string | null; stateId: string; tape: string; head: number; rule: string | null }
export type TmStatus = 'accepted' | 'rejected' | 'loops' | 'undecided' | 'error'
export type TmRun = {
  status: TmStatus
  message: string
  /** Every configuration from the start, up to the recording limit. */
  steps: TmStep[]
  /** How many moves the machine made, which can be more than `steps` records. */
  moves: number
  /** The tape when the run stopped, trailing blanks trimmed. */
  tape: string
}

type TmState = { id: string; label: string; start: boolean; accepting: boolean }
type TmTransition = { id: string; source: string; target: string; symbols: string[] }
type Move = { edgeId: string; target: string; rule: TmRule; raw: string }

export type TmConflict = { sourceLabel: string; read: string; first: string; second: string }

/** Pairs of rules leaving one state that read the same symbol: a TM here must be deterministic. */
export function tmConflicts(graph: AutomatonGraph): TmConflict[] {
  const conflicts: TmConflict[] = []
  for (const state of graph.states) {
    const seen = new Map<string, string>()
    for (const transition of graph.transitions.filter(item => item.source === state.id)) {
      for (const raw of transition.symbols) {
        const rule = parseTmRule(raw)
        if (!rule) continue
        const earlier = seen.get(rule.read)
        if (earlier) conflicts.push({ sourceLabel: state.label, read: rule.read, first: displayTmRule(earlier), second: displayTmRule(raw) })
        else seen.set(rule.read, raw)
      }
    }
  }
  return conflicts
}

function prepare(states: TmState[], transitions: TmTransition[]): { error: string } | { start: TmState; delta: Map<string, Map<string, Move>> } {
  const starts = states.filter(state => state.start)
  if (starts.length !== 1) return { error: starts.length === 0 ? 'Add one start state before running a test.' : 'Keep exactly one start state before running a test.' }
  const ids = new Set(states.map(state => state.id))
  const labels = new Map(states.map(state => [state.id, state.label]))
  const delta = new Map<string, Map<string, Move>>()
  for (const transition of transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) return { error: 'A transition refers to a missing state.' }
    for (const raw of transition.symbols) {
      const rule = parseTmRule(raw)
      if (!rule) return { error: `"${raw}" is not a valid Turing machine rule.` }
      const table = delta.get(transition.source) ?? new Map<string, Move>()
      if (table.has(rule.read)) return { error: `State ${labels.get(transition.source)} has two rules that read ${rule.read}. A Turing machine here is deterministic, so keep one.` }
      table.set(rule.read, { edgeId: transition.id, target: transition.target, rule, raw })
      delta.set(transition.source, table)
    }
  }
  return { start: starts[0], delta }
}

const trimBlanks = (tape: string[]) => {
  let end = tape.length
  while (end > 0 && tape[end - 1] === BLANK) end--
  return tape.slice(0, end).join('')
}

/**
 * Runs the machine on `input`. It stops when it accepts or rejects, when a configuration repeats
 * (then it provably loops forever), or after `maxSteps` moves with no verdict, since no program can
 * always tell a machine that will halt from one that never does.
 */
export function runTm(states: TmState[], transitions: TmTransition[], input: string,
  limits: { maxSteps?: number; recordSteps?: number } = {}): TmRun {
  const prepared = prepare(states, transitions)
  const chars = Array.from(input)
  if ('error' in prepared) return { status: 'error', message: prepared.error, steps: [], moves: 0, tape: input }
  if (chars.includes(BLANK)) return { status: 'error', message: 'The input cannot contain the blank ⊔.', steps: [], moves: 0, tape: input }
  const maxSteps = limits.maxSteps ?? 20000
  const recordSteps = limits.recordSteps ?? 2000
  const accepting = new Map(states.map(state => [state.id, state.accepting]))
  const labels = new Map(states.map(state => [state.id, state.label]))

  const tape = chars.length ? [...chars] : [BLANK]
  let head = 0
  let stateId = prepared.start.id
  const steps: TmStep[] = [{ edgeId: null, stateId, tape: trimBlanks(tape), head, rule: null }]
  const seen = new Set<string>()
  const result = (status: TmStatus, message: string, moves: number): TmRun => ({ status, message, steps, moves, tape: trimBlanks(tape) })
  const plural = (count: number) => `${count} move${count === 1 ? '' : 's'}`

  for (let moves = 0; ; moves++) {
    if (accepting.get(stateId)) return result('accepted', `Halted in accepting state ${labels.get(stateId)} after ${plural(moves)}.`, moves)
    const symbol = tape[head] ?? BLANK
    const move = prepared.delta.get(stateId)?.get(symbol)
    if (!move) return result('rejected', `Halted after ${plural(moves)}: ${labels.get(stateId)} has no rule for ${symbol}, so the machine rejects.`, moves)
    if (moves >= maxSteps) return result('undecided', `No verdict after ${maxSteps.toLocaleString('en-US')} moves. The machine may run forever, or just need longer.`, moves)
    const key = `${stateId}|${head}|${trimBlanks(tape)}`
    if (seen.has(key)) return result('loops', `Loops forever: after ${plural(moves)} the machine is back in a configuration it was already in, so it never halts.`, moves)
    seen.add(key)
    tape[head] = move.rule.write
    head = move.rule.move === 'R' ? head + 1 : Math.max(0, head - 1)
    if (head >= tape.length) tape.push(BLANK)
    stateId = move.target
    if (steps.length < recordSteps) steps.push({ edgeId: move.edgeId, stateId, tape: trimBlanks(tape), head, rule: move.raw })
  }
}

const graphStates = (graph: AutomatonGraph): TmState[] =>
  graph.states.map(state => ({ id: state.id, label: state.label, start: state.kind === 'start', accepting: isAcceptingState(state) }))

export function runTmGraph(graph: AutomatonGraph, input: string, limits?: { maxSteps?: number; recordSteps?: number }): TmRun {
  return runTm(graphStates(graph), graph.transitions, input, limits)
}

/**
 * Accepted strings over the input alphabet, shortest first, found by running the machine on every
 * string in shortlex order. Each run gets `maxSteps` moves, and the whole search stops after
 * `budget` moves in total, so a machine that loops on many inputs still answers quickly.
 */
export function findTmAcceptedStrings(graph: AutomatonGraph, count: number, maxLength = 10, maxSteps = 2000, budget = 400_000): string[] {
  const states = graphStates(graph)
  if ('error' in prepare(states, graph.transitions)) return []
  const alphabet = graph.symbols
  const results: string[] = []
  let spent = 0
  let layer = ['']
  for (let length = 0; length <= maxLength && results.length < count && spent < budget; length++) {
    for (const word of layer) {
      const run = runTm(states, graph.transitions, word, { maxSteps, recordSteps: 1 })
      spent += run.moves + 1
      if (run.status === 'accepted') results.push(word)
      if (results.length >= count || spent >= budget) break
    }
    if (!alphabet.length) break
    layer = layer.flatMap(word => alphabet.map(symbol => word + symbol))
  }
  return results
}

export function countTmRules(graph: AutomatonGraph): number {
  return graph.transitions.reduce((total, transition) => total + transition.symbols.length, 0)
}

/** Tape symbols in use: the input alphabet first, then anything the rules read or write, blank last. */
export function tapeAlphabet(graph: AutomatonGraph): string[] {
  const symbols = new Set(graph.symbols)
  for (const transition of graph.transitions) for (const raw of transition.symbols) {
    const rule = parseTmRule(raw)
    if (rule) { symbols.add(rule.read); symbols.add(rule.write) }
  }
  symbols.delete(BLANK)
  return [...symbols, BLANK]
}

// --- Example machines, mostly from Sipser chapter 3. ---

type Spec = { name: string; hint: string; symbols: string[]; states: [label: string, kind: AutomatonState['kind'], x: number, y: number][]; edges: [from: number, to: number, ...rules: string[]][] }

function build(spec: Spec): AutomatonGraph {
  const states = spec.states.map(([label, kind, x, y], index) => ({ id: `q${index}`, label, kind, position: { x, y }, color: SOURCE_COLORS[index % SOURCE_COLORS.length] }))
  const transitions = spec.edges.map(([from, to, ...rules], index) => ({ id: `e${index}`, source: `q${from}`, target: `q${to}`, symbols: rules }))
  return { states, transitions, symbols: spec.symbols }
}

const specs: Spec[] = [
  {
    name: 'w#w', hint: 'Sipser’s M₁: cross off matching symbols on each side of #',
    symbols: ['0', '1', '#'],
    states: [['q₁', 'start', 0, 210], ['q₂', 'state', 240, 0], ['q₃', 'state', 240, 420], ['q₄', 'state', 480, 0], ['q₅', 'state', 480, 420],
      ['q₆', 'state', 720, 210], ['q₇', 'state', 360, 210], ['q₈', 'state', 0, 420], ['accept', 'accept', -240, 420]],
    edges: [
      [0, 1, '0→x,R'], [0, 2, '1→x,R'], [0, 7, '#→#,R'],
      [1, 1, '0→0,R', '1→1,R'], [1, 3, '#→#,R'],
      [2, 2, '0→0,R', '1→1,R'], [2, 4, '#→#,R'],
      [3, 3, 'x→x,R'], [3, 5, '0→x,L'],
      [4, 4, 'x→x,R'], [4, 5, '1→x,L'],
      [5, 5, '0→0,L', '1→1,L', 'x→x,L'], [5, 6, '#→#,L'],
      [6, 6, '0→0,L', '1→1,L'], [6, 0, 'x→x,R'],
      [7, 7, 'x→x,R'], [7, 8, '⊔→⊔,R'],
    ],
  },
  {
    name: '0^(2ⁿ)', hint: 'Sipser’s M₂: halve the 0s on every sweep',
    symbols: ['0'],
    states: [['q₁', 'start', 0, 0], ['q₂', 'state', 240, 0], ['q₃', 'state', 480, 0], ['q₄', 'state', 720, 0], ['q₅', 'state', 480, 200], ['accept', 'accept', 240, 200]],
    edges: [
      [0, 1, '0→⊔,R'],
      [1, 1, 'x→x,R'], [1, 2, '0→x,R'], [1, 5, '⊔→⊔,R'],
      [2, 2, 'x→x,R'], [2, 3, '0→0,R'], [2, 4, '⊔→⊔,L'],
      [3, 3, 'x→x,R'], [3, 2, '0→x,R'],
      [4, 4, '0→0,L', 'x→x,L'], [4, 1, '⊔→⊔,R'],
    ],
  },
  {
    name: 'aⁿbⁿcⁿ', hint: 'Not context-free: mark one a, one b and one c per pass',
    symbols: ['a', 'b', 'c'],
    states: [['q₀', 'start', 0, 0], ['q₁', 'state', 250, 0], ['q₂', 'state', 500, 0], ['q₃', 'state', 250, 220], ['q₄', 'state', 0, 220], ['accept', 'accept', 250, 400]],
    edges: [
      [0, 1, 'a→x,R'], [0, 4, 'y→y,R'], [0, 5, '⊔→⊔,R'],
      [1, 1, 'a→a,R', 'y→y,R'], [1, 2, 'b→y,R'],
      [2, 2, 'b→b,R', 'z→z,R'], [2, 3, 'c→z,L'],
      [3, 3, 'a→a,L', 'b→b,L', 'y→y,L', 'z→z,L'], [3, 0, 'x→x,R'],
      [4, 4, 'y→y,R', 'z→z,R'], [4, 5, '⊔→⊔,R'],
    ],
  },
  {
    name: 'Unary addition', hint: 'Turns 11+111 into 11111 on the tape',
    symbols: ['1', '+'],
    states: [['q₀', 'start', 0, 0], ['q₁', 'state', 240, 0], ['q₂', 'state', 480, 0], ['accept', 'accept', 720, 0]],
    edges: [
      [0, 0, '1→1,R'], [0, 1, '+→1,R'],
      [1, 1, '1→1,R'], [1, 2, '⊔→⊔,L'],
      [2, 3, '1→⊔,L'],
    ],
  },
]

export const tmExamples: { name: string; hint: string; graph: AutomatonGraph }[] = specs.map(spec => ({ name: spec.name, hint: spec.hint, graph: build(spec) }))
