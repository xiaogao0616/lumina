import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { regexToNfa } = loadTs('regex-to-nfa.ts')
const { simulateAutomaton } = loadTs('automata-simulator.ts')

function accepts(graph, input) {
  const status = simulateAutomaton(
    graph.states.map(item => ({ id: item.id, label: item.label, start: item.kind === 'start', accepting: item.kind === 'accept' || !!item.accepting })),
    graph.transitions.map(item => ({ source: item.source, target: item.target, symbols: item.symbols })),
    input,
  ).status
  return status === 'accepted'
}

function check(pattern, accepted, rejected) {
  const result = regexToNfa(pattern)
  assert.equal(result.ok, true, `expected "${pattern}" to parse`)
  for (const input of accepted) assert.equal(accepts(result.graph, input), true, `"${pattern}" should accept "${input}"`)
  for (const input of rejected) assert.equal(accepts(result.graph, input), false, `"${pattern}" should reject "${input}"`)
  // Start/accept kinds and single start are always present on a successful build.
  assert.equal(result.graph.states.filter(s => s.kind === 'start').length, 1)
  assert.ok(result.graph.states.some(s => s.kind === 'accept'))
  return result
}

test('literal concatenation matches exactly one string', () => check('ab', ['ab'], ['', 'a', 'b', 'abb', 'ba']))

test('union matches either branch only', () => check('a|b', ['a', 'b'], ['', 'ab', 'c']))

test('star matches zero or more repeats', () => check('a*', ['', 'a', 'aa', 'aaaa'], ['b', 'ab']))

test('plus requires at least one repeat', () => check('a+', ['a', 'aa'], ['', 'b']))

test('optional matches zero or one', () => check('ab?', ['a', 'ab'], ['abb', 'b']))

test('grouping and star combine', () => check('(ab)*', ['', 'ab', 'abab'], ['a', 'aba']))

test('union, group, star and concatenation compose', () => check('a(b|c)*d', ['ad', 'abd', 'acd', 'abcbcd'], ['a', 'abc', 'ade']))

test('backslash escapes an operator into a literal', () => check('a\\*b', ['a*b'], ['aaab', 'ab']))

test('empty pattern matches only the empty string', () => check('', [''], ['a']))

test('surrounding whitespace is trimmed, interior whitespace is rejected', () => {
  check('  a|b  ', ['a', 'b'], [''])
  assert.equal(regexToNfa('a b').ok, false)
})

test('syntax errors are reported instead of throwing', () => {
  for (const pattern of ['(ab', 'ab)', '*ab', '+ab', '?', 'a\\']) {
    const result = regexToNfa(pattern)
    assert.equal(result.ok, false, `expected "${pattern}" to fail`)
    assert.equal(typeof result.message, 'string')
  }
})

test('ε is rejected as a literal, escaped or not', () => {
  assert.equal(regexToNfa('aεb').ok, false)
  assert.equal(regexToNfa('a\\εb').ok, false)
})
