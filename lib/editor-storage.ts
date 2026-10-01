import {
  builtInCategories,
  defaultNextIndices,
  type AutomatonGraph,
  type AutomatonMode,
  type StateKind,
} from './automaton-graph'

export const LEGACY_EDITOR_STORAGE_KEY = 'automata-lab.editor.v1'
export const NFA_STORAGE_KEY = 'automata-lab.nfa.v1'
export const DFA_STORAGE_KEY = 'automata-lab.dfa.v1'
export const EDITOR_STORAGE_KEY = LEGACY_EDITOR_STORAGE_KEY

export type SavedEditor = {
  version: 2
  mode: AutomatonMode
  nodes: {
    id: string
    type: StateKind
    position: { x: number; y: number }
    data: { label: string; kind: StateKind; color: string; accepting?: boolean }
  }[]
  edges: { id: string; source: string; target: string; symbols: string[] }[]
  categories: { id: string; name: string; kind: StateKind }[]
  nextIndices: [string, number][]
  symbols: string[]
  testString: string
}

export function storageKey(mode: AutomatonMode): string {
  return mode === 'dfa' ? DFA_STORAGE_KEY : NFA_STORAGE_KEY
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const kind = (value: unknown): value is StateKind => value === 'start' || value === 'state' || value === 'accept'
const character = (value: unknown): value is string => text(value) && Array.from(value).length === 1 && !!value.trim()
const unique = (values: unknown[]) => new Set(values).size === values.length
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const mode = (value: unknown): value is AutomatonMode => value === 'dfa' || value === 'nfa'

function fail(): never {
  throw new Error('Invalid or unsupported local save')
}

function readNodes(raw: unknown, allowAccepting: boolean) {
  if (!Array.isArray(raw)) return fail()
  const nodes = raw.map(node => {
    if (!record(node) || !text(node.id) || !node.id || !kind(node.type) || !record(node.position)
      || !finiteNumber(node.position.x) || !finiteNumber(node.position.y) || !record(node.data)
      || node.data.kind !== node.type || !text(node.data.label) || !text(node.data.color)
      || !/^#[0-9a-f]{6}$/i.test(node.data.color)) return fail()
    if (node.data.accepting !== undefined) {
      if (!allowAccepting || typeof node.data.accepting !== 'boolean' || node.data.kind !== 'start' || !node.data.accepting) {
        return fail()
      }
    }
    return {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: node.data.label,
        kind: node.type,
        color: node.data.color,
        ...(node.data.accepting ? { accepting: true as const } : {}),
      },
    }
  })
  if (!unique(nodes.map(node => node.id))) return fail()
  return nodes
}

function readEdges(raw: unknown, nodeIds: Set<string>, symbols: string[], allowEpsilon: boolean) {
  if (!Array.isArray(raw)) return fail()
  const edges = raw.map(edge => {
    if (!record(edge) || !text(edge.id) || !edge.id || !text(edge.source) || !text(edge.target)
      || !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || !Array.isArray(edge.symbols)
      || !unique(edge.symbols)
      || !edge.symbols.every(symbol => (allowEpsilon && symbol === 'ε') || symbols.includes(symbol))) return fail()
    return { id: edge.id, source: edge.source, target: edge.target, symbols: edge.symbols as string[] }
  })
  if (!unique(edges.map(edge => edge.id))) return fail()
  return edges
}

function readCategories(raw: unknown) {
  if (!Array.isArray(raw) || !raw.every(category => record(category) && text(category.id) && !!category.id
    && text(category.name) && !!category.name.trim() && kind(category.kind))) return fail()
  if (!unique(raw.map(category => (category as { id: string }).id))
    || !unique(raw.map(category => String((category as { name: string }).name).toLowerCase()))) return fail()
  for (const [id, name, categoryKind] of [['start', 'start', 'start'], ['q', 'q', 'state'], ['accept', 'accept', 'accept']] as const) {
    if (!raw.some(category => record(category) && category.id === id && category.name === name && category.kind === categoryKind)) {
      return fail()
    }
  }
  return raw.map(category => {
    const item = category as { id: string; name: string; kind: StateKind }
    return { id: item.id, name: item.name, kind: item.kind }
  })
}

function readNextIndices(raw: unknown, categories: { id: string }[]) {
  if (!Array.isArray(raw) || !raw.every(pair => Array.isArray(pair) && pair.length === 2 && text(pair[0])
    && Number.isSafeInteger(pair[1]) && pair[1] >= 0 && categories.some(category => category.id === pair[0]))) return fail()
  if (!unique(raw.map(pair => (pair as [string, number])[0])) || raw.length !== categories.length) return fail()
  return raw.map(pair => [String((pair as [string, number])[0]), (pair as [string, number])[1]] as [string, number])
}

function readSymbols(raw: unknown) {
  if (!Array.isArray(raw) || !raw.every(symbol => character(symbol) && symbol !== 'ε') || !unique(raw)) return fail()
  return raw as string[]
}

/** Validate before restoring anything; incompatible or corrupt data must never replace the current graph. */
export function readSavedEditor(raw: string, expectedMode?: AutomatonMode): SavedEditor {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || !Array.isArray(value.categories) || !Array.isArray(value.nextIndices) || !Array.isArray(value.symbols)
    || !text(value.testString)) return fail()

  const savedMode: AutomatonMode = value.version === 1 ? 'nfa' : mode(value.mode) ? value.mode : fail()
  if (value.version !== 1 && value.version !== 2) return fail()
  if (expectedMode && savedMode !== expectedMode) return fail()

  const symbols = readSymbols(value.symbols)
  const categories = readCategories(value.categories)
  const nextIndices = readNextIndices(value.nextIndices, categories)
  const nodes = readNodes(value.nodes, true)
  const allowEpsilon = savedMode === 'nfa'
  const edges = readEdges(value.edges, new Set(nodes.map(node => node.id)), symbols, allowEpsilon)
  return { version: 2, mode: savedMode, nodes, edges, categories, nextIndices, symbols, testString: value.testString }
}

export function graphToSavedEditor(
  mode: AutomatonMode,
  graph: AutomatonGraph,
  extras?: { categories?: SavedEditor['categories']; nextIndices?: SavedEditor['nextIndices']; testString?: string },
): SavedEditor {
  return {
    version: 2,
    mode,
    nodes: graph.states.map(state => ({
      id: state.id,
      type: state.kind,
      position: state.position,
      data: {
        label: state.label,
        kind: state.kind,
        color: state.color,
        ...(state.kind === 'start' && state.accepting ? { accepting: true as const } : {}),
      },
    })),
    edges: graph.transitions.map(transition => ({
      id: transition.id,
      source: transition.source,
      target: transition.target,
      symbols: transition.symbols,
    })),
    categories: extras?.categories ?? builtInCategories,
    nextIndices: extras?.nextIndices ?? defaultNextIndices,
    symbols: [...graph.symbols],
    testString: extras?.testString ?? '',
  }
}

export function savedEditorHasContent(raw: string | null): boolean {
  if (raw === null) return false
  try {
    readSavedEditor(raw)
    return true
  } catch {
    return false
  }
}

// One browser-tab-style strip shared by both modes — a tab can be either a DFA or an NFA.
// Each tab's own graph lives at its own tabStorageKey; this index just tracks which tabs
// exist, their mode and title, and which one is active.
export type SavedTab = { id: string; mode: AutomatonMode; title: string }
export type TabsIndex = { activeId: string; tabs: SavedTab[] }

export function tabsIndexKey(): string {
  return 'automata-lab.tabs-index.v1'
}

export function tabStorageKey(mode: AutomatonMode, tabId: string): string {
  return `automata-lab.${mode}.tab.${tabId}.v1`
}

export function readTabsIndex(raw: string): TabsIndex {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || !text(value.activeId) || !value.activeId || !Array.isArray(value.tabs)) return fail()
  const tabs = value.tabs.map(tab => {
    if (!record(tab) || !text(tab.id) || !tab.id || !mode(tab.mode) || !text(tab.title) || !tab.title.trim()) return fail()
    return { id: tab.id, mode: tab.mode, title: tab.title }
  })
  if (!tabs.length || !unique(tabs.map(tab => tab.id)) || !tabs.some(tab => tab.id === value.activeId)) return fail()
  return { activeId: value.activeId, tabs }
}

// --- One-time migration from the older, per-mode tab strip (and, before that, one save per mode). ---

export function legacyModeTabsIndexKey(mode: AutomatonMode): string {
  return mode === 'dfa' ? 'automata-lab.dfa.tabs-index.v1' : 'automata-lab.nfa.tabs-index.v1'
}

export function readLegacyModeTabsIndex(raw: string): { activeId: string; tabs: { id: string; title: string }[] } {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || !text(value.activeId) || !value.activeId || !Array.isArray(value.tabs)) return fail()
  const tabs = value.tabs.map(tab => {
    if (!record(tab) || !text(tab.id) || !tab.id || !text(tab.title) || !tab.title.trim()) return fail()
    return { id: tab.id, title: tab.title }
  })
  if (!tabs.length || !unique(tabs.map(tab => tab.id)) || !tabs.some(tab => tab.id === value.activeId)) return fail()
  return { activeId: value.activeId, tabs }
}
