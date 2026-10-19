import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { parsePdaRule, formatPdaRule, displayPdaRule, buildPdaRule, runPda, findPdaAcceptedStrings, pdaBranching } = loadTs('pda.ts')

const s = (id, start = false, accepting = false) => ({ id, label: id, start, accepting })
const t = (id, source, target, ...symbols) => ({ id, source, target, symbols })
// Sipser's 0ⁿ1ⁿ, written with a and b.
const states = [s('s', true), s('p'), s('q'), s('f', false, true)]
const anbn = [t('e1', 's', 'p', 'ε,ε→$'), t('e2', 'p', 'p', 'a,ε→a'), t('e3', 'p', 'q', 'ε,ε→ε'), t('e4', 'q', 'q', 'b,a→ε'), t('e5', 'q', 'f', 'ε,$→ε')]
const graphOf = (st, tr, symbols) => ({ states: st.map(x => ({ id: x.id, label: x.label, kind: x.start ? 'start' : x.accepting ? 'accept' : 'state', position: { x: 0, y: 0 }, color: '#67c9ff' })), transitions: tr, symbols })

test('rules round-trip, including ε fields and comma or arrow as symbols', () => {
  assert.deepEqual(parsePdaRule('a,X→YZ'), { input: 'a', pop: 'X', push: 'YZ' })
  assert.deepEqual(parsePdaRule('ε,ε→ε'), { input: '', pop: '', push: '' })
  assert.deepEqual(parsePdaRule(',,→→,'), { input: ',', pop: '→', push: ',' })
  assert.equal(formatPdaRule({ input: '', pop: 'S', push: 'aSb' }), 'ε,S→aSb')
  assert.equal(displayPdaRule('a,ε→A'), 'a, ε → A')
  for (const bad of ['', 'a,X', 'ab,X→Y', 'a,XY→Z', 'a,X→YεZ', 'a;X→Y']) assert.equal(parsePdaRule(bad), null)
})

test('the rule form treats blanks as ε and rejects multi-character read or pop', () => {
  assert.deepEqual(buildPdaRule('', ' ', ''), { ok: true, rule: 'ε,ε→ε' })
  assert.deepEqual(buildPdaRule('a', 'ε', 'A B'), { ok: true, rule: 'a,ε→AB' })
  assert.equal(buildPdaRule('ab', '', '').ok, false)
  assert.equal(buildPdaRule('a', 'XY', '').ok, false)
  assert.equal(buildPdaRule('a', '', 'Aε').ok, false)
})

test('aⁿbⁿ accepts balanced strings and rejects the rest', () => {
  for (const input of ['', 'ab', 'aabb', 'aaabbb']) assert.equal(runPda(states, anbn, input).status, 'accepted', input)
  for (const input of ['a', 'b', 'aab', 'abb', 'ba', 'abab']) assert.equal(runPda(states, anbn, input).status, 'rejected', input)
})

test('an accepting run lists every move with the stack after it, top first', () => {
  const run = runPda(states, anbn, 'aabb')
  assert.deepEqual(run.steps.map(step => step.stack), ['', '$', 'a$', 'aa$', 'aa$', 'a$', '$', ''])
  assert.deepEqual(run.steps.map(step => step.edgeId), [null, 'e1', 'e2', 'e2', 'e3', 'e4', 'e4', 'e5'])
  assert.equal(run.steps.at(-1).consumed, 4)
})

test('a rejected run shows how far the furthest branch got', () => {
  const run = runPda(states, anbn, 'aabbb')
  assert.equal(run.status, 'rejected')
  assert.equal(run.steps.at(-1).consumed, 4)
  assert.match(run.message, /character 5/)
})

test('ε-loops that keep pushing stop at the limit and say so', () => {
  const loop = [t('e', 's', 's', 'ε,ε→X')]
  const run = runPda([s('s', true), s('f', false, true)], loop, 'a', { maxStack: 50 })
  assert.equal(run.status, 'rejected')
  assert.equal(run.truncated, true)
  assert.match(run.message, /search limit/)
})

test('configuration errors', () => {
  assert.equal(runPda([], [], '').status, 'error')
  assert.equal(runPda([s('a', true), s('b', true)], [], '').status, 'error')
  assert.equal(runPda(states, [t('e', 's', 'missing', 'a,ε→ε')], 'a').status, 'error')
  assert.equal(runPda(states, [t('e', 's', 'f', 'nonsense')], 'a').status, 'error')
})

test('accepted strings come out shortest first', () => {
  assert.deepEqual(findPdaAcceptedStrings(graphOf(states, anbn, ['a', 'b']), 4), ['', 'ab', 'aabb', 'aaabbb'])
})

test('branching finds rules that can both apply', () => {
  const graph = graphOf(states, anbn, ['a', 'b'])
  // From p, "a,ε→a" and "ε,ε→ε" overlap; from q, "b,a→ε" and "ε,$→ε" pop different symbols.
  assert.deepEqual(pdaBranching(graph).map(item => item.sourceLabel), ['p'])
  const deterministic = graphOf(states, [t('x', 's', 'f', 'a,X→ε', 'b,X→ε', 'a,Y→ε')], ['a', 'b'])
  assert.deepEqual(pdaBranching(deterministic), [])
})

test('accepted strings include every word, not one per configuration', () => {
  // Even palindromes over {a, b}: length 2 has aa and bb, length 4 has four.
  const pal = [t('e1', 's', 'p', 'ε,ε→$'), t('e2', 'p', 'p', 'a,ε→a', 'b,ε→b'), t('e3', 'p', 'q', 'ε,ε→ε'), t('e4', 'q', 'q', 'a,a→ε', 'b,b→ε'), t('e5', 'q', 'f', 'ε,$→ε')]
  assert.deepEqual(findPdaAcceptedStrings(graphOf(states, pal, ['a', 'b']), 7), ['', 'aa', 'bb', 'aaaa', 'abba', 'baab', 'bbbb'])
})
