import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { randomTestString, findAcceptedStrings, examplePage, describeExampleRange } = loadTs('accepted-strings.ts')
const { simulateAutomaton } = loadTs('automata-simulator.ts')

const state = (id, kind = 'state', extra = {}) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra })
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })

function run(graph, input) {
  return simulateAutomaton(
    graph.states.map(item => ({ id: item.id, label: item.label, start: item.kind === 'start', accepting: item.kind === 'accept' || !!item.accepting })),
    graph.transitions.map(item => ({ source: item.source, target: item.target, symbols: item.symbols })),
    input,
  )
}

test('randomTestString stays within length 3-10 and only uses the given alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const s = randomTestString(['a', 'b'])
    const len = Array.from(s).length
    assert.ok(len >= 3 && len <= 10, s)
    assert.ok([...s].every(ch => ch === 'a' || ch === 'b'))
  }
  assert.equal(randomTestString([]), '')
})

test('findAcceptedStrings returns distinct strings the automaton actually accepts', () => {
  // "ends with a" over {a,b}, complete DFA.
  const dfa = {
    states: [state('A', 'start'), state('B', 'accept'), state('C')],
    transitions: [
      edge('e1', 'A', 'B', 'a'), edge('e2', 'A', 'C', 'b'),
      edge('e3', 'B', 'B', 'a'), edge('e4', 'B', 'C', 'b'),
      edge('e5', 'C', 'B', 'a'), edge('e6', 'C', 'C', 'b'),
    ],
    symbols: ['a', 'b'],
  }
  const found = findAcceptedStrings(dfa, 5)
  assert.equal(found.length, 5)
  assert.equal(new Set(found).size, 5)
  for (const s of found) assert.equal(run(dfa, s).status, 'accepted', s)
})

test('a loop keeps supplying longer accepted strings once short ones run out', () => {
  // Single state, start + accept, loops on 'a' — accepts a* (infinite language from one state).
  const dfa = { states: [state('q', 'start', { accepting: true })], transitions: [edge('e', 'q', 'q', 'a')], symbols: ['a'] }
  const found = findAcceptedStrings(dfa, 5)
  assert.deepEqual(found, ['', 'a', 'aa', 'aaa', 'aaaa'])
})

test('returns fewer than count when the language has no more accepted strings within maxLength', () => {
  const dfa = { states: [state('q', 'start', { accepting: true }), state('dead')], transitions: [edge('e', 'q', 'dead', 'a'), edge('e2', 'dead', 'dead', 'a')], symbols: ['a'] }
  const found = findAcceptedStrings(dfa, 5)
  assert.deepEqual(found, [''])
})

test('lists every accepted string in shortlex order, so later batches never repeat earlier ones', () => {
  // "ends with a" over {a,b}: lengths 1, 2, 3 have 1, 2, 4 accepted strings.
  const dfa = {
    states: [state('A', 'start'), state('B', 'accept'), state('C')],
    transitions: [edge('e1', 'A', 'B', 'a'), edge('e2', 'A', 'C', 'b'), edge('e3', 'B', 'B', 'a'), edge('e4', 'B', 'C', 'b'), edge('e5', 'C', 'B', 'a'), edge('e6', 'C', 'C', 'b')],
    symbols: ['a', 'b'],
  }
  assert.deepEqual(findAcceptedStrings(dfa, 7), ['a', 'aa', 'ba', 'aaa', 'aba', 'baa', 'bba'])
  const many = findAcceptedStrings(dfa, 100)
  assert.equal(new Set(many).size, 100)
  for (const s of many) assert.equal(run(dfa, s).status, 'accepted', s)
})

test('a finite language is listed completely and stops there', () => {
  const dfa = { states: [state('s', 'start'), state('f', 'accept')], transitions: [edge('e', 's', 'f', 'a', 'b', 'c')], symbols: ['a', 'b', 'c'] }
  assert.deepEqual(findAcceptedStrings(dfa, 100), ['a', 'b', 'c'])
})

test('pages step through the pool five at a time and wrap round to the start', () => {
  const pool = Array.from({ length: 12 }, (_, i) => `s${i}`)
  assert.deepEqual(examplePage(pool, 0).strings, ['s0', 's1', 's2', 's3', 's4'])
  assert.deepEqual(examplePage(pool, 1).strings, ['s5', 's6', 's7', 's8', 's9'])
  assert.deepEqual(examplePage(pool, 2).strings, ['s10', 's11', 's0', 's1', 's2'])
  assert.equal(describeExampleRange(examplePage(pool, 2).indices), '#11–12 and #1–3')
  assert.equal(describeExampleRange(examplePage(pool, 1).indices), '#6–10')
  assert.deepEqual(examplePage(['x', 'y'], 3).strings, ['x', 'y'])
})
