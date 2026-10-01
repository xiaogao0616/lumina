import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { minimizeDfa } = loadTs('dfa-minimize.ts')
const { simulateAutomaton } = loadTs('automata-simulator.ts')

const state = (id, kind = 'state', extra = {}) => ({
  id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra,
})
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })

function run(graph, input) {
  return simulateAutomaton(
    graph.states.map(item => ({ id: item.id, label: item.label, start: item.kind === 'start', accepting: item.kind === 'accept' || !!item.accepting })),
    graph.transitions.map(item => ({ source: item.source, target: item.target, symbols: item.symbols })),
    input,
  )
}

test('drops an unreachable state without merging distinguishable ones', () => {
  // Accepts a^n for n >= 2; u is isolated and unreachable.
  const dfa = {
    states: [state('s0', 'start'), state('s1'), state('s2', 'accept'), state('u')],
    transitions: [edge('e0', 's0', 's1', 'a'), edge('e1', 's1', 's2', 'a'), edge('e2', 's2', 's2', 'a'), edge('eu', 'u', 'u', 'a')],
    symbols: ['a'],
  }
  const result = minimizeDfa(dfa)
  assert.equal(result.ok, true)
  assert.equal(result.graph.states.length, 3)
  for (const input of ['', 'a', 'aa', 'aaa', 'aaaa']) {
    assert.equal(run(dfa, input).status, run(result.graph, input).status, input)
  }
  // Fresh q/start/accept labels, never the merged-subset "{...}" notation.
  assert.ok(result.graph.states.every(s => !s.label.includes('{')))
})

test('merges transition-equivalent states ("ends with a" over {a,b})', () => {
  const dfa = {
    states: [state('A', 'start'), state('B', 'accept'), state('C')],
    transitions: [
      edge('e1', 'A', 'B', 'a'), edge('e2', 'A', 'C', 'b'),
      edge('e3', 'B', 'B', 'a'), edge('e4', 'B', 'C', 'b'),
      edge('e5', 'C', 'B', 'a'), edge('e6', 'C', 'C', 'b'),
    ],
    symbols: ['a', 'b'],
  }
  const result = minimizeDfa(dfa)
  assert.equal(result.ok, true)
  assert.equal(result.graph.states.length, 2)
  for (const input of ['', 'a', 'b', 'ab', 'ba', 'aab', 'bba', 'abba', 'baab']) {
    assert.equal(run(dfa, input).status, run(result.graph, input).status, input)
  }
  // Minimizing an already-minimal DFA is a no-op on state count.
  const again = minimizeDfa(result.graph)
  assert.equal(again.ok, true)
  assert.equal(again.graph.states.length, 2)
})

test('keeps a custom label when its state survives without merging, but not for a merged group', () => {
  // D1 and D2 are both non-accepting traps (loop on every symbol) — they're transition-equivalent
  // and merge. S and M each stay their own group, so their custom labels should survive untouched.
  const dfa = {
    states: [
      state('S', 'start', { label: 'Left' }), state('M', 'accept', { label: 'Mid' }),
      state('D1', 'state', { label: 'Right1' }), state('D2', 'state', { label: 'Right2' }),
    ],
    transitions: [
      edge('e1', 'S', 'M', 'a'), edge('e2', 'S', 'D1', 'b'),
      edge('e3', 'M', 'D2', 'a'), edge('e4', 'M', 'D2', 'b'),
      edge('e5', 'D1', 'D1', 'a'), edge('e6', 'D1', 'D1', 'b'),
      edge('e7', 'D2', 'D2', 'a'), edge('e8', 'D2', 'D2', 'b'),
    ],
    symbols: ['a', 'b'],
  }
  const result = minimizeDfa(dfa)
  assert.equal(result.graph.states.length, 3)
  const labels = result.graph.states.map(s => s.label)
  assert.ok(labels.includes('Left'))
  assert.ok(labels.includes('Mid'))
  assert.ok(!labels.includes('Right1') && !labels.includes('Right2'))
})

test('rejects graphs that are not DFA-shaped or lack exactly one start state', () => {
  const branching = {
    states: [state('s', 'start'), state('p'), state('q')],
    transitions: [edge('e1', 's', 'p', 'a'), edge('e2', 's', 'q', 'a')],
    symbols: ['a'],
  }
  assert.equal(minimizeDfa(branching).ok, false)
  assert.match(minimizeDfa(branching).message, /DFA-shaped/)

  const epsilon = {
    states: [state('s', 'start')],
    transitions: [edge('e', 's', 's', 'ε')],
    symbols: ['a'],
  }
  assert.equal(minimizeDfa(epsilon).ok, false)

  assert.equal(minimizeDfa({ states: [], transitions: [], symbols: [] }).ok, false)
  assert.equal(minimizeDfa({ states: [state('s', 'start'), state('t', 'start')], transitions: [], symbols: [] }).ok, false)
})
