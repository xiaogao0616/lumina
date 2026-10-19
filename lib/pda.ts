import { isAcceptingState, type AutomatonGraph } from './automaton-graph'

/**
 * Pushdown automata, stored in the same AutomatonGraph shape as DFA/NFA. Each transition's
 * `symbols` holds rules instead of characters, one string per rule in the canonical form
 * `a,X→YZ`: read `a` (or ε), pop `X` (or ε), push `YZ` (or ε). The pushed string's first
 * character ends up on top, so `ε,S→aSb` replaces S with a on top of S on top of b.
 *
 * The stack starts empty (Sipser's convention): a PDA that wants a bottom marker pushes one
 * itself with `ε,ε→$`. A string is accepted when the whole input has been read and some run
 * is in an accepting state, whatever is left on the stack.
 */

export type PdaRule = { input: string; pop: string; push: string }

const EPSILON = 'ε'
const isSymbol = (value: string) => Array.from(value).length === 1 && !!value.trim() && value !== EPSILON

/** Parses the canonical `a,X→YZ` form. Positional, so ',' and '→' can still be stack or input symbols. */
export function parsePdaRule(raw: string): PdaRule | null {
  const chars = Array.from(raw)
  if (chars.length < 5 || chars[1] !== ',' || chars[3] !== '→') return null
  const [input, , pop] = chars
  const push = chars.slice(4).join('')
  if (input !== EPSILON && !isSymbol(input)) return null
  if (pop !== EPSILON && !isSymbol(pop)) return null
  if (push !== EPSILON && !Array.from(push).every(isSymbol)) return null
  return { input: input === EPSILON ? '' : input, pop: pop === EPSILON ? '' : pop, push: push === EPSILON ? '' : push }
}

export function formatPdaRule(rule: PdaRule): string {
  return `${rule.input || EPSILON},${rule.pop || EPSILON}→${rule.push || EPSILON}`
}

/** The roomier `a, X → YZ` form shown on the canvas and in exported SVGs. */
export function displayPdaRule(raw: string): string {
  const rule = parsePdaRule(raw)
  return rule ? `${rule.input || EPSILON}, ${rule.pop || EPSILON} → ${rule.push || EPSILON}` : raw
}

export function pdaEdgeCaption(rules: string[]): string {
  return rules.length ? rules.map(displayPdaRule).join('\n') : '∅'
}

/**
 * Builds a canonical rule from the three fields of the rule form. Blank fields and a typed ε both
 * mean "nothing". Returns an error message instead when a field can't be used.
 */
export function buildPdaRule(input: string, pop: string, push: string): { ok: true; rule: string } | { ok: false; message: string } {
  const clean = (value: string) => {
    const trimmed = value.replace(/\s+/g, '').normalize('NFC')
    return trimmed === EPSILON ? '' : trimmed
  }
  const read = clean(input), popped = clean(pop), pushed = clean(push)
  if (Array.from(read).length > 1) return { ok: false, message: 'Read takes one character, or leave it blank for ε.' }
  if (Array.from(popped).length > 1) return { ok: false, message: 'Pop takes one stack symbol, or leave it blank for ε.' }
  if (Array.from(pushed).includes(EPSILON)) return { ok: false, message: 'Push cannot mix ε with other symbols. Leave it blank to push nothing.' }
  return { ok: true, rule: formatPdaRule({ input: read, pop: popped, push: pushed }) }
}

export type PdaStep = { edgeId: string | null; stateId: string; stack: string; consumed: number; rule: string | null }
export type PdaRun = {
  status: 'accepted' | 'rejected' | 'error'
  message: string
  /** The accepting run, or for a rejection the run that read the most input before getting stuck. */
  steps: PdaStep[]
  /** The search hit a limit, so a rejection means "none found", not "none exists". */
  truncated: boolean
}

type PdaState = { id: string; label: string; start: boolean; accepting: boolean }
type PdaTransition = { id: string; source: string; target: string; symbols: string[] }
type Move = { edgeId: string; target: string; rule: PdaRule; raw: string }

const topOf = (stack: string) => stack ? String.fromCodePoint(stack.codePointAt(0)!) : ''

function prepare(states: PdaState[], transitions: PdaTransition[]): { error: string } | { start: PdaState; outgoing: Map<string, Move[]> } {
  const starts = states.filter(state => state.start)
  if (starts.length !== 1) return { error: starts.length === 0 ? 'Add one start state before running a test.' : 'Keep exactly one start state before running a test.' }
  const ids = new Set(states.map(state => state.id))
  const outgoing = new Map<string, Move[]>()
  for (const transition of transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) return { error: 'A transition refers to a missing state.' }
    for (const raw of transition.symbols) {
      const rule = parsePdaRule(raw)
      if (!rule) return { error: `"${raw}" is not a valid PDA rule.` }
      const list = outgoing.get(transition.source) ?? []
      list.push({ edgeId: transition.id, target: transition.target, rule, raw })
      outgoing.set(transition.source, list)
    }
  }
  return { start: starts[0], outgoing }
}

/** Applies a move to a stack, or returns null when its pop doesn't match the top. */
function applyMove(stack: string, rule: PdaRule): string | null {
  if (rule.pop && topOf(stack) !== rule.pop) return null
  return rule.push + (rule.pop ? stack.slice(rule.pop.length) : stack)
}

/**
 * Breadth-first search over configurations (state, characters read, stack). ε-moves can push
 * forever, so the stack depth and the number of configurations are both capped; hitting either
 * cap is reported rather than silently treated as a rejection.
 */
export function runPda(states: PdaState[], transitions: PdaTransition[], input: string,
  limits: { maxConfigs?: number; maxStack?: number } = {}): PdaRun {
  const prepared = prepare(states, transitions)
  if ('error' in prepared) return { status: 'error', message: prepared.error, steps: [], truncated: false }
  const chars = Array.from(input)
  const maxConfigs = limits.maxConfigs ?? 20000
  const maxStack = limits.maxStack ?? 64 + 4 * chars.length
  const accepting = new Map(states.map(state => [state.id, state.accepting]))
  const labels = new Map(states.map(state => [state.id, state.label]))

  type Node = { step: PdaStep; parent: Node | null }
  const root: Node = { step: { edgeId: null, stateId: prepared.start.id, stack: '', consumed: 0, rule: null }, parent: null }
  const seen = new Set<string>([`${root.step.stateId}|0|`])
  const queue: Node[] = [root]
  let furthest = root
  let truncated = false
  const pathOf = (node: Node) => {
    const steps: PdaStep[] = []
    for (let current: Node | null = node; current; current = current.parent) steps.unshift(current.step)
    return steps
  }

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]
    const { stateId, stack, consumed } = node.step
    if (consumed === chars.length && accepting.get(stateId)) {
      const steps = pathOf(node)
      return { status: 'accepted', truncated: false, steps, message: `${consumed === 0 ? 'The empty string' : `All ${consumed} characters`} reach accepting state ${labels.get(stateId)} in ${steps.length - 1} move${steps.length === 2 ? '' : 's'}, with ${stack ? `stack ${stack}` : 'an empty stack'}.` }
    }
    if (consumed > furthest.step.consumed || (consumed === furthest.step.consumed && node.step.stack.length >= furthest.step.stack.length)) furthest = node
    for (const move of prepared.outgoing.get(stateId) ?? []) {
      if (move.rule.input && move.rule.input !== chars[consumed]) continue
      const nextStack = applyMove(stack, move.rule)
      if (nextStack === null) continue
      if (Array.from(nextStack).length > maxStack) { truncated = true; continue }
      const nextConsumed = consumed + (move.rule.input ? 1 : 0)
      const key = `${move.target}|${nextConsumed}|${nextStack}`
      if (seen.has(key)) continue
      if (seen.size >= maxConfigs) { truncated = true; continue }
      seen.add(key)
      queue.push({ step: { edgeId: move.edgeId, stateId: move.target, stack: nextStack, consumed: nextConsumed, rule: move.raw }, parent: node })
    }
  }

  const steps = pathOf(furthest)
  const read = furthest.step.consumed
  const message = truncated
    ? `No accepting run found before the search limit (${maxConfigs} configurations, stack depth ${maxStack}). ε-moves that keep pushing can make the search endless.`
    : read < chars.length
      ? `No run can read character ${read + 1} (${JSON.stringify(chars[read])}).`
      : 'The entire input was read, but no run ends in an accepting state.'
  return { status: 'rejected', message, steps, truncated }
}

/**
 * Distinct accepted strings, shortest first. Works length by length: within one length it follows
 * ε-moves, then reads one more character into the next length. Configurations are told apart by
 * the word read so far too, so every accepted word within the limits is found; the per-length cap
 * only matters for machines whose number of live configurations explodes.
 */
export function findPdaAcceptedStrings(graph: AutomatonGraph, count: number, maxLength = 12): string[] {
  const states = graph.states.map(state => ({ id: state.id, label: state.label, start: state.kind === 'start', accepting: isAcceptingState(state) }))
  const prepared = prepare(states, graph.transitions)
  if ('error' in prepared) return []
  const accepting = new Map(states.map(state => [state.id, state.accepting]))
  const maxStack = 24 + 2 * maxLength
  const maxPerLayer = 20000
  const results: string[] = []
  const found = new Set<string>()
  type Config = { stateId: string; stack: string; word: string }
  const keyOf = (config: Config) => `${config.stateId}|${config.stack}|${config.word}`
  let layer: Config[] = [{ stateId: prepared.start.id, stack: '', word: '' }]
  for (let length = 0; length <= maxLength && layer.length && results.length < count; length++) {
    // ε-closure within this length.
    const seen = new Set(layer.map(keyOf))
    for (let head = 0; head < layer.length && layer.length < maxPerLayer; head++) {
      const config = layer[head]
      for (const move of prepared.outgoing.get(config.stateId) ?? []) {
        if (move.rule.input) continue
        const stack = applyMove(config.stack, move.rule)
        if (stack === null || Array.from(stack).length > maxStack) continue
        const next = { stateId: move.target, stack, word: config.word }
        if (seen.has(keyOf(next))) continue
        seen.add(keyOf(next))
        layer.push(next)
      }
    }
    // Shortlex within a length, matching the DFA and CFG lists.
    const accepted = [...new Set(layer.filter(config => accepting.get(config.stateId)).map(config => config.word))].sort()
    for (const word of accepted) {
      if (results.length >= count) break
      if (!found.has(word)) { found.add(word); results.push(word) }
    }
    const next: Config[] = []
    const nextSeen = new Set<string>()
    for (const config of layer) {
      for (const move of prepared.outgoing.get(config.stateId) ?? []) {
        if (!move.rule.input) continue
        const stack = applyMove(config.stack, move.rule)
        if (stack === null || Array.from(stack).length > maxStack) continue
        const candidate = { stateId: move.target, stack, word: config.word + move.rule.input }
        if (nextSeen.has(keyOf(candidate)) || next.length >= maxPerLayer) continue
        nextSeen.add(keyOf(candidate))
        next.push(candidate)
      }
    }
    layer = next
  }
  return results
}

export type PdaBranching = { sourceLabel: string; first: string; second: string }

/**
 * Pairs of rules leaving the same state that could both apply to one configuration, which is what
 * makes a PDA nondeterministic: their reads overlap (equal, or one is ε) and so do their pops.
 */
export function pdaBranching(graph: AutomatonGraph): PdaBranching[] {
  const overlaps = (a: string, b: string) => !a || !b || a === b
  const branching: PdaBranching[] = []
  for (const state of graph.states) {
    const rules = graph.transitions.filter(transition => transition.source === state.id)
      .flatMap(transition => transition.symbols.map(raw => ({ raw, target: transition.target, rule: parsePdaRule(raw) })))
      .filter((item): item is { raw: string; target: string; rule: PdaRule } => !!item.rule)
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i], b = rules[j]
        if (overlaps(a.rule.input, b.rule.input) && overlaps(a.rule.pop, b.rule.pop)) {
          branching.push({ sourceLabel: state.label, first: displayPdaRule(a.raw), second: displayPdaRule(b.raw) })
        }
      }
    }
  }
  return branching
}

export function countPdaRules(graph: AutomatonGraph): number {
  return graph.transitions.reduce((total, transition) => total + transition.symbols.length, 0)
}

/** Input characters the rules actually read, in alphabet order. */
export function pdaInputsInUse(graph: AutomatonGraph): string[] {
  const used = new Set(graph.transitions.flatMap(transition => transition.symbols.map(raw => parsePdaRule(raw)?.input ?? '')))
  return graph.symbols.filter(symbol => used.has(symbol))
}
