import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { parseGrammar, generateStrings, testMembership, parseTrees } = loadTs('cfg.ts')
const { toChomskyNormalForm, isChomskyNormalForm, formatGrammar, findAmbiguity } = loadTs('cfg-transform.ts')

const grammarOf = text => { const parsed = parseGrammar(text); assert.equal(parsed.ok, true, text); return parsed.grammar }

const examples = [
  'S → aSb | ε',
  'S → SS | (S) | ε',
  'S → aSa | bSb | a | b | ε',
  'E → E+T | T\nT → T*F | F\nF → (E) | x',
  'S → aSbS | bSaS | ε',
  'S → ASA | aB\nA → B | S\nB → b | ε', // Sipser's Example 2.10
]

test('Chomsky normal form keeps the language and has the right shape', () => {
  for (const text of examples) {
    const grammar = grammarOf(text)
    const result = toChomskyNormalForm(grammar)
    assert.equal(result.ok, true, text)
    assert.equal(isChomskyNormalForm(result.grammar), true, `${text}\n→\n${result.text}`)
    // The text is what a new CFG tab gets, so it has to parse back to the same grammar.
    const reparsed = grammarOf(result.text)
    assert.equal(reparsed.start, result.grammar.start)
    assert.deepEqual(generateStrings(reparsed, 60, 8), generateStrings(grammar, 60, 8), text)
  }
})

test('every step of the conversion is shown', () => {
  const result = toChomskyNormalForm(grammarOf('S → ASA | aB\nA → B | S\nB → b | ε'))
  assert.deepEqual(result.steps.map(step => step.title.split(' ')[0]), ['Add', 'Remove', 'Remove', 'Give', 'Split'])
})

test('a terminal gets its own capital when that letter is free', () => {
  const result = toChomskyNormalForm(grammarOf('S → aSb | ab'))
  assert.match(result.text, /A → a/)
  assert.match(result.text, /B → b/)
})

test('an empty language has no normal form to show', () => {
  const result = toChomskyNormalForm(grammarOf('S → aS'))
  assert.equal(result.ok, false)
})

test('formatGrammar groups rules by nonterminal, start first', () => {
  assert.equal(formatGrammar(grammarOf('A → a\nS → AS | ε\nA → b')), 'A → a | b\nS → AS | ε')
  assert.equal(formatGrammar({ ...grammarOf('A → a\nS → AS | ε'), start: 'S' }), 'S → AS | ε\nA → a')
})

test('parseTrees finds two trees for an ambiguous string and one otherwise', () => {
  const ambiguous = grammarOf('E → E+E | E*E | x')
  assert.equal(parseTrees(ambiguous, 'x+x*x', 2).trees.length, 2)
  assert.equal(parseTrees(ambiguous, 'x+x', 2).trees.length, 1)
  assert.equal(parseTrees(ambiguous, 'x+', 2).trees.length, 0)
})

test('findAmbiguity reports the shortest ambiguous string', () => {
  const result = findAmbiguity(grammarOf('E → E+E | E*E | x'))
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.input, 'x*x*x') // length 5 is the shortest; '*' sorts before '+'
  assert.notDeepEqual(result.trees[0], result.trees[1])
  for (const tree of result.trees) assert.equal(tree.symbol, 'E')
})

test('findAmbiguity catches S → SS | ε style ambiguity', () => {
  const result = findAmbiguity(grammarOf('S → SS | (S) | ε'))
  assert.equal(result.status, 'ambiguous')
})

test('an unambiguous grammar reports none found', () => {
  const result = findAmbiguity(grammarOf('E → E+T | T\nT → T*F | F\nF → (E) | x'), 7)
  assert.equal(result.status, 'none-found')
  assert.ok(result.checked > 10)
  assert.equal(testMembership(grammarOf('S → aSb | ε'), 'aabb').status, 'accepted')
  assert.equal(findAmbiguity(grammarOf('S → aSb | ε')).status, 'none-found')
})
