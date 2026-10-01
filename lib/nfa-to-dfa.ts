import {
  EMPTY_SET_LABEL,
  SINK_ID,
  SOURCE_COLORS,
  type AutomatonGraph,
  type AutomatonState,
  type AutomatonTransition,
} from './automaton-graph'

export type TransformResult =
  | { ok: true; graph: AutomatonGraph }
  | { ok: false; message: string }

type Outgoing = Map<string, { target: string; symbols: string[] }[]>

function outgoingMap(graph: AutomatonGraph): Outgoing {
  const outgoing: Outgoing = new Map()
  for (const transition of graph.transitions) {
    const list = outgoing.get(transition.source) ?? []
    list.push({ target: transition.target, symbols: transition.symbols })
    outgoing.set(transition.source, list)
  }
  return outgoing
}

function epsilonClosure(outgoing: Outgoing, seeds: Iterable<string>): Set<string> {
  const reached = new Set(seeds)
  const pending = [...reached]
  while (pending.length) {
    const source = pending.pop()!
    for (const edge of outgoing.get(source) ?? []) {
      if (edge.symbols.includes('ε') && !reached.has(edge.target)) {
        reached.add(edge.target)
        pending.push(edge.target)
      }
    }
  }
  return reached
}

function move(outgoing: Outgoing, states: Iterable<string>, symbol: string): Set<string> {
  const next = new Set<string>()
  for (const source of states) {
    for (const edge of outgoing.get(source) ?? []) {
      if (symbol !== 'ε' && edge.symbols.includes(symbol)) next.add(edge.target)
    }
  }
  return epsilonClosure(outgoing, next)
}

function subsetKey(ids: Iterable<string>): string {
  return [...ids].sort().join('\0')
}

function subsetId(key: string, emptyKey: string): string {
  return key === emptyKey ? SINK_ID : `dfa:${key.replace(/\0/g, '+')}`
}

function subsetLabel(graph: AutomatonGraph, ids: Iterable<string>): string {
  const labels = [...ids]
    .map(id => graph.states.find(state => state.id === id)?.label ?? id)
    .sort((a, b) => a.localeCompare(b))
  return labels.length ? `{${labels.join(', ')}}` : EMPTY_SET_LABEL
}

export function layoutPoint(layer: number, index: number, layerSize: number): { x: number; y: number } {
  const columnX = 80 + layer * 240
  const totalHeight = Math.max(0, layerSize - 1) * 160
  const columnY = 80 + index * 160 - totalHeight / 2 + 80
  return { x: columnX, y: columnY }
}

/** Subset construction. Missing moves become a complete ∅ sink. */
export function nfaToDfa(graph: AutomatonGraph): TransformResult {
  const starts = graph.states.filter(state => state.kind === 'start')
  if (starts.length !== 1) {
    return {
      ok: false,
      message: starts.length === 0
        ? 'Add one start state before converting.'
        : 'Keep exactly one start state before converting.',
    }
  }
  const ids = new Set(graph.states.map(state => state.id))
  if (ids.size !== graph.states.length) return { ok: false, message: 'State IDs must be unique.' }
  for (const transition of graph.transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) {
      return { ok: false, message: 'A transition refers to a missing state.' }
    }
  }

  const outgoing = outgoingMap(graph)
  const alphabet = [...graph.symbols]
  const startSet = epsilonClosure(outgoing, [starts[0].id])
  const startKey = subsetKey(startSet)
  const subsets = new Map<string, Set<string>>()
  const layerOf = new Map<string, number>()
  const order: string[] = []
  const pending: string[] = []

  const addSubset = (set: Set<string>, layer: number) => {
    const key = subsetKey(set)
    if (subsets.has(key)) return key
    subsets.set(key, set)
    layerOf.set(key, layer)
    order.push(key)
    pending.push(key)
    return key
  }

  addSubset(startSet, 0)
  const emptyKey = subsetKey([])
  let usedEmpty = false

  while (pending.length) {
    const key = pending.shift()!
    const current = subsets.get(key)!
    const layer = layerOf.get(key) ?? 0
    for (const symbol of alphabet) {
      const next = move(outgoing, current, symbol)
      if (next.size === 0) {
        usedEmpty = true
        if (!subsets.has(emptyKey)) addSubset(new Set(), layer + 1)
        continue
      }
      addSubset(next, layer + 1)
    }
  }

  if (usedEmpty) {
    layerOf.set(emptyKey, Math.max(...layerOf.values(), 0))
  }

  const layerBuckets = new Map<number, string[]>()
  for (const key of order) {
    const layer = layerOf.get(key) ?? 0
    const bucket = layerBuckets.get(layer) ?? []
    bucket.push(key)
    layerBuckets.set(layer, bucket)
  }

  const idForKey = (key: string) => subsetId(key, emptyKey)
  const states: AutomatonState[] = []
  let colorIndex = 0
  for (const key of order) {
    const set = subsets.get(key)!
    const isStart = key === startKey
    const accepting = [...set].some(id => {
      const state = graph.states.find(item => item.id === id)
      return state?.kind === 'accept' || !!state?.accepting
    })
    const layer = layerOf.get(key) ?? 0
    const bucket = layerBuckets.get(layer) ?? [key]
    const index = bucket.indexOf(key)
    states.push({
      id: idForKey(key),
      label: subsetLabel(graph, set),
      kind: isStart ? 'start' : accepting ? 'accept' : 'state',
      accepting: isStart && accepting ? true : undefined,
      position: layoutPoint(layer, index, bucket.length),
      color: key === emptyKey ? '#71717a' : SOURCE_COLORS[colorIndex++ % SOURCE_COLORS.length],
    })
  }

  const transitions: AutomatonTransition[] = []
  const edgeIndex = new Map<string, AutomatonTransition>()
  const addEdge = (source: string, target: string, symbol: string) => {
    const key = `${source}\0${target}`
    const existing = edgeIndex.get(key)
    if (existing) {
      if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol)
      return
    }
    const edge: AutomatonTransition = {
      id: `e-${source}-${target}`,
      source,
      target,
      symbols: [symbol],
    }
    edgeIndex.set(key, edge)
    transitions.push(edge)
  }

  for (const key of order) {
    const current = subsets.get(key)!
    const sourceId = idForKey(key)
    for (const symbol of alphabet) {
      const next = move(outgoing, current, symbol)
      const targetKey = next.size === 0 ? emptyKey : subsetKey(next)
      addEdge(sourceId, idForKey(targetKey), symbol)
    }
  }

  return { ok: true, graph: { states, transitions, symbols: alphabet } }
}

export function copyAsNfa(graph: AutomatonGraph): AutomatonGraph {
  return {
    states: graph.states.map(state => ({ ...state, position: { ...state.position } })),
    transitions: graph.transitions.map(transition => ({ ...transition, symbols: [...transition.symbols] })),
    symbols: [...graph.symbols],
  }
}
