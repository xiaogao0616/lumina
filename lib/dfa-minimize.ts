import { isDfaShaped, completeWithSink } from './automata-dfa'
import { layoutPoint } from './nfa-to-dfa'
import { SOURCE_COLORS, indexedLabel, isAcceptingState, type AutomatonGraph, type AutomatonState, type AutomatonTransition, type StateKind } from './automaton-graph'

export type TransformResult = { ok: true; graph: AutomatonGraph } | { ok: false; message: string }

/** Table-filling (Moore) minimization. Input must already be DFA-shaped; it is completed with a sink first. */
export function minimizeDfa(graph: AutomatonGraph): TransformResult {
  const starts = graph.states.filter(state => state.kind === 'start')
  if (starts.length !== 1) {
    return { ok: false, message: starts.length === 0 ? 'Add one start state before minimizing.' : 'Keep exactly one start state before minimizing.' }
  }
  const ids = new Set(graph.states.map(state => state.id))
  if (ids.size !== graph.states.length) return { ok: false, message: 'State IDs must be unique.' }
  for (const transition of graph.transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) return { ok: false, message: 'A transition refers to a missing state.' }
  }
  if (!isDfaShaped(graph)) return { ok: false, message: 'Only a DFA-shaped graph (no ε, no branching) can be minimized.' }

  const alphabet = [...graph.symbols]
  const completed = completeWithSink(graph)
  const delta = new Map<string, Map<string, string>>()
  for (const state of completed.states) delta.set(state.id, new Map())
  for (const transition of completed.transitions) {
    for (const symbol of transition.symbols) delta.get(transition.source)!.set(symbol, transition.target)
  }
  const step = (id: string, symbol: string) => delta.get(id)!.get(symbol)!

  // Only reachable states take part in the minimal machine.
  const startId = starts[0].id
  const reachable = new Set([startId])
  const pending = [startId]
  while (pending.length) {
    const id = pending.pop()!
    for (const symbol of alphabet) {
      const target = step(id, symbol)
      if (!reachable.has(target)) { reachable.add(target); pending.push(target) }
    }
  }
  const states = completed.states.filter(state => reachable.has(state.id))
  const acceptingOf = new Map(states.map(state => [state.id, isAcceptingState(state)]))

  let groupOf = new Map(states.map(state => [state.id, acceptingOf.get(state.id) ? 1 : 0]))
  let groupCount = new Set(groupOf.values()).size
  for (let pass = 0; pass < states.length; pass++) {
    const signature = (id: string) => `${groupOf.get(id)}|${alphabet.map(symbol => groupOf.get(step(id, symbol))).join(',')}`
    const seen = new Map<string, number>()
    const nextGroup = new Map<string, number>()
    for (const state of states) {
      const key = signature(state.id)
      if (!seen.has(key)) seen.set(key, seen.size)
      nextGroup.set(state.id, seen.get(key)!)
    }
    // Partition refinement only ever splits groups further; an unchanged group count means it is stable.
    if (seen.size === groupCount) break
    groupOf = nextGroup
    groupCount = seen.size
  }

  const groups = new Map<number, AutomatonState[]>()
  for (const state of states) {
    const group = groupOf.get(state.id)!
    const list = groups.get(group) ?? []
    list.push(state)
    groups.set(group, list)
  }
  const idFor = new Map<number, string>()
  for (const [group, members] of groups) {
    idFor.set(group, `min:${members.map(state => state.id).sort().join('+')}`)
  }

  const startGroup = groupOf.get(startId)!
  const order = [...groups.keys()].sort((a, b) => (a === startGroup ? -1 : b === startGroup ? 1 : a - b))
  const layer = new Map<number, number>()
  const byLayer = new Map<number, number[]>()
  const bfs = [startGroup]
  layer.set(startGroup, 0)
  while (bfs.length) {
    const group = bfs.shift()!
    for (const symbol of alphabet) {
      const target = groupOf.get(step(groups.get(group)![0].id, symbol))!
      if (!layer.has(target)) { layer.set(target, layer.get(group)! + 1); bfs.push(target) }
    }
  }
  for (const group of order) {
    const l = layer.get(group) ?? 0
    const list = byLayer.get(l) ?? []
    list.push(group)
    byLayer.set(l, list)
  }

  // A group that is still just one original state didn't actually merge with anything — keep its
  // name (including any custom rename) instead of overwriting it. Only a real merge of several
  // states gets a fresh q/accept label, since there's no single original name to prefer there.
  let qIndex = 0, acceptIndex = 0
  const newStates: AutomatonState[] = order.map((group, colorIndex) => {
    const members = groups.get(group)!
    const l = layer.get(group) ?? 0
    const bucket = byLayer.get(l)!
    const accepting = acceptingOf.get(members[0].id)!
    const isStart = group === startGroup
    const isSinkGroup = members.some(state => state.label === '∅') && !accepting && members.every(state => alphabet.every(symbol => step(state.id, symbol) === state.id))
    const kind: StateKind = isStart ? 'start' : accepting ? 'accept' : 'state'
    const label = members.length > 1
      ? (kind === 'start' ? indexedLabel('start', 0) : kind === 'accept' ? indexedLabel('accept', acceptIndex++) : indexedLabel('q', qIndex++))
      : members[0].label
    return {
      id: idFor.get(group)!,
      label,
      kind,
      accepting: isStart && accepting ? true : undefined,
      position: layoutPoint(l, bucket.indexOf(group), bucket.length),
      color: isSinkGroup ? '#71717a' : SOURCE_COLORS[colorIndex % SOURCE_COLORS.length],
    }
  })

  const transitions: AutomatonTransition[] = []
  const edgeIndex = new Map<string, AutomatonTransition>()
  for (const group of order) {
    const representative = groups.get(group)![0].id
    for (const symbol of alphabet) {
      const targetGroup = groupOf.get(step(representative, symbol))!
      const key = `${idFor.get(group)}\0${idFor.get(targetGroup)}`
      const existing = edgeIndex.get(key)
      if (existing) { if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol); continue }
      const transition: AutomatonTransition = { id: `e-${idFor.get(group)}-${idFor.get(targetGroup)}`, source: idFor.get(group)!, target: idFor.get(targetGroup)!, symbols: [symbol] }
      edgeIndex.set(key, transition)
      transitions.push(transition)
    }
  }

  return { ok: true, graph: { states: newStates, transitions, symbols: alphabet } }
}
