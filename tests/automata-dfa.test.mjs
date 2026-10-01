import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { completeWithSink, dfaAssignError, isDfaShaped, missingDfaTransitions, symbolConflicts } = loadTs('automata-dfa.ts')

const state = (id, kind = 'state', extra = {}) => ({
  id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra,
})
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })

test('partial DFA is shaped when it has no epsilon and no branching', () => {
  const graph = {
    states: [state('s', 'start'), state('f', 'accept')],
    transitions: [edge('e', 's', 'f', 'a')],
    symbols: ['a', 'b'],
  }
  assert.equal(isDfaShaped(graph), true)
  assert.deepEqual(missingDfaTransitions(graph).map(item => [item.source, item.symbol]), [['s', 'b'], ['f', 'a'], ['f', 'b']])
})

test('epsilon or two targets for the same symbol are not DFA-shaped', () => {
  const branching = {
    states: [state('s', 'start'), state('p'), state('q')],
    transitions: [edge('e1', 's', 'p', 'a'), edge('e2', 's', 'q', 'a')],
    symbols: ['a'],
  }
  assert.equal(isDfaShaped(branching), false)
  assert.equal(symbolConflicts(branching)[0].targets.length, 2)
  const epsilon = {
    states: [state('s', 'start')],
    transitions: [edge('e', 's', 's', 'ε')],
    symbols: ['a'],
  }
  assert.equal(isDfaShaped(epsilon), false)
})

test('assigning a taken DFA symbol is rejected; deselecting it is allowed', () => {
  const graph = {
    states: [state('s', 'start'), state('p'), state('q')],
    transitions: [edge('e1', 's', 'p', 'a'), edge('e2', 's', 'q')],
    symbols: ['a'],
  }
  assert.match(dfaAssignError(graph, 'e2', 'a'), /already leaves/)
  assert.equal(dfaAssignError(graph, 'e1', 'a'), null)
  assert.match(dfaAssignError(graph, 'e1', 'ε'), /cannot use ε/)
})

test('completeWithSink fills every missing symbol, including sink self-loops', () => {
  const graph = {
    states: [state('s', 'start', { position: { x: 10, y: 20 } }), state('f', 'accept', { position: { x: 200, y: 20 } })],
    transitions: [edge('e', 's', 'f', 'a')],
    symbols: ['a', 'b'],
  }
  const completed = completeWithSink(graph)
  assert.equal(missingDfaTransitions(completed).length, 0)
  const sink = completed.states.find(item => item.label === '∅')
  assert.ok(sink)
  assert.equal(sink.kind, 'state')
  const symbolsFrom = (source, target) => completed.transitions.find(item => item.source === source && item.target === target)?.symbols.sort()
  assert.deepEqual(symbolsFrom('s', 'f'), ['a'])
  assert.deepEqual(symbolsFrom('s', sink.id), ['b'])
  assert.deepEqual(symbolsFrom('f', sink.id), ['a', 'b'])
  assert.deepEqual(symbolsFrom(sink.id, sink.id), ['a', 'b'])
  assert.equal(completeWithSink(completed).states.length, completed.states.length)
})
