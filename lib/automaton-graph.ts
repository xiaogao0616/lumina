export type AutomatonMode = 'dfa' | 'nfa'
export type StateKind = 'start' | 'state' | 'accept'

export const SOURCE_COLORS = ['#67c9ff', '#ffb86b', '#c4a0ff', '#64dcb4', '#f48fb1', '#e5d36f', '#91a8ff', '#ed9c78']
export const EMPTY_SET_LABEL = '∅'
export const SINK_ID = 'dfa-empty'

export type AutomatonState = {
  id: string
  label: string
  kind: StateKind
  accepting?: boolean
  position: { x: number; y: number }
  color: string
}

export type AutomatonTransition = {
  id: string
  source: string
  target: string
  symbols: string[]
}

export type AutomatonGraph = {
  states: AutomatonState[]
  transitions: AutomatonTransition[]
  symbols: string[]
}

export type StateCategory = { id: string; name: string; kind: StateKind }

export const builtInCategories: StateCategory[] = [
  { id: 'start', name: 'start', kind: 'start' },
  { id: 'q', name: 'q', kind: 'state' },
  { id: 'accept', name: 'accept', kind: 'accept' },
]

export const defaultNextIndices: [string, number][] = [
  ['start', 0],
  ['q', 0],
  ['accept', 0],
]

export function isAcceptingState(state: Pick<AutomatonState, 'kind' | 'accepting'>): boolean {
  return state.kind === 'accept' || !!state.accepting
}

export function transitionSymbols(edge: { data?: { symbols?: unknown }; label?: unknown }): string[] {
  const symbols = edge.data?.symbols
  return Array.isArray(symbols)
    ? symbols.filter((symbol): symbol is string => typeof symbol === 'string')
    : [typeof edge.label === 'string' ? edge.label : 'ε']
}

export function sourceColor(node: { id: string; color?: string } | { id: string; data?: { color?: string } }): string {
  const color = 'color' in node && node.color ? node.color : 'data' in node ? node.data?.color : undefined
  if (color) return color
  let hash = 0
  for (const char of node.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SOURCE_COLORS[hash % SOURCE_COLORS.length]
}

export function pickLeastUsedColor(used: string[]): string {
  return SOURCE_COLORS.reduce((best, candidate) =>
    used.filter(color => color === candidate).length < used.filter(color => color === best).length ? candidate : best,
  SOURCE_COLORS[0])
}

export const indexedLabel = (prefix: string, index: number) => prefix + String(index).replace(/[0-9]/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)])

export function unusedId(ids: Set<string>, base: string): string {
  if (!ids.has(base)) return base
  let index = 2
  while (ids.has(`${base}-${index}`)) index++
  return `${base}-${index}`
}

type EditorNode = {
  id: string
  position: { x: number; y: number }
  data: { label: string; kind: StateKind; color?: string; accepting?: boolean }
}

type EditorEdge = { id: string; source: string; target: string; data?: { symbols?: unknown }; label?: unknown }

export function graphFromEditor(nodes: EditorNode[], edges: EditorEdge[], symbols: string[]): AutomatonGraph {
  return {
    states: nodes.map(node => ({
      id: node.id,
      label: node.data.label,
      kind: node.data.kind,
      accepting: node.data.kind === 'start' && node.data.accepting ? true : undefined,
      position: node.position,
      color: sourceColor({ id: node.id, color: node.data.color }),
    })),
    transitions: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      symbols: transitionSymbols(edge),
    })),
    symbols: [...symbols],
  }
}

export function nextColorForGraph(graph: AutomatonGraph): string {
  return pickLeastUsedColor(graph.states.map(state => state.color))
}
