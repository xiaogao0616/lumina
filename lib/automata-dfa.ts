import {
  EMPTY_SET_LABEL,
  SINK_ID,
  unusedId,
  type AutomatonGraph,
  type AutomatonState,
  type AutomatonTransition,
} from './automaton-graph'

export type SymbolConflict = {
  source: string
  sourceLabel: string
  symbol: string
  targets: { id: string; label: string }[]
}

export type MissingTransition = {
  source: string
  sourceLabel: string
  symbol: string
}

const labelOf = (graph: AutomatonGraph, id: string) => graph.states.find(state => state.id === id)?.label ?? id

function targetsFor(graph: AutomatonGraph, source: string, symbol: string): { id: string; label: string }[] {
  const seen = new Set<string>()
  const targets: { id: string; label: string }[] = []
  for (const transition of graph.transitions) {
    if (transition.source !== source || !transition.symbols.includes(symbol) || seen.has(transition.target)) continue
    seen.add(transition.target)
    targets.push({ id: transition.target, label: labelOf(graph, transition.target) })
  }
  return targets
}

export function countEpsilonEdges(graph: AutomatonGraph): number {
  return graph.transitions.filter(transition => transition.symbols.includes('ε')).length
}

export function symbolConflicts(graph: AutomatonGraph): SymbolConflict[] {
  const conflicts: SymbolConflict[] = []
  for (const state of graph.states) {
    const symbols = new Set<string>()
    for (const transition of graph.transitions) {
      if (transition.source !== state.id) continue
      for (const symbol of transition.symbols) symbols.add(symbol)
    }
    for (const symbol of symbols) {
      const targets = targetsFor(graph, state.id, symbol)
      if (targets.length > 1) {
        conflicts.push({ source: state.id, sourceLabel: state.label, symbol, targets })
      }
    }
  }
  return conflicts
}

export function missingDfaTransitions(graph: AutomatonGraph): MissingTransition[] {
  const missing: MissingTransition[] = []
  for (const state of graph.states) {
    for (const symbol of graph.symbols) {
      if (targetsFor(graph, state.id, symbol).length === 0) {
        missing.push({ source: state.id, sourceLabel: state.label, symbol })
      }
    }
  }
  return missing
}

export function isDfaShaped(graph: AutomatonGraph): boolean {
  return countEpsilonEdges(graph) === 0 && symbolConflicts(graph).length === 0
}

export function dfaAssignError(graph: AutomatonGraph, edgeId: string, symbol: string): string | null {
  if (symbol === 'ε') return 'DFA transitions cannot use ε. Switch to the NFA lab for empty moves.'
  const edge = graph.transitions.find(transition => transition.id === edgeId)
  if (!edge) return 'That transition is gone.'
  if (edge.symbols.includes(symbol)) return null
  const other = graph.transitions.find(transition =>
    transition.id !== edgeId && transition.source === edge.source && transition.symbols.includes(symbol))
  if (!other) return null
  const target = labelOf(graph, other.target)
  return `“${symbol}” already leaves ${labelOf(graph, edge.source)} toward ${target}. Remove it first, or switch to the NFA lab.`
}

function findReusableSink(graph: AutomatonGraph): AutomatonState | undefined {
  return graph.states.find(state =>
    state.label === EMPTY_SET_LABEL && state.kind === 'state' && !state.accepting)
}

function addSymbolToSinkEdge(transitions: AutomatonTransition[], source: string, sinkId: string, symbol: string) {
  const existing = transitions.find(transition => transition.source === source && transition.target === sinkId)
  if (existing) {
    if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol)
    return
  }
  transitions.push({
    id: `e-${source}-${sinkId}-${symbol}`,
    source,
    target: sinkId,
    symbols: [symbol],
  })
}

/** Fill every missing (state, symbol) with an edge to a non-accepting sink that loops on Σ. */
export function completeWithSink(graph: AutomatonGraph): AutomatonGraph {
  if (graph.symbols.length === 0 || missingDfaTransitions(graph).length === 0) {
    return {
      states: graph.states.map(state => ({ ...state, position: { ...state.position } })),
      transitions: graph.transitions.map(transition => ({ ...transition, symbols: [...transition.symbols] })),
      symbols: [...graph.symbols],
    }
  }
  const states = graph.states.map(state => ({ ...state, position: { ...state.position } }))
  const transitions = graph.transitions.map(transition => ({ ...transition, symbols: [...transition.symbols] }))
  let sink = findReusableSink({ states, transitions, symbols: graph.symbols })
  if (!sink) {
    const maxX = states.reduce((max, state) => Math.max(max, state.position.x), 0)
    const avgY = states.length
      ? states.reduce((sum, state) => sum + state.position.y, 0) / states.length
      : 168
    sink = {
      id: unusedId(new Set(states.map(state => state.id)), SINK_ID),
      label: EMPTY_SET_LABEL,
      kind: 'state',
      position: { x: maxX + 220, y: avgY },
      color: '#71717a',
    }
    states.push(sink)
  }
  for (const state of states) {
    for (const symbol of graph.symbols) {
      if (targetsFor({ states, transitions, symbols: graph.symbols }, state.id, symbol).length) continue
      addSymbolToSinkEdge(transitions, state.id, sink.id, symbol)
    }
  }
  return { states, transitions, symbols: [...graph.symbols] }
}
