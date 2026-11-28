import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { ZIGZAG_STATES, ZIGZAG_RULES, ZIGZAG_ROWS, zigzagMoves, euclidPairs } = loadTs('complexity.ts')
const { runTm } = loadTs('turing.ts')

test('the zig-zag machine decides 0^k 1^k', () => {
  for (const word of ['', '01', '0011', '000111']) assert.equal(runTm(ZIGZAG_STATES, ZIGZAG_RULES, word).status, 'accepted', word)
  for (const word of ['0', '1', '10', '001', '011', '0101', '0110']) assert.equal(runTm(ZIGZAG_STATES, ZIGZAG_RULES, word).status, 'rejected', word)
  assert.equal(ZIGZAG_ROWS.length, ZIGZAG_RULES.length)
})

test('its running time grows like n squared', () => {
  const times = [4, 8, 16, 32].map(n => zigzagMoves(n))
  assert.ok(times.every(time => time.accepted))
  for (let at = 1; at < times.length; at++) {
    const ratio = times[at].moves / times[at - 1].moves
    assert.ok(ratio > 3 && ratio < 4.5, `ratio ${ratio}`)
  }
})

test('euclidPairs walks down to the gcd', () => {
  assert.deepEqual(euclidPairs(91, 35), [[91, 35], [35, 21], [21, 14], [14, 7], [7, 0]])
  assert.deepEqual(euclidPairs(35, 12).at(-1), [1, 0])
})
