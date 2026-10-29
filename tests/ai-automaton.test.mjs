import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { extractJson, specToResult, readAiSettings, userPrompt } = loadTs('ai-automaton.ts')
const { simulateAutomaton } = loadTs('automata-simulator.ts')

const endsInAb = {
  type: 'dfa', title: 'Ends in ab', alphabet: ['a', 'b'],
  states: [{ name: 'q0', start: true }, { name: 'q1' }, { name: 'q2', accept: true }],
  transitions: [
    { from: 'q0', to: 'q1', symbols: ['a'] }, { from: 'q0', to: 'q0', symbols: ['b'] },
    { from: 'q1', to: 'q1', symbols: ['a'] }, { from: 'q1', to: 'q2', symbols: ['b'] },
    { from: 'q2', to: 'q1', symbols: ['a'] }, { from: 'q2', to: 'q0', symbols: ['b'] },
  ],
}

test('extracts JSON from fenced or chatty replies', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"type":"dfa"}\n```'), { type: 'dfa' })
  assert.deepEqual(extractJson('Here: {"a": {"b": 1}} done'), { a: { b: 1 } })
  assert.throws(() => extractJson('no json here'))
})

test('a DFA spec becomes a working graph laid out from the start state', () => {
  const result = specToResult(endsInAb, 'auto')
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'dfa')
  assert.deepEqual(result.graph.symbols, ['a', 'b'])
  assert.equal(result.graph.states[0].position.x < result.graph.states[2].position.x, true)
  const states = result.graph.states.map(s => ({ id: s.id, label: s.label, start: s.kind === 'start', accepting: s.kind === 'accept' }))
  const run = input => simulateAutomaton(states, result.graph.transitions, input).status
  assert.equal(run('abab'), 'accepted')
  assert.equal(run('aba'), 'rejected')
})

test('edges between the same states merge; start can also accept', () => {
  const result = specToResult({ type: 'nfa', states: [{ name: 'p', start: true, accept: true }],
    transitions: [{ from: 'p', to: 'p', symbols: ['a'] }, { from: 'p', to: 'p', symbols: ['eps', 'b'] }] }, 'auto')
  assert.equal(result.ok, true)
  assert.equal(result.graph.transitions.length, 1)
  assert.deepEqual(result.graph.transitions[0].symbols, ['a', 'ε', 'b'])
  assert.equal(result.graph.states[0].accepting, true)
})

test('rejects what the editor cannot load', () => {
  assert.equal(specToResult({ ...endsInAb, states: endsInAb.states.map(s => ({ ...s, start: false })) }, 'auto').ok, false)
  assert.equal(specToResult({ ...endsInAb, transitions: [...endsInAb.transitions, { from: 'q0', to: 'q2', symbols: ['a'] }] }, 'auto').ok, false)
  assert.equal(specToResult({ ...endsInAb, transitions: [{ from: 'q0', to: 'zz', symbols: ['a'] }] }, 'auto').ok, false)
  assert.equal(specToResult({ ...endsInAb, transitions: [{ from: 'q0', to: 'q1', symbols: ['ab'] }] }, 'auto').ok, false)
  assert.equal(specToResult({ ...endsInAb, transitions: [{ from: 'q0', to: 'q1', symbols: ['ε'] }] }, 'auto').ok, false)
  assert.deepEqual(specToResult({ error: '看不清图片' }, 'auto'), { ok: false, message: '看不清图片' })
})

test('PDA rules are normalized to the canonical form', () => {
  const result = specToResult({ type: 'pda', states: [{ name: 's', start: true }, { name: 'f', accept: true }],
    transitions: [{ from: 's', to: 's', symbols: ['a, e -> A'] }, { from: 's', to: 'f', symbols: ['ε,ε→ε'] }] }, 'pda')
  assert.equal(result.ok, true)
  assert.deepEqual(result.graph.transitions[0].symbols, ['a,ε→A'])
  assert.deepEqual(result.graph.symbols, ['a'])
  assert.equal(specToResult({ type: 'pda', states: [{ name: 's', start: true }], transitions: [{ from: 's', to: 's', symbols: ['nonsense'] }] }, 'pda').ok, false)
})

test('a CFG spec is checked by the grammar parser', () => {
  assert.deepEqual(specToResult({ type: 'cfg', title: 'aⁿbⁿ', grammar: 'S → aSb | ε' }, 'auto'), { ok: true, mode: 'cfg', grammar: 'S → aSb | ε', title: 'aⁿbⁿ', explanation: '' })
  assert.equal(specToResult({ type: 'cfg', grammar: 'oops' }, 'auto').ok, false)
})

test('settings fall back to defaults and prompts mention the target', () => {
  assert.equal(readAiSettings(null).provider, 'gemini')
  assert.equal(readAiSettings('{"provider":"anthropic"}').model, 'claude-sonnet-5-5')
  assert.equal(readAiSettings('{"provider":"openai","apiKey":" k "}').apiKey, 'k')
  assert.equal(readAiSettings('{bad').apiKey, '')
  assert.match(userPrompt('pda', 'aⁿbⁿ', false), /PDA/)
  assert.match(userPrompt('auto', '', true), /photo/)
})

test('a Turing machine reply: rules in several spellings, blank as _, input alphabet kept apart from markers', () => {
  const result = specToResult({
    type: 'tm', title: 'aⁿbⁿ',
    alphabet: ['a', 'b'],
    states: [{ name: 'q0', start: true }, { name: 'q1' }, { name: 'q2' }, { name: 'q3' }, { name: 'qa', accept: true }],
    transitions: [
      { from: 'q0', to: 'q1', symbols: ['a -> x, R'] }, { from: 'q0', to: 'q3', symbols: ['y→R'] }, { from: 'q0', to: 'qa', symbols: ['_→_,R'] },
      { from: 'q1', to: 'q1', symbols: ['a→a,R', 'y/y,R'] }, { from: 'q1', to: 'q2', symbols: ['b,y,l'] },
      { from: 'q2', to: 'q2', symbols: ['a→L', 'y→L'] }, { from: 'q2', to: 'q0', symbols: ['x→R'] },
      { from: 'q3', to: 'q3', symbols: ['y→R'] }, { from: 'q3', to: 'qa', symbols: ['B→R'] },
    ],
  }, 'tm')
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'tm')
  assert.deepEqual(result.graph.symbols, ['a', 'b'])
  assert.deepEqual(result.graph.transitions.find(edge => edge.source === 's1' && edge.target === 's2').symbols, ['b→y,L'])
  assert.deepEqual(result.graph.transitions.find(edge => edge.target === 's4' && edge.source === 's0').symbols, ['⊔→⊔,R'])
  const { runTmGraph } = loadTs('turing.ts')
  for (const word of ['', 'ab', 'aabb']) assert.equal(runTmGraph(result.graph, word).status, 'accepted', word)
  for (const word of ['a', 'abb', 'ba']) assert.equal(runTmGraph(result.graph, word).status, 'rejected', word)
})

test('a Turing machine reply with two rules for one read symbol is refused', () => {
  const result = specToResult({ type: 'tm', alphabet: ['a'], states: [{ name: 'p', start: true }, { name: 'q', accept: true }],
    transitions: [{ from: 'p', to: 'q', symbols: ['a→a,R'] }, { from: 'p', to: 'p', symbols: ['a→b,L'] }] }, 'auto')
  assert.equal(result.ok, false)
  assert.match(result.message, /two rules/)
  assert.equal(specToResult({ type: 'tm', states: [{ name: 'p', start: true }], transitions: [{ from: 'p', to: 'p', symbols: ['a→b,S'] }] }, 'tm').ok, false)
})
