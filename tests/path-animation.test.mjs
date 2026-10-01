import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { findAnimatedPaths } = loadTs('path-animation.ts')

const st = (id, accepting = false) => ({ id, accepting })
const ed = (id, source, target, ...symbols) => ({ id, source, target, symbols })

test('DFA: exactly one attempt, one frame per character plus the start', () => {
  // "ends with a" over {a,b}.
  const states = [st('A'), st('B', true), st('C')]
  const edges = [
    ed('e1', 'A', 'B', 'a'), ed('e2', 'A', 'C', 'b'),
    ed('e3', 'B', 'B', 'a'), ed('e4', 'B', 'C', 'b'),
    ed('e5', 'C', 'B', 'a'), ed('e6', 'C', 'C', 'b'),
  ]
  const { attempts, truncated } = findAnimatedPaths(states, edges, 'A', 'aba')
  assert.equal(truncated, false)
  assert.equal(attempts.length, 1)
  const [attempt] = attempts
  assert.equal(attempt.accepted, true) // "aba" ends in 'a'
  assert.deepEqual(attempt.frames.map(f => f.stateId), ['A', 'B', 'C', 'B'])
  assert.deepEqual(attempt.frames.map(f => f.edgeId), [null, 'e1', 'e4', 'e5'])
})

test('DFA: a missing transition ends the single attempt early as a rejected dead end', () => {
  const states = [st('A'), st('B', true)]
  const edges = [ed('e1', 'A', 'B', 'a')] // no edge for 'b' anywhere
  const { attempts } = findAnimatedPaths(states, edges, 'A', 'ab')
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].accepted, false)
  // Stops right after 'a' (2 frames: start + the 'a' move); never reaches a frame for 'b'.
  assert.deepEqual(attempts[0].frames.map(f => f.stateId), ['A', 'B'])
})

test('NFA: branches are tried one at a time and the search stops at the first accepting one', () => {
  // From S, 'a' branches to P (dead end on the rest of the input) and to Q (which accepts "a").
  const states = [st('S'), st('P'), st('Q', true)]
  const edges = [ed('e1', 'S', 'P', 'a'), ed('e2', 'S', 'Q', 'a')]
  const { attempts } = findAnimatedPaths(states, edges, 'S', 'a')
  assert.ok(attempts.length <= 2)
  assert.ok(attempts.some(a => a.accepted))
  // Once an accepting attempt is recorded, the search stops — it's the last attempt pushed.
  assert.equal(attempts[attempts.length - 1].accepted, true)
})

test('NFA: an ε-cycle does not hang and is still explored correctly', () => {
  const states = [st('S'), st('T', true)]
  const edges = [ed('e1', 'S', 'T', 'ε'), ed('e2', 'T', 'S', 'ε')]
  const { attempts } = findAnimatedPaths(states, edges, 'S', '')
  assert.ok(attempts.some(a => a.accepted))
})

test('exhausting every branch without acceptance reports rejected attempts, not truncation', () => {
  const states = [st('S'), st('dead')]
  const edges = [ed('e1', 'S', 'dead', 'a'), ed('e2', 'dead', 'dead', 'a')]
  const { attempts, truncated } = findAnimatedPaths(states, edges, 'S', 'aa')
  assert.equal(truncated, false)
  assert.ok(attempts.every(a => !a.accepted))
})

test('maxAttempts caps a pathological branching factor and reports truncated', () => {
  // S branches to many dead-end states on 'a', none of which accept or continue.
  const states = [st('S'), ...Array.from({ length: 20 }, (_, i) => st(`d${i}`))]
  const edges = Array.from({ length: 20 }, (_, i) => ed(`e${i}`, 'S', `d${i}`, 'a'))
  const { attempts, truncated } = findAnimatedPaths(states, edges, 'S', 'aa', 5)
  assert.equal(attempts.length <= 5, true)
  assert.equal(truncated, true)
})
