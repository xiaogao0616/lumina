import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { parseTmRule, formatTmRule, displayTmRule, buildTmRule, runTmGraph, findTmAcceptedStrings, tmConflicts, tapeAlphabet, tmExamples, BLANK } = loadTs('turing.ts')

const example = name => tmExamples.find(item => item.name === name).graph
const verdict = (graph, input) => runTmGraph(graph, input).status

test('rules round-trip, with Sipser’s shorthand on the canvas', () => {
  assert.deepEqual(parseTmRule('a→b,R'), { read: 'a', write: 'b', move: 'R' })
  assert.deepEqual(parseTmRule('⊔→⊔,L'), { read: BLANK, write: BLANK, move: 'L' })
  assert.deepEqual(parseTmRule(',→→,R'), { read: ',', write: '→', move: 'R' })
  assert.equal(formatTmRule({ read: 'x', write: 'y', move: 'L' }), 'x→y,L')
  assert.equal(displayTmRule('0→0,R'), '0 → R')
  assert.equal(displayTmRule('0→x,L'), '0 → x, L')
  for (const bad of ['', 'a→b', 'a→b,S', 'ab→c,R', 'a→ε,R', 'a-b,R']) assert.equal(parseTmRule(bad), null)
})

test('the rule form treats _ as the blank and an empty write as "keep it"', () => {
  assert.deepEqual(buildTmRule('_', '', 'r'), { ok: true, rule: '⊔→⊔,R' })
  assert.deepEqual(buildTmRule('0', 'x', 'L'), { ok: true, rule: '0→x,L' })
  assert.equal(buildTmRule('', 'x', 'L').ok, false)
  assert.equal(buildTmRule('ab', '', 'L').ok, false)
  assert.equal(buildTmRule('a', '', 'S').ok, false)
})

test('w#w accepts exactly the strings with matching halves', () => {
  const graph = example('w#w')
  for (const input of ['#', '0#0', '1#1', '01#01', '0110#0110']) assert.equal(verdict(graph, input), 'accepted', input)
  for (const input of ['', '0', '0#1', '01#10', '0#00', '##', '0#0#']) assert.equal(verdict(graph, input), 'rejected', input)
})

test('Sipser’s M₂ accepts 0^(2ⁿ) and nothing else', () => {
  const graph = example('0^(2ⁿ)')
  assert.deepEqual(findTmAcceptedStrings(graph, 10, 17), ['0', '00', '0000', '00000000', '0000000000000000'])
  assert.equal(verdict(graph, ''), 'rejected')
})

test('aⁿbⁿcⁿ, a language no PDA can decide', () => {
  const graph = example('aⁿbⁿcⁿ')
  assert.deepEqual(findTmAcceptedStrings(graph, 10, 9), ['', 'abc', 'aabbcc', 'aaabbbccc'])
  for (const input of ['aabc', 'abcc', 'acb', 'abcabc']) assert.equal(verdict(graph, input), 'rejected', input)
})

test('unary addition leaves the sum on the tape', () => {
  const run = runTmGraph(example('Unary addition'), '11+111')
  assert.equal(run.status, 'accepted')
  assert.equal(run.tape, '11111')
  assert.equal(verdict(example('Unary addition'), '111'), 'rejected')
})

test('a repeated configuration is reported as looping, a long run as undecided', () => {
  const state = (id, kind) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff' })
  const bounce = { symbols: ['a'], states: [state('p', 'start'), state('q', 'state')],
    transitions: [{ id: 'e1', source: 'p', target: 'q', symbols: ['a→a,R'] }, { id: 'e2', source: 'q', target: 'p', symbols: ['⊔→⊔,L'] }] }
  assert.equal(verdict(bounce, 'a'), 'loops')
  const runaway = { symbols: ['a'], states: [state('p', 'start')], transitions: [{ id: 'e1', source: 'p', target: 'p', symbols: ['a→a,R', '⊔→a,R'] }] }
  const run = runTmGraph(runaway, 'a', { maxSteps: 500 })
  assert.equal(run.status, 'undecided')
  assert.equal(run.moves, 500)
})

test('the head stays put when it moves left off the first cell', () => {
  const state = (id, kind) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff' })
  const graph = { symbols: ['a'], states: [state('p', 'start'), state('q', 'state'), state('f', 'accept')],
    transitions: [{ id: 'e1', source: 'p', target: 'q', symbols: ['a→b,L'] }, { id: 'e2', source: 'q', target: 'f', symbols: ['b→b,R'] }] }
  const run = runTmGraph(graph, 'a')
  assert.equal(run.status, 'accepted')
  assert.deepEqual(run.steps.map(step => step.head), [0, 0, 1])
})

test('conflicts and errors: two rules reading one symbol, or a blank in the input', () => {
  const state = (id, kind) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff' })
  const graph = { symbols: ['a'], states: [state('p', 'start'), state('q', 'accept')],
    transitions: [{ id: 'e1', source: 'p', target: 'q', symbols: ['a→a,R'] }, { id: 'e2', source: 'p', target: 'p', symbols: ['a→b,L'] }] }
  assert.equal(tmConflicts(graph).length, 1)
  assert.equal(verdict(graph, 'a'), 'error')
  assert.equal(verdict(example('w#w'), '0⊔0'), 'error')
  assert.deepEqual(tapeAlphabet(example('w#w')), ['0', '1', '#', 'x', BLANK])
})
