import { isAcceptingState, type AutomatonGraph } from './automaton-graph'

/** A string of length 3-10 drawn uniformly from the given alphabet. '' if the alphabet is empty. */
export function randomTestString(alphabet: string[]): string {
  if (alphabet.length === 0) return ''
  const length = 3 + Math.floor(Math.random() * 8) // 3..10 inclusive
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Shortest-first BFS over a COMPLETE deterministic transition table (as produced by
 * completeWithSink or nfaToDfa) collecting up to `count` distinct accepted strings.
 * Each state contributes at most one path per BFS length, so the frontier never exceeds
 * the state count — but a state can be revisited at a later length, which is what lets a
 * loop keep producing longer accepted strings when short ones run out. The alphabet and the
 * frontier are shuffled, so calling this again on the same graph tends to surface a different
 * batch when the language has more accepted strings at a given length than `count` needs.
 */
export function findAcceptedStrings(deterministic: AutomatonGraph, count: number, maxLength = 20): string[] {
  const start = deterministic.states.find(state => state.kind === 'start')
  if (!start) return []
  const delta = new Map<string, Map<string, string>>()
  for (const state of deterministic.states) delta.set(state.id, new Map())
  for (const transition of deterministic.transitions) {
    for (const symbol of transition.symbols) delta.get(transition.source)!.set(symbol, transition.target)
  }
  const acceptingOf = new Map(deterministic.states.map(state => [state.id, isAcceptingState(state)]))
  const alphabet = shuffled(deterministic.symbols)

  const results: string[] = []
  if (acceptingOf.get(start.id)) results.push('')
  let frontier = [{ id: start.id, str: '' }]
  for (let length = 1; results.length < count && length <= maxLength && frontier.length; length++) {
    const next: typeof frontier = []
    const seen = new Set<string>()
    for (const node of shuffled(frontier)) {
      for (const symbol of alphabet) {
        const target = delta.get(node.id)?.get(symbol)
        if (!target) continue
        const str = node.str + symbol
        if (acceptingOf.get(target) && results.length < count) results.push(str)
        if (!seen.has(target)) { seen.add(target); next.push({ id: target, str }) }
      }
      if (results.length >= count) break
    }
    frontier = next
  }
  return results
}
