import { countEpsilonEdges, symbolConflicts } from './automata-dfa'
import { SOURCE_COLORS, isAcceptingState, type AutomatonGraph, type AutomatonState, type AutomatonTransition } from './automaton-graph'
import { formatProduction, isNonterminal, testMembership, type Grammar, type Production } from './cfg'
import { formatGrammar, toChomskyNormalForm } from './cfg-transform'
import { layoutPoint, nfaToDfa } from './nfa-to-dfa'
import { regexToNfa } from './regex-to-nfa'

/**
 * The decidable languages of Sipser chapter 4, each decided the way the book's proof does it, with
 * a trace of every stage so the page can replay the algorithm. Each decider is a total function:
 * it always returns accept or reject, which is exactly what makes these languages decidable.
 */

export type Failure = { ok: false; message: string }

// ---------- A_DFA (Theorem 4.1) ----------

/** One configuration of the simulation: the state after reading `consumed` characters. */
export type DfaStep = { stateId: string; consumed: number }
export type ADfaResult = {
  ok: true
  accepted: boolean
  steps: DfaStep[]
  /** Set when the run stops early on a missing arrow, i.e. the implicit dead state. */
  stuck: boolean
  message: string
}

const startOf = (graph: AutomatonGraph) => graph.states.filter(state => state.kind === 'start')
const labelOf = (graph: AutomatonGraph, id: string) => graph.states.find(state => state.id === id)?.label ?? id

/** Sipser's DFAs are complete; here a missing arrow is allowed and means "go to a dead state", as in the DFA lab. */
export function dfaProblem(graph: AutomatonGraph): string | null {
  const starts = startOf(graph)
  if (starts.length !== 1) return starts.length ? 'The machine has more than one start state.' : 'The machine has no start state.'
  if (countEpsilonEdges(graph)) return 'This machine has ε-moves, so it is an NFA, not a DFA. Use A_NFA for it.'
  const conflict = symbolConflicts(graph)[0]
  if (conflict) return `State ${conflict.sourceLabel} has two arrows for ${conflict.symbol}, so it is an NFA, not a DFA. Use A_NFA for it.`
  return null
}

export function decideADfa(graph: AutomatonGraph, input: string): ADfaResult | Failure {
  const problem = dfaProblem(graph)
  if (problem) return { ok: false, message: problem }
  const chars = Array.from(input)
  const outside = chars.find(char => !graph.symbols.includes(char))
  if (outside !== undefined) return { ok: false, message: `${JSON.stringify(outside)} is not in the machine’s alphabet {${graph.symbols.join(', ')}}, so ⟨B, w⟩ is not a valid input.` }
  let current = startOf(graph)[0].id
  const steps: DfaStep[] = [{ stateId: current, consumed: 0 }]
  for (let index = 0; index < chars.length; index++) {
    const edge = graph.transitions.find(transition => transition.source === current && transition.symbols.includes(chars[index]))
    if (!edge) {
      return { ok: true, accepted: false, steps, stuck: true,
        message: `${labelOf(graph, current)} has no arrow for ${chars[index]}, so B falls into a dead state and can never accept. Reject.` }
    }
    current = edge.target
    steps.push({ stateId: current, consumed: index + 1 })
  }
  const final = graph.states.find(state => state.id === current)!
  const accepted = isAcceptingState(final)
  return { ok: true, accepted, steps, stuck: false,
    message: `After all ${chars.length} character${chars.length === 1 ? '' : 's'}, B is in ${final.label}, ${accepted ? 'an accepting state. Accept.' : 'which is not accepting. Reject.'}` }
}

// ---------- A_NFA (Theorem 4.2) and A_REX (Theorem 4.3) ----------

export type ANfaResult = { ok: true; dfa: AutomatonGraph; run: ADfaResult }

/** Converts with the subset construction, then hands the DFA to the A_DFA decider. */
export function decideANfa(graph: AutomatonGraph, input: string): ANfaResult | Failure {
  const converted = nfaToDfa(graph)
  if (!converted.ok) return converted
  const run = decideADfa(converted.graph, input)
  if (!run.ok) return run
  return { ok: true, dfa: converted.graph, run }
}

export type ARexResult = { ok: true; nfa: AutomatonGraph; dfa: AutomatonGraph; run: ADfaResult }

/** Regex → NFA (Thompson), NFA → DFA, then A_DFA. Characters outside the expression's alphabet just reject. */
export function decideARex(pattern: string, input: string): ARexResult | Failure {
  if (!pattern.trim()) return { ok: false, message: 'Write a regular expression first.' }
  const nfa = regexToNfa(pattern)
  if (!nfa.ok) return nfa
  const alphabet = [...nfa.graph.symbols, ...Array.from(input).filter(char => !nfa.graph.symbols.includes(char))]
  const converted = nfaToDfa({ ...nfa.graph, symbols: [...new Set(alphabet)] })
  if (!converted.ok) return converted
  const run = decideADfa(converted.graph, input)
  if (!run.ok) return run
  return { ok: true, nfa: nfa.graph, dfa: converted.graph, run }
}

// ---------- E_DFA (Theorem 4.4) ----------

export type MarkingRound = { marked: string[]; via: { from: string; to: string; symbol: string }[] }
export type EDfaResult = {
  ok: true
  /** True when L(A) = ∅, which is when the decider accepts. */
  empty: boolean
  /** rounds[0] marks the start state; each later round marks the states reached from already marked ones. */
  rounds: MarkingRound[]
  reachableAccepting: string[]
  /** A shortest string A accepts, when there is one. */
  witness: string | null
}

export function decideEDfa(graph: AutomatonGraph): EDfaResult | Failure {
  const problem = dfaProblem(graph)
  if (problem) return { ok: false, message: problem }
  const start = startOf(graph)[0].id
  const marked = new Set([start])
  const word = new Map([[start, '']])
  const rounds: MarkingRound[] = [{ marked: [start], via: [] }]
  for (;;) {
    const round: MarkingRound = { marked: [], via: [] }
    for (const transition of graph.transitions) {
      if (!marked.has(transition.source) || marked.has(transition.target) || round.marked.includes(transition.target)) continue
      round.marked.push(transition.target)
      round.via.push({ from: transition.source, to: transition.target, symbol: transition.symbols[0] })
      word.set(transition.target, word.get(transition.source)! + transition.symbols[0])
    }
    if (!round.marked.length) break
    round.marked.forEach(id => marked.add(id))
    rounds.push(round)
  }
  const reachableAccepting = graph.states.filter(state => isAcceptingState(state) && marked.has(state.id)).map(state => state.id)
  const witness = reachableAccepting.length ? reachableAccepting.map(id => word.get(id)!).sort((a, b) => a.length - b.length)[0] : null
  return { ok: true, empty: reachableAccepting.length === 0, rounds, reachableAccepting, witness }
}

// ---------- EQ_DFA (Theorem 4.5) ----------

export type EqDfaResult = {
  ok: true
  equivalent: boolean
  /** C, the symmetric difference of the two machines: it accepts exactly where they disagree. */
  product: AutomatonGraph
  emptiness: EDfaResult
  /** A shortest string on which the machines disagree, and which one accepts it. */
  witness: { input: string; acceptedBy: 'A' | 'B' } | null
}

const DEAD = '∅'

/**
 * Builds C = (A ∩ ¬B) ∪ (¬A ∩ B) with the product construction, over the union of both alphabets,
 * then runs the E_DFA decider on it. C's states are named (p, q) after the pair they track, and only
 * the pairs reachable from the start are built.
 */
export function decideEqDfa(first: AutomatonGraph, second: AutomatonGraph): EqDfaResult | Failure {
  for (const [name, graph] of [['A', first], ['B', second]] as const) {
    const problem = dfaProblem(graph)
    if (problem) return { ok: false, message: `${name}: ${problem}` }
  }
  const symbols = [...first.symbols, ...second.symbols.filter(symbol => !first.symbols.includes(symbol))]
  const step = (graph: AutomatonGraph, state: string, symbol: string) =>
    state === DEAD ? DEAD : graph.transitions.find(transition => transition.source === state && transition.symbols.includes(symbol))?.target ?? DEAD
  const accepts = (graph: AutomatonGraph, state: string) => state !== DEAD && isAcceptingState(graph.states.find(item => item.id === state)!)
  const name = (graph: AutomatonGraph, state: string) => state === DEAD ? DEAD : labelOf(graph, state)
  const key = (p: string, q: string) => `${p}\u0000${q}`

  const start: [string, string] = [startOf(first)[0].id, startOf(second)[0].id]
  const pairs = new Map([[key(...start), start]])
  const layer = new Map([[key(...start), 0]])
  const order = [key(...start)]
  const transitions: AutomatonTransition[] = []
  for (let head = 0; head < order.length; head++) {
    const [p, q] = pairs.get(order[head])!
    const byTarget = new Map<string, string[]>()
    for (const symbol of symbols) {
      const next: [string, string] = [step(first, p, symbol), step(second, q, symbol)]
      const nextKey = key(...next)
      if (!pairs.has(nextKey)) { pairs.set(nextKey, next); layer.set(nextKey, layer.get(order[head])! + 1); order.push(nextKey) }
      byTarget.set(nextKey, [...(byTarget.get(nextKey) ?? []), symbol])
    }
    for (const [target, edgeSymbols] of byTarget) transitions.push({ id: `c${head}-${order.indexOf(target)}`, source: `c${head}`, target: `c${order.indexOf(target)}`, symbols: edgeSymbols })
  }
  const perLayer = new Map<number, string[]>()
  for (const item of order) perLayer.set(layer.get(item)!, [...(perLayer.get(layer.get(item)!) ?? []), item])
  const states: AutomatonState[] = order.map((item, index) => {
    const [p, q] = pairs.get(item)!
    const disagree = accepts(first, p) !== accepts(second, q)
    const bucket = perLayer.get(layer.get(item)!)!
    return {
      id: `c${index}`, label: `${name(first, p)},${name(second, q)}`,
      kind: index === 0 ? 'start' : disagree ? 'accept' : 'state', accepting: index === 0 && disagree ? true : undefined,
      position: layoutPoint(layer.get(item)!, bucket.indexOf(item), bucket.length), color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    }
  })
  const product: AutomatonGraph = { states, transitions, symbols }
  const emptiness = decideEDfa(product)
  if (!emptiness.ok) return emptiness
  let witness: EqDfaResult['witness'] = null
  if (emptiness.witness !== null) {
    const firstAccepts = decideADfa(first.symbols.length === symbols.length ? first : { ...first, symbols }, emptiness.witness)
    witness = { input: emptiness.witness, acceptedBy: firstAccepts.ok && firstAccepts.accepted ? 'A' : 'B' }
  }
  return { ok: true, equivalent: emptiness.empty, product, emptiness, witness }
}

// ---------- A_CFG (Theorem 4.7) ----------

export type ACfgResult = {
  ok: true
  accepted: boolean
  cnf: Grammar
  cnfText: string
  /** 2n − 1 for a string of length n ≥ 1, and 1 for the empty string. */
  bound: number
  /** The derivation in the CNF grammar, sentential form by sentential form, when there is one. */
  derivation: string[]
  message: string
}

/**
 * Sipser's decider: put G in Chomsky normal form, where every derivation of a length-n string has
 * exactly 2n − 1 steps, so only finitely many derivations need checking. The search itself is done
 * with a chart parser instead of listing them all, which gives the same answer much faster.
 */
export function decideACfg(grammar: Grammar, input: string): ACfgResult | Failure {
  const chars = Array.from(input)
  const outside = chars.find(char => !grammar.terminals.includes(char))
  const cnf = toChomskyNormalForm(grammar)
  if (!cnf.ok) return cnf
  const n = chars.length
  const bound = n === 0 ? 1 : 2 * n - 1
  const base = { ok: true as const, cnf: cnf.grammar, cnfText: cnf.text, bound }
  if (outside !== undefined) {
    return { ...base, accepted: false, derivation: [], message: `${JSON.stringify(outside)} is not a terminal of G, so no derivation can produce w. Reject.` }
  }
  if (n === 0) {
    const accepted = cnf.grammar.productions.some(production => production.head === cnf.grammar.start && production.body.length === 0)
    return { ...base, accepted, derivation: accepted ? [cnf.grammar.start, 'ε'] : [],
      message: accepted ? `The CNF grammar has the rule ${cnf.grammar.start} → ε, a one-step derivation of ε. Accept.` : `The CNF grammar has no rule ${cnf.grammar.start} → ε, and that is the only way to derive ε in CNF. Reject.` }
  }
  const membership = testMembership(cnf.grammar, input)
  if (membership.status === 'accepted') {
    return { ...base, accepted: true, derivation: membership.derivation,
      message: `One of the derivations with ${bound} steps produces w. Accept.` }
  }
  return { ...base, accepted: false, derivation: [], message: `None of the derivations with ${bound} steps produces w. Reject.` }
}

// ---------- E_CFG (Theorem 4.8) ----------

export type ECfgRound = { marked: string[]; because: Production[] }
export type ECfgResult = {
  ok: true
  /** True when L(G) = ∅, which is when the decider accepts. */
  empty: boolean
  /** rounds[0] marks every terminal; each later round marks the variables whose rule is now all marked. */
  rounds: ECfgRound[]
  unmarked: string[]
}

export function decideECfg(grammar: Grammar): ECfgResult {
  const marked = new Set(grammar.terminals)
  const rounds: ECfgRound[] = [{ marked: [...grammar.terminals], because: [] }]
  for (;;) {
    const round: ECfgRound = { marked: [], because: [] }
    for (const production of grammar.productions) {
      if (marked.has(production.head) || round.marked.includes(production.head)) continue
      if (production.body.every(symbol => marked.has(symbol))) { round.marked.push(production.head); round.because.push(production) }
    }
    if (!round.marked.length) break
    round.marked.forEach(symbol => marked.add(symbol))
    rounds.push(round)
  }
  return { ok: true, empty: !marked.has(grammar.start), rounds, unmarked: grammar.nonterminals.filter(symbol => !marked.has(symbol)) }
}

export { formatGrammar, formatProduction, isNonterminal }
