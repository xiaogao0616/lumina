export type SimulationState = { id: string; label: string; start: boolean; accepting: boolean }
export type SimulationTransition = { source: string; target: string; symbols: string[] }
export type SimulationResult = { status: 'accepted' | 'rejected' | 'error'; message: string }

/** Simulates an ε-NFA without enumerating paths. Input is read as Unicode code points, unchanged. */
export function simulateAutomaton(states: SimulationState[], transitions: SimulationTransition[], input: string): SimulationResult {
  const starts = states.filter(state => state.start)
  if (starts.length !== 1) return { status: 'error', message: starts.length === 0
    ? 'Add one start state before running a test.' : 'Keep exactly one start state before running a test.' }
  const ids = new Set(states.map(state => state.id))
  if (ids.size !== states.length) return { status: 'error', message: 'State IDs must be unique.' }
  const outgoing = new Map<string, SimulationTransition[]>()
  for (const transition of transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) return { status: 'error', message: 'A transition refers to a missing state.' }
    if (transition.symbols.some(symbol => Array.from(symbol).length !== 1)) return { status: 'error', message: 'Each transition input must be a single character or ε.' }
    const list = outgoing.get(transition.source) ?? []
    list.push(transition)
    outgoing.set(transition.source, list)
  }
  const closure = (seeds: Set<string>) => {
    const reached = new Set(seeds)
    const pending = [...seeds]
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
  let current = closure(new Set([starts[0].id]))
  let consumed = 0
  for (const character of input) {
    const next = new Set<string>()
    for (const source of current) {
      for (const edge of outgoing.get(source) ?? []) {
        // ε is an empty move, never a literal input character.
        if (character !== 'ε' && edge.symbols.includes(character)) next.add(edge.target)
      }
    }
    consumed++
    current = closure(next)
    if (!current.size) return { status: 'rejected', message: `No path can read character ${consumed} (${JSON.stringify(character)}).` }
  }
  const accepting = states.filter(state => state.accepting && current.has(state.id))
  return accepting.length
    ? { status: 'accepted', message: `${consumed === 0 ? 'The empty string' : `All ${consumed} characters`} can reach accepting state ${accepting.map(state => state.label).join(', ')}.` }
    : { status: 'rejected', message: rejectedAt(states.filter(state => current.has(state.id))) }
}

/** Says where a rejected run stopped, so "rejected" points at a state rather than at the whole graph. */
function rejectedAt(stopped: SimulationState[]): string {
  const names = stopped.map(state => state.label)
  if (names.length === 1) return `The entire input was read. The run ended in ${names[0]}, which is not an accepting state.`
  const list = names.length > 6 ? `${names.slice(0, 6).join(', ')}, …` : names.join(', ')
  return `The entire input was read. Every run ended in a non-accepting state (${list}).`
}
