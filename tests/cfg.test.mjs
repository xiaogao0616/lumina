import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { parseGrammar, analyzeGrammar, testMembership, generateStrings, cfgToPda, leftmostDerivation } = loadTs('cfg.ts')
const { runPda } = loadTs('pda.ts')

const grammar = text => {
  const parsed = parseGrammar(text)
  assert.equal(parsed.ok, true, parsed.message)
  return parsed.grammar
}
const accepts = (g, input) => testMembership(g, input).status === 'accepted'

test('parses arrows, alternatives, ε, comments and repeated heads', () => {
  const g = grammar('# balanced\nS → aSb | ε\nS -> T\nT ::= c c')
  assert.equal(g.start, 'S')
  assert.deepEqual(g.nonterminals, ['S', 'T'])
  assert.deepEqual(g.terminals, ['a', 'b', 'c'])
  assert.deepEqual(g.productions.map(p => [p.head, p.body.join('')]), [['S', 'aSb'], ['S', ''], ['S', 'T'], ['T', 'cc']])
})

test('reports syntax problems with the line number', () => {
  for (const [text, line] of [['', 1], ['S aSb', 1], ['S → a\nab → c', 2], ['s → a', 1]]) {
    const parsed = parseGrammar(text)
    assert.equal(parsed.ok, false)
    assert.equal(parsed.line, line)
  }
})

test('membership for aⁿbⁿ, palindromes and balanced parentheses', () => {
  const anbn = grammar('S → aSb | ε')
  for (const input of ['', 'ab', 'aaabbb']) assert.ok(accepts(anbn, input), input)
  for (const input of ['a', 'ba', 'aab', 'abab']) assert.ok(!accepts(anbn, input), input)
  const pal = grammar('S → aSa | bSb | a | b | ε')
  for (const input of ['', 'aba', 'abba', 'babab']) assert.ok(accepts(pal, input), input)
  assert.ok(!accepts(pal, 'ab'))
  const parens = grammar('S → SS | (S) | ε')
  for (const input of ['', '()', '(())()', '((()))']) assert.ok(accepts(parens, input), input)
  for (const input of ['(', ')(', '(()']) assert.ok(!accepts(parens, input), input)
})

test('left recursion, unit cycles and nullable chains terminate', () => {
  const expr = grammar('E → E+T | T\nT → T*F | F\nF → (E) | x')
  assert.ok(accepts(expr, 'x+x*(x+x)'))
  assert.ok(!accepts(expr, 'x+'))
  const cyclic = grammar('S → A | a\nA → S | B\nB → ε')
  assert.ok(accepts(cyclic, ''))
  assert.ok(accepts(cyclic, 'a'))
  const nullable = grammar('S → ABA\nA → ε | a\nB → ε | b')
  for (const input of ['', 'a', 'b', 'aba', 'ab', 'aa']) assert.ok(accepts(nullable, input), input)
  assert.ok(!accepts(nullable, 'aaa'))
})

test('an accepted string comes with a matching tree and leftmost derivation', () => {
  const result = testMembership(grammar('S → aSb | ε'), 'aabb')
  assert.equal(result.status, 'accepted')
  assert.deepEqual(result.derivation, ['S', 'aSb', 'aaSbb', 'aabb'])
  const leaves = []
  const walk = node => node.children.length ? node.children.forEach(walk) : leaves.push(node.symbol)
  walk(result.tree)
  assert.equal(leaves.filter(symbol => symbol !== 'ε').join(''), 'aabb')
  assert.deepEqual(leftmostDerivation(testMembership(grammar('S → AB\nA → a\nB → b'), 'ab').tree), ['S', 'AB', 'aB', 'ab'])
})

test('analysis flags undefined, non-productive and unreachable nonterminals', () => {
  const report = analyzeGrammar(grammar('S → aS | A | X\nA → aA\nB → b'))
  assert.deepEqual(report.undefinedSymbols, ['X'])
  assert.deepEqual(report.nonProductive, ['S', 'A'])
  assert.deepEqual(report.unreachable, ['B'])
})

test('generates strings shortest first and skips useless rules', () => {
  assert.deepEqual(generateStrings(grammar('S → aSb | ε'), 4), ['', 'ab', 'aabb', 'aaabbb'])
  const parens = generateStrings(grammar('S → SS | (S) | ε'), 6)
  assert.deepEqual(parens.map(s => s.length), [0, 2, 4, 4, 6, 6])
  assert.deepEqual(generateStrings(grammar('S → aS'), 3), [])
})

test('CFG → PDA accepts exactly what the grammar does', () => {
  for (const text of ['S → aSb | ε', 'S → SS | (S) | ε', 'E → E+T | T\nT → x | (E)']) {
    const g = grammar(text)
    const pda = cfgToPda(g)
    const states = pda.states.map(state => ({ id: state.id, label: state.label, start: state.kind === 'start', accepting: state.kind === 'accept' }))
    for (const input of ['', 'ab', 'aabb', 'abab', '()', '(()', ')(', 'x+x', 'x+(x+x)', 'x+']) {
      assert.equal(runPda(states, pda.transitions, input).status === 'accepted', accepts(g, input), `${text} on ${JSON.stringify(input)}`)
    }
  }
})

test('CFG → PDA picks a bottom marker the grammar does not use', () => {
  const pda = cfgToPda(grammar('S → $S | a'))
  assert.deepEqual(pda.transitions[0].symbols, ['ε,ε→S⊥'])
})
