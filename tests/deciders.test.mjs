import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { decideADfa, decideANfa, decideARex, decideEDfa, decideEqDfa, decideACfg, decideECfg } = loadTs('deciders.ts')
const { parseGrammar } = loadTs('cfg.ts')

const state = (id, kind, x = 0) => ({ id, label: id, kind, position: { x, y: 0 }, color: '#67c9ff' })
const edge = (source, target, ...symbols) => ({ id: `${source}-${target}`, source, target, symbols })
// Ends in ab.
const endsAb = { symbols: ['a', 'b'], states: [state('s', 'start'), state('p', 'state'), state('f', 'accept')],
  transitions: [edge('s', 'p', 'a'), edge('s', 's', 'b'), edge('p', 'p', 'a'), edge('p', 'f', 'b'), edge('f', 'p', 'a'), edge('f', 's', 'b')] }
// Contains ab.
const containsAb = { symbols: ['a', 'b'], states: [state('s', 'start'), state('p', 'state'), state('f', 'accept')],
  transitions: [edge('s', 'p', 'a'), edge('s', 's', 'b'), edge('p', 'p', 'a'), edge('p', 'f', 'b'), edge('f', 'f', 'a', 'b')] }
const grammar = text => parseGrammar(text).grammar

test('A_DFA simulates B on w one character at a time', () => {
  const run = decideADfa(endsAb, 'aab')
  assert.equal(run.accepted, true)
  assert.deepEqual(run.steps.map(step => step.stateId), ['s', 'p', 'p', 'f'])
  assert.equal(decideADfa(endsAb, 'aba').accepted, false)
  assert.equal(decideADfa(endsAb, 'abc').ok, false)
  const partial = { ...endsAb, transitions: endsAb.transitions.filter(item => item.id !== 's-s') }
  const stuck = decideADfa(partial, 'ba')
  assert.equal(stuck.accepted, false)
  assert.equal(stuck.stuck, true)
  const nfa = { ...endsAb, transitions: [...endsAb.transitions, edge('s', 'f', 'a')] }
  assert.match(decideADfa(nfa, 'a').message, /NFA/)
})

test('A_NFA and A_REX convert to a DFA first', () => {
  const nfa = { symbols: ['a', 'b'], states: [state('s', 'start'), state('f', 'accept')], transitions: [edge('s', 's', 'a', 'b'), edge('s', 'f', 'b')] }
  const result = decideANfa(nfa, 'aab')
  assert.equal(result.run.accepted, true)
  assert.equal(decideANfa(nfa, 'ba').run.accepted, false)
  assert.ok(result.dfa.states.length >= 2)
  assert.equal(decideARex('(a|b)*ab', 'bbab').run.accepted, true)
  assert.equal(decideARex('(a|b)*ab', 'abb').run.accepted, false)
  assert.equal(decideARex('a*', 'ac').run.accepted, false)
  assert.equal(decideARex('(a', 'a').ok, false)
})

test('E_DFA marks states reachable from the start, round by round', () => {
  const result = decideEDfa(endsAb)
  assert.equal(result.empty, false)
  assert.deepEqual(result.rounds.map(round => round.marked), [['s'], ['p'], ['f']])
  assert.equal(result.witness, 'ab')
  const unreachable = { symbols: ['a'], states: [state('s', 'start'), state('q', 'state'), state('f', 'accept')],
    transitions: [edge('s', 'q', 'a'), edge('q', 's', 'a'), edge('f', 's', 'a')] }
  const empty = decideEDfa(unreachable)
  assert.equal(empty.empty, true)
  assert.equal(empty.witness, null)
})

test('EQ_DFA builds the symmetric difference and checks it is empty', () => {
  const same = decideEqDfa(endsAb, endsAb)
  assert.equal(same.equivalent, true)
  assert.equal(same.product.states.length, 3)
  const different = decideEqDfa(endsAb, containsAb)
  assert.equal(different.equivalent, false)
  assert.deepEqual(different.witness, { input: 'aba', acceptedBy: 'B' })
  assert.ok(different.product.states.some(item => item.label === 'p,f'))
})

test('A_CFG works in Chomsky normal form, where a derivation of w takes 2|w| − 1 steps', () => {
  const g = grammar('S → aSb | ε')
  const yes = decideACfg(g, 'aabb')
  assert.equal(yes.accepted, true)
  assert.equal(yes.bound, 7)
  assert.equal(yes.derivation.length - 1, 7)
  assert.equal(decideACfg(g, 'aab').accepted, false)
  assert.equal(decideACfg(g, '').accepted, true)
  assert.equal(decideACfg(grammar('S → aSb | ab'), '').accepted, false)
  assert.equal(decideACfg(g, 'abc').accepted, false)
})

test('E_CFG marks terminals, then every variable with an all-marked rule', () => {
  const nonEmpty = decideECfg(grammar('S → AB | Ca\nA → aA | a\nB → bB\nC → c'))
  assert.equal(nonEmpty.empty, false)
  assert.deepEqual(nonEmpty.rounds.map(round => round.marked), [['a', 'b', 'c'], ['A', 'C'], ['S']])
  assert.deepEqual(nonEmpty.unmarked, ['B'])
  assert.equal(decideECfg(grammar('S → aS | bA\nA → aA')).empty, true)
})
