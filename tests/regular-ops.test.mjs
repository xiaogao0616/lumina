import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { compareAutomata, combineAutomata, complementAutomaton, automatonToRegex } = loadTs('regular-ops.ts')
const { regexToNfa } = loadTs('regex-to-nfa.ts')
const { simulateAutomaton } = loadTs('automata-simulator.ts')
const { isDfaShaped, missingDfaTransitions } = loadTs('automata-dfa.ts')
const { nfaToDfa } = loadTs('nfa-to-dfa.ts')
const { minimizeDfa } = loadTs('dfa-minimize.ts')

const state = (id, kind = 'state', extra = {}) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra })
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })
const nfa = pattern => { const result = regexToNfa(pattern); assert.equal(result.ok, true, pattern); return result.graph }
const withAlphabet = (graph, symbols) => ({ ...graph, symbols })

function accepts(graph, input) {
  return simulateAutomaton(
    graph.states.map(item => ({ id: item.id, label: item.label, start: item.kind === 'start', accepting: item.kind === 'accept' || !!item.accepting })),
    graph.transitions.map(item => ({ source: item.source, target: item.target, symbols: item.symbols })),
    input,
  ).status === 'accepted'
}

function* words(alphabet, maxLength) {
  yield ''
  let layer = ['']
  for (let length = 1; length <= maxLength; length++) {
    layer = layer.flatMap(prefix => alphabet.map(symbol => prefix + symbol))
    yield* layer
  }
}

// Even number of a's, as a hand-drawn DFA.
const evenA = {
  states: [state('e', 'start', { accepting: true }), state('o')],
  transitions: [edge('1', 'e', 'o', 'a'), edge('2', 'o', 'e', 'a'), edge('3', 'e', 'e', 'b'), edge('4', 'o', 'o', 'b')],
  symbols: ['a', 'b'],
}

test('equivalent machines compare equal', () => {
  const result = compareAutomata(evenA, withAlphabet(nfa('b*(ab*ab*)*'), ['a', 'b']))
  assert.equal(result.ok, true)
  assert.deepEqual(result.comparison, { equivalent: true, onlyFirst: null, onlySecond: null })
})

test('a difference comes with the shortest string on each side', () => {
  const result = compareAutomata(nfa('(a|b)*ab'), nfa('(a|b)*b'))
  assert.equal(result.ok, true)
  assert.equal(result.comparison.equivalent, false)
  assert.equal(result.comparison.onlyFirst, null) // every string ending in ab also ends in b
  assert.equal(result.comparison.onlySecond, 'b')
})

test('characters only one machine knows still count', () => {
  const result = compareAutomata(nfa('a*'), nfa('(a|c)*'))
  assert.equal(result.comparison.onlySecond, 'c')
})

test('the empty string can be the witness', () => {
  const result = compareAutomata(nfa('a*'), nfa('a+'))
  assert.equal(result.comparison.onlyFirst, '')
})

test('product construction matches the set operation on every short string', () => {
  const a = nfa('(a|b)*a(a|b)*') // contains an a
  const b = withAlphabet(nfa('(a|b)(a|b)'), ['a', 'b']) // length 2
  for (const operation of ['union', 'intersection', 'difference']) {
    const result = combineAutomata(a, b, operation)
    assert.equal(result.ok, true)
    assert.equal(isDfaShaped(result.graph), true)
    for (const word of words(['a', 'b'], 5)) {
      const expected = operation === 'union' ? accepts(a, word) || accepts(b, word)
        : operation === 'intersection' ? accepts(a, word) && accepts(b, word) : accepts(a, word) && !accepts(b, word)
      assert.equal(accepts(result.graph, word), expected, `${operation} on "${word}"`)
    }
  }
})

test('the product is minimized', () => {
  const result = combineAutomata(evenA, evenA, 'intersection')
  assert.equal(result.graph.states.length, 2)
})

test('complement flips every answer and keeps hand-written names', () => {
  const dfa = {
    states: [state('s', 'start', { label: 'start₀' }), state('t', 'accept', { label: 'accept₀' }), state('u', 'state', { label: 'mine' })],
    transitions: [edge('1', 's', 't', 'a'), edge('2', 't', 'u', 'a')],
    symbols: ['a', 'b'],
  }
  const result = complementAutomaton(dfa)
  assert.equal(result.ok, true)
  assert.equal(missingDfaTransitions(result.graph).length, 0)
  for (const word of words(['a', 'b'], 4)) assert.equal(accepts(result.graph, word), !accepts(dfa, word), word)
  assert.ok(result.graph.states.some(item => item.label === 'mine'))
  assert.ok(!result.graph.states.some(item => item.label === 'accept₀' && item.kind !== 'accept'))
})

test('complement of an NFA determinizes first', () => {
  const machine = nfa('(a|b)*ab')
  const result = complementAutomaton(machine)
  assert.equal(isDfaShaped(result.graph), true)
  for (const word of words(['a', 'b'], 5)) assert.equal(accepts(result.graph, word), !accepts(machine, word), word)
})

test('state elimination round-trips through Regex → NFA', () => {
  for (const pattern of ['(a|b)*abb', 'a(b|c)*d', 'b*(ab*ab*)*', '(ab|aba)*', '(0|1(01*0)*1)*', 'a?b+', '(a|b)*a(a|b)(a|b)', '']) {
    const machine = nfa(pattern)
    for (const shape of [machine, minimizeDfa(nfaToDfa(machine).graph).graph]) {
      const result = automatonToRegex(shape)
      assert.equal(result.ok, true)
      assert.equal(result.empty, false)
      const back = regexToNfa(result.pattern)
      assert.equal(back.ok, true, `${pattern} → ${result.pattern}`)
      const comparison = compareAutomata(machine, withAlphabet(back.graph, machine.symbols)).comparison
      assert.equal(comparison.equivalent, true, `${pattern} → ${result.pattern}`)
    }
  }
})

test('state elimination gives a short answer for a small DFA', () => {
  const result = automatonToRegex(evenA)
  assert.equal(result.ok, true)
  assert.ok(result.display.length <= 16, result.display)
  assert.equal(compareAutomata(evenA, withAlphabet(regexToNfa(result.pattern).graph, ['a', 'b'])).comparison.equivalent, true)
})

test('an automaton with no reachable accepting state has the empty language', () => {
  const dead = { states: [state('s', 'start'), state('f', 'accept')], transitions: [edge('1', 'f', 'f', 'a')], symbols: ['a'] }
  assert.deepEqual(automatonToRegex(dead), { ok: true, empty: true })
})

test('only ε shows as ε and is blank in the pattern', () => {
  const result = automatonToRegex({ states: [state('s', 'start', { accepting: true })], transitions: [], symbols: ['a'] })
  assert.equal(result.display, 'ε')
  assert.equal(result.pattern, '')
})

test('operator characters are escaped', () => {
  const machine = nfa('\\(\\*')
  const result = automatonToRegex(machine)
  assert.equal(result.pattern, '\\(\\*')
})
