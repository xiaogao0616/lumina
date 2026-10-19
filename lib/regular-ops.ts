import { completeWithSink, isDfaShaped } from './automata-dfa'
import { minimizeDfa } from './dfa-minimize'
import { layoutPoint, nfaToDfa } from './nfa-to-dfa'
import {
  SOURCE_COLORS, indexedLabel, isAcceptingState,
  type AutomatonGraph, type AutomatonState, type AutomatonTransition, type StateKind,
} from './automaton-graph'

/**
 * Operations on regular languages given as DFAs or NFAs: comparing two of them, combining them
 * with the product construction, complementing one, and turning one back into a regular
 * expression by state elimination.
 */

export type TransformResult = { ok: true; graph: AutomatonGraph } | { ok: false; message: string }

/** A complete deterministic transition table: every (state, symbol) has exactly one successor. */
type Table = { start: string; accepting: Set<string>; delta: Map<string, Map<string, string>>; symbols: string[] }

function validate(graph: AutomatonGraph): string | null {
  const starts = graph.states.filter(state => state.kind === 'start')
  if (starts.length !== 1) return starts.length === 0 ? 'Add one start state first.' : 'Keep exactly one start state.'
  const ids = new Set(graph.states.map(state => state.id))
  if (ids.size !== graph.states.length) return 'State IDs must be unique.'
  if (graph.transitions.some(transition => !ids.has(transition.source) || !ids.has(transition.target))) return 'A transition refers to a missing state.'
  return null
}

/** Determinizes over `symbols` (which may include characters the graph never uses: those go to the sink). */
function tableFor(graph: AutomatonGraph, symbols: string[]): { ok: true; table: Table } | { ok: false; message: string } {
  const problem = validate(graph)
  if (problem) return { ok: false, message: problem }
  const result = nfaToDfa({ ...graph, symbols })
  if (!result.ok) return result
  const delta = new Map<string, Map<string, string>>()
  for (const state of result.graph.states) delta.set(state.id, new Map())
  for (const transition of result.graph.transitions) {
    for (const symbol of transition.symbols) delta.get(transition.source)!.set(symbol, transition.target)
  }
  return {
    ok: true,
    table: {
      start: result.graph.states.find(state => state.kind === 'start')!.id,
      accepting: new Set(result.graph.states.filter(isAcceptingState).map(state => state.id)),
      delta,
      symbols,
    },
  }
}

/** Both alphabets, the first graph's characters first, so witnesses come out in a familiar order. */
function unionAlphabet(a: AutomatonGraph, b: AutomatonGraph): string[] {
  return [...a.symbols, ...b.symbols.filter(symbol => !a.symbols.includes(symbol))]
}

export type Comparison = {
  equivalent: boolean
  /** Shortest string (shortlex) the first machine accepts and the second rejects, or null if none. */
  onlyFirst: string | null
  /** Shortest string the second machine accepts and the first rejects, or null if none. */
  onlySecond: string | null
}

/**
 * Decides whether two finite automata accept the same language by walking their product breadth
 * first. Because the walk goes in shortlex order, the first disagreement found on each side is the
 * shortest string that tells the two machines apart.
 */
export function compareAutomata(first: AutomatonGraph, second: AutomatonGraph): { ok: true; comparison: Comparison } | { ok: false; message: string } {
  const symbols = unionAlphabet(first, second)
  const a = tableFor(first, symbols)
  if (!a.ok) return { ok: false, message: `First machine: ${a.message}` }
  const b = tableFor(second, symbols)
  if (!b.ok) return { ok: false, message: `Second machine: ${b.message}` }
  const startKey = `${a.table.start}\0${b.table.start}`
  const word = new Map<string, string>([[startKey, '']])
  const queue: [string, string][] = [[a.table.start, b.table.start]]
  let onlyFirst: string | null = null
  let onlySecond: string | null = null
  for (let head = 0; head < queue.length && (onlyFirst === null || onlySecond === null); head++) {
    const [p, q] = queue[head]
    const here = word.get(`${p}\0${q}`)!
    const inA = a.table.accepting.has(p), inB = b.table.accepting.has(q)
    if (inA && !inB && onlyFirst === null) onlyFirst = here
    if (inB && !inA && onlySecond === null) onlySecond = here
    for (const symbol of symbols) {
      const next: [string, string] = [a.table.delta.get(p)!.get(symbol)!, b.table.delta.get(q)!.get(symbol)!]
      const key = `${next[0]}\0${next[1]}`
      if (word.has(key)) continue
      word.set(key, here + symbol)
      queue.push(next)
    }
  }
  return { ok: true, comparison: { equivalent: onlyFirst === null && onlySecond === null, onlyFirst, onlySecond } }
}

export type SetOperation = 'union' | 'intersection' | 'difference'

const keeps: Record<SetOperation, (inA: boolean, inB: boolean) => boolean> = {
  union: (inA, inB) => inA || inB,
  intersection: (inA, inB) => inA && inB,
  difference: (inA, inB) => inA && !inB,
}

/** Lays states out left to right by breadth-first distance from the start. */
function layered(order: string[], layerOf: Map<string, number>): Map<string, { x: number; y: number }> {
  const buckets = new Map<number, string[]>()
  for (const id of order) {
    const layer = layerOf.get(id) ?? 0
    buckets.set(layer, [...(buckets.get(layer) ?? []), id])
  }
  return new Map(order.map(id => {
    const bucket = buckets.get(layerOf.get(id) ?? 0)!
    return [id, layoutPoint(layerOf.get(id) ?? 0, bucket.indexOf(id), bucket.length)]
  }))
}

/** start₀ for the start state, accept₀, accept₁, … and q₀, q₁, … for the rest, in order. */
function freshLabels(states: { id: string; kind: StateKind }[]): Map<string, string> {
  let q = 0, accept = 0
  return new Map(states.map(state => [state.id,
    state.kind === 'start' ? indexedLabel('start', 0) : state.kind === 'accept' ? indexedLabel('accept', accept++) : indexedLabel('q', q++)]))
}

/**
 * The product construction: runs both machines side by side and accepts by `operation`. The
 * result is minimized, so it is the smallest DFA for the combined language.
 */
export function combineAutomata(first: AutomatonGraph, second: AutomatonGraph, operation: SetOperation): TransformResult {
  const symbols = unionAlphabet(first, second)
  const a = tableFor(first, symbols)
  if (!a.ok) return { ok: false, message: `First machine: ${a.message}` }
  const b = tableFor(second, symbols)
  if (!b.ok) return { ok: false, message: `Second machine: ${b.message}` }
  const idOf = (p: string, q: string) => `x:${p}|${q}`
  const startId = idOf(a.table.start, b.table.start)
  const pairs = new Map<string, [string, string]>([[startId, [a.table.start, b.table.start]]])
  const layerOf = new Map([[startId, 0]])
  const order = [startId]
  const transitions: AutomatonTransition[] = []
  for (let head = 0; head < order.length; head++) {
    const id = order[head]
    const [p, q] = pairs.get(id)!
    const byTarget = new Map<string, string[]>()
    for (const symbol of symbols) {
      const next: [string, string] = [a.table.delta.get(p)!.get(symbol)!, b.table.delta.get(q)!.get(symbol)!]
      const nextId = idOf(...next)
      if (!pairs.has(nextId)) { pairs.set(nextId, next); layerOf.set(nextId, layerOf.get(id)! + 1); order.push(nextId) }
      byTarget.set(nextId, [...(byTarget.get(nextId) ?? []), symbol])
    }
    for (const [target, edgeSymbols] of byTarget) transitions.push({ id: `e-${id}-${target}`, source: id, target, symbols: edgeSymbols })
  }
  const positions = layered(order, layerOf)
  const kinds = order.map(id => {
    const [p, q] = pairs.get(id)!
    const accepting = keeps[operation](a.table.accepting.has(p), b.table.accepting.has(q))
    return { id, accepting, kind: (id === startId ? 'start' : accepting ? 'accept' : 'state') as StateKind }
  })
  const labels = freshLabels(kinds)
  const states: AutomatonState[] = kinds.map((item, index) => ({
    id: item.id, label: labels.get(item.id)!, kind: item.kind,
    accepting: item.kind === 'start' && item.accepting ? true : undefined,
    position: positions.get(item.id)!, color: SOURCE_COLORS[index % SOURCE_COLORS.length],
  }))
  return minimizeDfa({ states, transitions, symbols })
}

/**
 * The complement over the machine's own alphabet: determinize (or just complete a DFA with a sink),
 * then swap accepting and non-accepting states. A drawn DFA keeps its layout and its own names,
 * except default names like accept₀ that would now say the opposite of what the state does.
 */
export function complementAutomaton(graph: AutomatonGraph): TransformResult {
  const problem = validate(graph)
  if (problem) return { ok: false, message: problem }
  if (!graph.symbols.length) return { ok: false, message: 'Add at least one character to the alphabet first.' }
  let complete: AutomatonGraph
  if (isDfaShaped(graph)) complete = completeWithSink(graph)
  else {
    const result = nfaToDfa(graph)
    if (!result.ok) return result
    complete = result.graph
  }
  const flipped = complete.states.map(state => {
    const accepting = !isAcceptingState(state)
    return { ...state, kind: (state.kind === 'start' ? 'start' : accepting ? 'accept' : 'state') as StateKind, accepting: state.kind === 'start' && accepting ? true : undefined }
  })
  const generic = /^(?:q|accept)[₀-₉]+$/
  let q = 0, accept = 0
  const taken = new Set(flipped.filter(state => !generic.test(state.label)).map(state => state.label))
  const next = (prefix: string, counter: () => number) => { let label; do label = indexedLabel(prefix, counter()); while (taken.has(label)); taken.add(label); return label }
  const states = flipped.map(state => generic.test(state.label) && state.kind !== 'start'
    ? { ...state, label: state.kind === 'accept' ? next('accept', () => accept++) : next('q', () => q++) }
    : state)
  return { ok: true, graph: { states, transitions: complete.transitions, symbols: [...complete.symbols] } }
}

// ---------------------------------------------------------------------------------------------
// State elimination: automaton → regular expression

type Regex =
  | { t: 'empty' }
  | { t: 'eps' }
  | { t: 'sym'; c: string }
  | { t: 'alt'; items: Regex[] }
  | { t: 'cat'; items: Regex[] }
  | { t: 'star'; r: Regex }

const EMPTY: Regex = { t: 'empty' }
const EPS: Regex = { t: 'eps' }
const OPERATOR_CHARS = new Set(Array.from('|()*+?\\'))

const key = (r: Regex): string => print(r, 'ε', 0)
const nullable = (r: Regex): boolean => r.t === 'eps' || r.t === 'star' || (r.t === 'alt' && r.items.some(nullable)) || (r.t === 'cat' && r.items.every(nullable))

function alt(...parts: Regex[]): Regex {
  const flat = parts.flatMap(part => part.t === 'alt' ? part.items : [part]).filter(part => part.t !== 'empty')
  const unique = new Map<string, Regex>()
  for (const part of flat) unique.set(key(part), part)
  let items = [...unique.values()]
  // x | x* = x*, and ε is redundant next to anything that already matches ε.
  const stars = new Set(items.filter(item => item.t === 'star').map(item => key((item as { r: Regex }).r)))
  items = items.filter(item => !stars.has(key(item)))
  // ε | x+ = x*
  if (items.some(item => item.t === 'eps')) items = items.map(item => { const base = plusBase(item); return base ? star(base) : item })
  if (items.some(item => item.t !== 'eps' && nullable(item))) items = items.filter(item => item.t !== 'eps')
  items = factorPlus(items)
  if (!items.length) return EMPTY
  if (items.length === 1) return items[0]
  // Single characters first, in alphabet order, then longer pieces; ε last so it prints as "?".
  const rank = (item: Regex) => item.t === 'eps' ? 2 : item.t === 'sym' ? 0 : 1
  items.sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? key(x).localeCompare(key(y)) : 0))
  return { t: 'alt', items }
}

/**
 * u v | u y+ v = u y* v, for any pair of alternatives that differ only by a y+ in the middle.
 * State elimination produces this shape a lot (a path that skips a loop, next to one that takes it).
 */
function factorPlus(items: Regex[]): Regex[] {
  const pieces = (r: Regex) => r.t === 'eps' ? [] : r.t === 'cat' ? r.items : [r]
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue
      const short = pieces(items[i]), long = pieces(items[j])
      if (long.length <= short.length) continue
      let prefix = 0
      while (prefix < short.length && key(short[prefix]) === key(long[prefix])) prefix++
      let suffix = 0
      while (suffix < short.length - prefix && key(short[short.length - 1 - suffix]) === key(long[long.length - 1 - suffix])) suffix++
      if (prefix + suffix !== short.length) continue
      const base = plusBase(cat(...long.slice(prefix, long.length - suffix)))
      if (!base) continue
      const merged = cat(...short.slice(0, prefix), star(base), ...short.slice(prefix))
      return factorPlus([...items.filter((_, index) => index !== i && index !== j), merged])
    }
  }
  return items
}

/** x when r is x x* (that is, x+), otherwise null. */
function plusBase(r: Regex): Regex | null {
  if (r.t !== 'cat') return null
  const last = r.items[r.items.length - 1]
  if (last.t !== 'star') return null
  const inner = last.r.t === 'cat' ? last.r.items : [last.r]
  const prefix = r.items.slice(0, -1)
  return prefix.length === inner.length && prefix.every((item, index) => key(item) === key(inner[index])) ? last.r : null
}

function cat(...parts: Regex[]): Regex {
  if (parts.some(part => part.t === 'empty')) return EMPTY
  const items: Regex[] = []
  for (const part of parts.flatMap(item => item.t === 'cat' ? item.items : [item])) {
    if (part.t === 'eps') continue
    const last = items[items.length - 1]
    if (last && last.t === 'star' && part.t === 'star' && key(last) === key(part)) continue // x*x* = x*
    items.push(part)
  }
  return items.length === 0 ? EPS : items.length === 1 ? items[0] : { t: 'cat', items }
}

function star(r: Regex): Regex {
  if (r.t === 'empty' || r.t === 'eps') return EPS
  if (r.t === 'star') return r
  // (ε | x)* = x*
  if (r.t === 'alt' && r.items.some(item => item.t === 'eps')) return star(alt(...r.items.filter(item => item.t !== 'eps')))
  return { t: 'star', r }
}

/** Precedence: 0 inside a union, 1 inside a concatenation, 2 as the operand of a postfix operator. */
function print(r: Regex, epsilon: string, level: number): string {
  const wrap = (text: string, needs: boolean) => needs ? `(${text})` : text
  switch (r.t) {
    case 'empty': return '∅'
    case 'eps': return epsilon
    case 'sym': return OPERATOR_CHARS.has(r.c) ? `\\${r.c}` : r.c
    case 'star': return `${print(r.r, epsilon, 2)}*`
    case 'alt': {
      const rest = r.items.filter(item => item.t !== 'eps')
      if (rest.length < r.items.length) return `${print(rest.length === 1 ? rest[0] : { t: 'alt', items: rest }, epsilon, 2)}?`
      return wrap(rest.map(item => print(item, epsilon, 0)).join('|'), level > 0)
    }
    case 'cat': {
      const pieces: string[] = []
      for (let index = 0; index < r.items.length; index++) {
        // x x* prints as x+, where x may itself be several pieces long.
        const plus = r.items.slice(index + 1).findIndex((_, offset) => plusBase({ t: 'cat', items: r.items.slice(index, index + offset + 2) }))
        if (plus !== -1) {
          const base = plusBase({ t: 'cat', items: r.items.slice(index, index + plus + 2) })!
          pieces.push(`${print(base, epsilon, 2)}+`)
          index += plus + 1
          continue
        }
        pieces.push(print(r.items[index], epsilon, 1))
      }
      return wrap(pieces.join(''), level > 1)
    }
  }
}

export type RegexResult =
  | { ok: true; empty: true }
  | { ok: true; empty: false; pattern: string; display: string }
  | { ok: false; message: string }

/**
 * State elimination (the GNFA method). States that can't be reached, or can't reach an accepting
 * state, are dropped first; then each remaining state is ripped out in the order that creates the
 * fewest new paths. `pattern` uses the same syntax as Regex → NFA (a blank spot means ε), so it can
 * be pasted straight back in; `display` shows ε where the pattern would be blank.
 */
export function automatonToRegex(graph: AutomatonGraph): RegexResult {
  const problem = validate(graph)
  if (problem) return { ok: false, message: problem }
  const start = graph.states.find(state => state.kind === 'start')!.id
  const forward = new Map<string, Set<string>>(), backward = new Map<string, Set<string>>()
  for (const transition of graph.transitions) {
    if (!transition.symbols.length) continue
    forward.set(transition.source, (forward.get(transition.source) ?? new Set()).add(transition.target))
    backward.set(transition.target, (backward.get(transition.target) ?? new Set()).add(transition.source))
  }
  const reach = (seeds: string[], edges: Map<string, Set<string>>) => {
    const seen = new Set(seeds), pending = [...seeds]
    while (pending.length) for (const next of edges.get(pending.pop()!) ?? []) if (!seen.has(next)) { seen.add(next); pending.push(next) }
    return seen
  }
  const live = reach([start], forward)
  const useful = reach(graph.states.filter(isAcceptingState).map(state => state.id), backward)
  const keep = graph.states.filter(state => live.has(state.id) && useful.has(state.id)).map(state => state.id)
  if (!keep.includes(start)) return { ok: true, empty: true }

  const INIT = '\0init', FINAL = '\0final'
  const edges = new Map<string, Map<string, Regex>>()
  const get = (i: string, j: string) => edges.get(i)?.get(j) ?? EMPTY
  const set = (i: string, j: string, r: Regex) => {
    if (!edges.has(i)) edges.set(i, new Map())
    if (r.t === 'empty') edges.get(i)!.delete(j)
    else edges.get(i)!.set(j, r)
  }
  const kept = new Set(keep)
  set(INIT, start, EPS)
  for (const state of graph.states) if (kept.has(state.id) && isAcceptingState(state)) set(state.id, FINAL, EPS)
  for (const transition of graph.transitions) {
    if (!kept.has(transition.source) || !kept.has(transition.target)) continue
    const label = alt(...transition.symbols.map(symbol => symbol === 'ε' ? EPS : { t: 'sym', c: symbol } as Regex))
    set(transition.source, transition.target, alt(get(transition.source, transition.target), label))
  }

  const remaining = new Set(keep)
  while (remaining.size) {
    const sources = (k: string) => [INIT, ...remaining].filter(i => i !== k && get(i, k).t !== 'empty')
    const targets = (k: string) => [...remaining, FINAL].filter(j => j !== k && get(k, j).t !== 'empty')
    let best = '', bestCost = Infinity
    // Delgado & Morais' weight: roughly how much text ripping k out would copy into new edges.
    const size = (r: Regex) => key(r).length
    for (const k of keep) {
      if (!remaining.has(k)) continue
      const ins = sources(k), outs = targets(k)
      const cost = ins.reduce((sum, i) => sum + size(get(i, k)), 0) * (outs.length - 1)
        + outs.reduce((sum, j) => sum + size(get(k, j)), 0) * (ins.length - 1)
        + (get(k, k).t === 'empty' ? 0 : size(get(k, k)) * (ins.length * outs.length - 1))
      if (cost < bestCost) { best = k; bestCost = cost }
    }
    const loop = star(get(best, best))
    for (const i of sources(best)) {
      for (const j of targets(best)) set(i, j, alt(get(i, j), cat(get(i, best), loop, get(best, j))))
    }
    remaining.delete(best)
    edges.delete(best)
    for (const map of edges.values()) map.delete(best)
  }
  const result = get(INIT, FINAL)
  if (result.t === 'empty') return { ok: true, empty: true }
  return { ok: true, empty: false, pattern: print(result, '', 0), display: print(result, 'ε', 0) }
}
