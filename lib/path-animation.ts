/**
 * Enumerates the state-by-state walk(s) a string takes through an automaton, for animating the
 * canvas rather than just reporting accept/reject. A DFA has exactly one walk; an NFA can branch,
 * so this tries branches one at a time (depth-first) and stops as soon as one reaches an
 * accepting state with the input exhausted — mirroring "does there exist an accepting path".
 *
 * Each Frame is one animated beat: the edge just taken (null for the starting frame) and the
 * state it lands on. An ε-move is its own Frame (it doesn't consume a character) so an NFA's
 * empty moves are visible too, not silently folded into the next real step.
 */

export type Frame = { edgeId: string | null; stateId: string }
export type PathAttempt = { frames: Frame[]; accepted: boolean }
export type PathSearchResult = { attempts: PathAttempt[]; truncated: boolean }

type SimpleState = { id: string; accepting: boolean }
type SimpleEdge = { id: string; source: string; target: string; symbols: string[] }

export function findAnimatedPaths(
  states: SimpleState[],
  edges: SimpleEdge[],
  startId: string,
  input: string,
  maxAttempts = 40,
): PathSearchResult {
  const acceptingOf = new Map(states.map(state => [state.id, state.accepting]))
  const outgoing = new Map<string, SimpleEdge[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? []
    list.push(edge)
    outgoing.set(edge.source, list)
  }
  const chars = Array.from(input)
  const attempts: PathAttempt[] = []
  let truncated = false
  let found = false

  // `epsVisited` guards against an ε-cycle looping forever; it resets whenever a real character
  // is consumed, since that's a genuinely new position even if it revisits an earlier state.
  function walk(stateId: string, charIndex: number, frames: Frame[], epsVisited: Set<string>) {
    if (found) return
    if (attempts.length >= maxAttempts) { truncated = true; return }

    if (charIndex === chars.length) {
      // Stopping right here is one candidate outcome...
      const accepted = !!acceptingOf.get(stateId)
      attempts.push({ frames, accepted })
      if (accepted) { found = true; return }
      // ...but a free ε-move can still reach an accepting state before the NFA has to give up.
      for (const edge of outgoing.get(stateId) ?? []) {
        if (found || attempts.length >= maxAttempts) return
        if (edge.symbols.includes('ε') && !epsVisited.has(edge.target)) {
          const nextVisited = new Set(epsVisited)
          nextVisited.add(edge.target)
          walk(edge.target, charIndex, [...frames, { edgeId: edge.id, stateId: edge.target }], nextVisited)
          if (found) return
        }
      }
      return
    }

    const char = chars[charIndex]
    let hadMove = false
    for (const edge of outgoing.get(stateId) ?? []) {
      if (edge.symbols.includes(char)) {
        hadMove = true
        walk(edge.target, charIndex + 1, [...frames, { edgeId: edge.id, stateId: edge.target }], new Set([edge.target]))
        if (found) return
      }
    }
    for (const edge of outgoing.get(stateId) ?? []) {
      if (edge.symbols.includes('ε') && !epsVisited.has(edge.target)) {
        hadMove = true
        const nextVisited = new Set(epsVisited)
        nextVisited.add(edge.target)
        walk(edge.target, charIndex, [...frames, { edgeId: edge.id, stateId: edge.target }], nextVisited)
        if (found) return
      }
    }
    if (!hadMove) attempts.push({ frames, accepted: false })
  }

  walk(startId, 0, [{ edgeId: null, stateId: startId }], new Set([startId]))
  return { attempts, truncated: truncated && !found }
}
