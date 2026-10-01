import { layoutPoint } from './nfa-to-dfa'
import { SOURCE_COLORS, type AutomatonGraph, type AutomatonState, type AutomatonTransition } from './automaton-graph'

export type TransformResult = { ok: true; graph: AutomatonGraph } | { ok: false; message: string }

type Fragment = { start: string; accept: string }

class RegexError extends Error {}

const OPERATORS = '|)*+?'

/**
 * Thompson construction for a small regex dialect: literals, `|` union, implicit concatenation,
 * `*` `+` `?`, and `(...)` grouping. `\x` escapes any character, including the operators above.
 * An empty spot (start/end of string, next to `|`, or inside `()`) denotes ε.
 */
export function regexToNfa(pattern: string): TransformResult {
  const chars = Array.from(pattern.trim())
  let pos = 0
  let counter = 0
  const states: AutomatonState[] = []
  const transitions: AutomatonTransition[] = []
  const symbols = new Set<string>()

  const newState = (): string => {
    const id = `rx${counter++}`
    states.push({ id, label: id, kind: 'state', position: { x: 0, y: 0 }, color: SOURCE_COLORS[0] })
    return id
  }
  const addEdge = (source: string, target: string, symbol: string) => {
    transitions.push({ id: `e-${source}-${target}-${transitions.length}`, source, target, symbols: [symbol] })
  }
  const peek = () => chars[pos]
  const atEnd = () => pos >= chars.length
  const startsAtom = (char: string | undefined) => char !== undefined && char !== '|' && char !== ')'

  function parseAtom(): Fragment {
    if (peek() === '(') {
      pos++
      const fragment = parseUnion()
      if (peek() !== ')') throw new RegexError('Missing ")" to close a group.')
      pos++
      return fragment
    }
    let literal = chars[pos]
    pos++
    if (literal === '\\') {
      if (atEnd()) throw new RegexError('A trailing "\\" has nothing to escape.')
      literal = chars[pos]
      pos++
    } else if (OPERATORS.includes(literal)) {
      throw new RegexError(`Unexpected "${literal}" — nothing to repeat or combine there.`)
    }
    if (literal === 'ε') throw new RegexError('ε is reserved for the empty string; leave that spot blank instead.')
    if (!literal.trim()) throw new RegexError('Whitespace cannot be a transition character.')
    symbols.add(literal)
    const start = newState(), accept = newState()
    addEdge(start, accept, literal)
    return { start, accept }
  }

  function parseRepeat(): Fragment {
    let fragment = parseAtom()
    while (!atEnd() && '*+?'.includes(peek())) {
      const op = peek()
      pos++
      if (op === '*') {
        const start = newState(), accept = newState()
        addEdge(start, fragment.start, 'ε'); addEdge(start, accept, 'ε')
        addEdge(fragment.accept, fragment.start, 'ε'); addEdge(fragment.accept, accept, 'ε')
        fragment = { start, accept }
      } else if (op === '+') {
        const accept = newState()
        addEdge(fragment.accept, fragment.start, 'ε'); addEdge(fragment.accept, accept, 'ε')
        fragment = { start: fragment.start, accept }
      } else {
        const start = newState(), accept = newState()
        addEdge(start, fragment.start, 'ε'); addEdge(start, accept, 'ε')
        addEdge(fragment.accept, accept, 'ε')
        fragment = { start, accept }
      }
    }
    return fragment
  }

  function parseConcat(): Fragment {
    if (!startsAtom(peek())) {
      const start = newState(), accept = newState()
      addEdge(start, accept, 'ε')
      return { start, accept }
    }
    let fragment = parseRepeat()
    while (startsAtom(peek())) {
      const next = parseRepeat()
      addEdge(fragment.accept, next.start, 'ε')
      fragment = { start: fragment.start, accept: next.accept }
    }
    return fragment
  }

  function parseUnion(): Fragment {
    let fragment = parseConcat()
    while (peek() === '|') {
      pos++
      const next = parseConcat()
      const start = newState(), accept = newState()
      addEdge(start, fragment.start, 'ε'); addEdge(start, next.start, 'ε')
      addEdge(fragment.accept, accept, 'ε'); addEdge(next.accept, accept, 'ε')
      fragment = { start, accept }
    }
    return fragment
  }

  let root: Fragment
  try {
    root = parseUnion()
    if (!atEnd()) throw new RegexError(`Unexpected "${peek()}" at character ${pos + 1}.`)
  } catch (error) {
    if (error instanceof RegexError) return { ok: false, message: error.message }
    throw error
  }

  // Layer states by BFS distance from the start so the drop-in graph reads left to right.
  const outgoing = new Map<string, string[]>()
  for (const transition of transitions) {
    const list = outgoing.get(transition.source) ?? []
    list.push(transition.target)
    outgoing.set(transition.source, list)
  }
  const layer = new Map<string, number>([[root.start, 0]])
  const queue = [root.start]
  while (queue.length) {
    const id = queue.shift()!
    for (const next of outgoing.get(id) ?? []) {
      if (!layer.has(next)) { layer.set(next, layer.get(id)! + 1); queue.push(next) }
    }
  }
  const byLayer = new Map<number, string[]>()
  for (const state of states) {
    const l = layer.get(state.id) ?? 0
    const bucket = byLayer.get(l) ?? []
    bucket.push(state.id)
    byLayer.set(l, bucket)
  }

  const finalStates: AutomatonState[] = states.map((state, index) => {
    const l = layer.get(state.id) ?? 0
    const bucket = byLayer.get(l)!
    const kind = state.id === root.start ? 'start' : state.id === root.accept ? 'accept' : 'state'
    return { ...state, kind, position: layoutPoint(l, bucket.indexOf(state.id), bucket.length), color: SOURCE_COLORS[index % SOURCE_COLORS.length] }
  })

  return { ok: true, graph: { states: finalStates, transitions, symbols: [...symbols].sort((a, b) => a.localeCompare(b)) } }
}
