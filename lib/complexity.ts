import { BLANK, runTm } from './turing'

/**
 * Pieces for the time-complexity lessons (Sipser chapter 7).
 *
 * ZIGZAG is Sipser's single-tape machine M1 for { 0ᵏ1ᵏ }, in the zig-zag form: cross off the
 * leftmost 0 with x, walk right to the first 1 and cross it off with y, walk back to the x, repeat.
 * Each round trip is about n moves and there are n/2 of them, so it takes O(n²) moves.
 */
export const ZIGZAG_STATES = [
  { id: 'q0', label: 'q0', start: true, accepting: false },
  { id: 'q1', label: 'q1', start: false, accepting: false },
  { id: 'q2', label: 'q2', start: false, accepting: false },
  { id: 'q3', label: 'q3', start: false, accepting: false },
  { id: 'qa', label: 'q_accept', start: false, accepting: true },
]
const RULES: [string, string, string][] = [
  ['q0', 'q1', '0→x,R'], ['q0', 'q3', 'y→y,R'], ['q0', 'qa', `${BLANK}→${BLANK},R`],
  ['q1', 'q1', '0→0,R'], ['q1', 'q1', 'y→y,R'], ['q1', 'q2', '1→y,L'],
  ['q2', 'q2', '0→0,L'], ['q2', 'q2', 'y→y,L'], ['q2', 'q0', 'x→x,R'],
  ['q3', 'q3', 'y→y,R'], ['q3', 'qa', `${BLANK}→${BLANK},R`],
]
export const ZIGZAG_RULES = RULES.map(([source, target, rule], at) => ({ id: `z${at}`, source, target, symbols: [rule] }))
/** The rules as table rows: state, read, write, move, next state. */
export const ZIGZAG_ROWS = RULES.map(([source, target, rule]) => {
  const [read, rest] = rule.split('→')
  const [write, move] = rest.split(',')
  return [source, read, write, move, target === 'qa' ? 'q_accept' : target]
})

/** Runs the zig-zag machine on 0ᵏ1ᵏ (n = 2k) and returns whether it accepted and how many moves it took. */
export function zigzagMoves(n: number): { accepted: boolean; moves: number } {
  const k = Math.floor(n / 2)
  const result = runTm(ZIGZAG_STATES, ZIGZAG_RULES, '0'.repeat(k) + '1'.repeat(n - k), { recordSteps: 0, maxSteps: 200000 })
  return { accepted: result.status === 'accepted', moves: result.moves }
}

/** The pairs the Euclidean algorithm visits: (x, y), (y, x mod y), … down to (g, 0). */
export function euclidPairs(x: number, y: number): [number, number][] {
  const pairs: [number, number][] = [[x, y]]
  while (y !== 0) {
    ;[x, y] = [y, x % y]
    pairs.push([x, y])
  }
  return pairs
}
