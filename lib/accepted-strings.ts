import { isAcceptingState, type AutomatonGraph } from './automaton-graph'

/** A string of length 3-10 drawn uniformly from the given alphabet. '' if the alphabet is empty. */
export function randomTestString(alphabet: string[]): string {
  if (alphabet.length === 0) return ''
  const length = 3 + Math.floor(Math.random() * 8) // 3..10 inclusive
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

/**
 * Every accepted string up to `maxLength`, in shortlex order (shorter first, then by the order the
 * alphabet is declared in), stopping after `count`. Works on a deterministic transition table such
 * as completeWithSink or nfaToDfa produce; a missing transition just rejects.
 *
 * A table of "can this state still accept in exactly r more characters" prunes the search, so every
 * branch it follows ends in an accepted string and the cost grows with the strings returned, not
 * with the (exponential) number of strings of each length.
 */
export function findAcceptedStrings(deterministic: AutomatonGraph, count: number, maxLength = 20): string[] {
  const start = deterministic.states.find(state => state.kind === 'start')
  if (!start || count <= 0) return []
  const delta = new Map<string, Map<string, string>>()
  for (const state of deterministic.states) delta.set(state.id, new Map())
  for (const transition of deterministic.transitions) {
    for (const symbol of transition.symbols) delta.get(transition.source)?.set(symbol, transition.target)
  }
  const alphabet = deterministic.symbols
  // canAccept[r] = states that accept some string of exactly r more characters.
  const canAccept: Set<string>[] = [new Set(deterministic.states.filter(isAcceptingState).map(state => state.id))]
  for (let r = 1; r <= maxLength; r++) {
    canAccept.push(new Set(deterministic.states.filter(state =>
      alphabet.some(symbol => { const target = delta.get(state.id)?.get(symbol); return !!target && canAccept[r - 1].has(target) })).map(state => state.id)))
  }

  const results: string[] = []
  const walk = (stateId: string, prefix: string, remaining: number) => {
    if (results.length >= count) return
    if (remaining === 0) { results.push(prefix); return }
    for (const symbol of alphabet) {
      const target = delta.get(stateId)?.get(symbol)
      if (target && canAccept[remaining - 1].has(target)) walk(target, prefix + symbol, remaining - 1)
      if (results.length >= count) return
    }
  }
  for (let length = 0; length <= maxLength && results.length < count; length++) {
    if (canAccept[length].has(start.id)) walk(start.id, '', length)
  }
  return results
}

/** How many examples each Generate click asks for up front; later clicks page through them. */
export const EXAMPLE_POOL_SIZE = 100

/**
 * The `page`-th batch of `size` examples from a pool, wrapping back to the start once the pool runs
 * out, so repeated clicks keep showing different strings and then cycle. `indices` are 0-based
 * positions in the pool, for a caption like "#6–10 of 37".
 */
export function examplePage(pool: string[], page: number, size = 5): { strings: string[]; indices: number[] } {
  if (pool.length <= size) return { strings: [...pool], indices: pool.map((_, index) => index) }
  const first = (page * size) % pool.length
  const indices = Array.from({ length: size }, (_, offset) => (first + offset) % pool.length)
  return { strings: indices.map(index => pool[index]), indices }
}

/** "#6–10", or "#36–37 and #1–3" when the batch wraps round. Indices are 0-based. */
export function describeExampleRange(indices: number[]): string {
  const runs: [number, number][] = []
  for (const index of indices) {
    const last = runs[runs.length - 1]
    if (last && index === last[1] + 1) last[1] = index
    else runs.push([index, index])
  }
  return runs.map(([from, to]) => from === to ? `#${from + 1}` : `#${from + 1}–${to + 1}`).join(' and ')
}
