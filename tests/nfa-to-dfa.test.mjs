import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { nfaToDfa, copyAsNfa } = loadTs('nfa-to-dfa.ts')
const { isDfaShaped, missingDfaTransitions } = loadTs('automata-dfa.ts')
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

test('subset construction adds a complete sink when a symbol has no move', () => {
  const nfa = {
    states: [state('s', 'start'), state('f', 'accept')],
    transitions: [edge('e', 's', 'f', 'a')],
    symbols: ['a', 'b'],
  }
  const result = nfaToDfa(nfa)
  assert.equal(result.ok, true)
  assert.equal(isDfaShaped(result.graph), true)
  assert.equal(missingDfaTransitions(result.graph).length, 0)
  assert.ok(result.graph.states.some(item => item.label === '∅'))
  assert.equal(run(nfa, 'a').status, run(result.graph, 'a').status)
  assert.equal(run(nfa, 'b').status, run(result.graph, 'b').status)
  assert.equal(run(nfa, 'ab').status, run(result.graph, 'ab').status)
})

test('epsilon closure becomes an accepting DFA start when ε reaches accept', () => {
  const nfa = {
    states: [state('s', 'start'), state('f', 'accept')],
    transitions: [edge('e', 's', 'f', 'ε')],
    symbols: ['a'],
  }
  const result = nfaToDfa(nfa)
  assert.equal(result.ok, true)
  const start = result.graph.states.find(item => item.kind === 'start')
  assert.equal(start.accepting, true)
  assert.equal(run(result.graph, '').status, 'accepted')
  assert.equal(run(result.graph, 'a').status, 'rejected')
})

test('nondeterministic a-moves collapse into one subset', () => {
  const nfa = {
    states: [state('s', 'start'), state('p'), state('f', 'accept')],
    transitions: [edge('e1', 's', 'p', 'a'), edge('e2', 's', 'f', 'a')],
    symbols: ['a'],
  }
  const result = nfaToDfa(nfa)
  assert.equal(result.ok, true)
  assert.equal(run(nfa, 'a').status, 'accepted')
  assert.equal(run(result.graph, 'a').status, 'accepted')
  const start = result.graph.states.find(item => item.kind === 'start')
  const aEdges = result.graph.transitions.filter(item => item.source === start.id && item.symbols.includes('a'))
  assert.equal(aEdges.length, 1)
  const target = result.graph.states.find(item => item.id === aEdges[0].target)
  assert.equal(target.kind === 'accept' || !!target.accepting, true)
})

test('copyAsNfa is a structural clone and conversion requires one start', () => {
  const graph = {
    states: [state('s', 'start')],
    transitions: [],
    symbols: ['a'],
  }
  const copy = copyAsNfa(graph)
  copy.states[0].label = 'changed'
  assert.equal(graph.states[0].label, 's')
  assert.equal(nfaToDfa({ states: [], transitions: [], symbols: [] }).ok, false)
  assert.equal(nfaToDfa({ states: [state('s', 'start'), state('t', 'start')], transitions: [], symbols: [] }).ok, false)
})
