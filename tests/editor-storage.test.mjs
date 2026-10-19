import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { readSavedEditor: read, graphToSavedEditor, readTabsIndex, tabsIndexKey, tabStorageKey, legacyModeTabsIndexKey, readLegacyModeTabsIndex, readSavedGrammar } = loadTs('editor-storage.ts')
const { builtInCategories, defaultNextIndices } = loadTs('automaton-graph.ts')

const base = {
  version: 2,
  mode: 'nfa',
  nodes: [],
  edges: [],
  categories: [{ id: 'start', name: 'start', kind: 'start' }, { id: 'q', name: 'q', kind: 'state' }, { id: 'accept', name: 'accept', kind: 'accept' }],
  nextIndices: [['start', 4], ['q', 15], ['accept', 2]],
  symbols: ['a', '😀'],
  testString: ' a😀 ',
}

test('empty graph and deleted-state counters survive round trip', () => assert.deepEqual(read(JSON.stringify(base)), base))

test('positions, names, colors and multi-input edges survive', () => {
  const v = structuredClone(base)
  v.nodes = [{ id: 'x', type: 'start', position: { x: -30, y: 85 }, data: { label: 'renamed', kind: 'start', color: '#67c9ff', accepting: true } }]
  v.edges = [{ id: 'e', source: 'x', target: 'x', symbols: ['ε', '😀'] }]
  assert.deepEqual(read(JSON.stringify(v)), v)
})

test('v1 legacy without mode is upgraded to nfa', () => {
  const v1 = { version: 1, nodes: [], edges: [], categories: base.categories, nextIndices: base.nextIndices, symbols: base.symbols, testString: '' }
  const got = read(JSON.stringify(v1))
  assert.equal(got.version, 2)
  assert.equal(got.mode, 'nfa')
})

test('dfa saves reject epsilon and nfa expectedMode mismatch', () => {
  const dfa = { ...structuredClone(base), mode: 'dfa', symbols: ['a'], edges: [] }
  dfa.nodes = [{ id: 'x', type: 'start', position: { x: 0, y: 0 }, data: { label: 's', kind: 'start', color: '#67c9ff' } }]
  dfa.edges = [{ id: 'e', source: 'x', target: 'x', symbols: ['ε'] }]
  assert.throws(() => read(JSON.stringify(dfa)))
  assert.throws(() => read(JSON.stringify(base), 'dfa'))
})

test('bad JSON, unknown versions, missing fields rejected', () => {
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...base, version: 3 }), JSON.stringify({ ...base, symbols: null })]) {
    assert.throws(() => read(raw))
  }
})

test('broken references, missing counters and unsupported symbols rejected', () => {
  for (const patch of [
    { edges: [{ id: 'e', source: 'x', target: 'y', symbols: ['a'] }] },
    { nextIndices: [] },
    { symbols: ['ab'] },
    { categories: [] },
    { symbols: ['a', 'a'] },
  ]) assert.throws(() => read(JSON.stringify({ ...base, ...patch })))
})

test('graphToSavedEditor writes version 2 with built-in categories', () => {
  const saved = graphToSavedEditor('dfa', { states: [], transitions: [], symbols: ['a'] })
  assert.equal(saved.version, 2)
  assert.equal(saved.mode, 'dfa')
  assert.deepEqual(saved.categories, builtInCategories)
  assert.deepEqual(saved.nextIndices, defaultNextIndices)
})

test('tab keys are namespaced per mode and per tab; the tabs index is one shared key', () => {
  assert.equal(tabsIndexKey(), tabsIndexKey())
  assert.notEqual(legacyModeTabsIndexKey('dfa'), legacyModeTabsIndexKey('nfa'))
  assert.notEqual(tabStorageKey('dfa', 'x'), tabStorageKey('nfa', 'x'))
  assert.notEqual(tabStorageKey('dfa', 'x'), tabStorageKey('dfa', 'y'))
})

test('readTabsIndex accepts a mixed-mode index and rejects malformed ones', () => {
  const index = { activeId: 'a', tabs: [{ id: 'a', mode: 'dfa', title: 'DFA 1' }, { id: 'b', mode: 'nfa', title: 'NFA 1' }] }
  assert.deepEqual(readTabsIndex(JSON.stringify(index)), index)
  for (const raw of [
    '{',
    JSON.stringify({ activeId: 'a', tabs: [] }), // activeId must point at a real tab
    JSON.stringify({ activeId: 'a', tabs: [{ id: 'a', mode: 'dfa', title: '' }] }), // blank title
    JSON.stringify({ activeId: 'a', tabs: [{ id: 'a', mode: 'xyz', title: 'x' }] }), // invalid mode
    JSON.stringify({ activeId: 'a', tabs: [{ id: 'a', title: 'x' }] }), // missing mode
    JSON.stringify({ activeId: 'a', tabs: [{ id: 'a', mode: 'dfa', title: 'x' }, { id: 'a', mode: 'nfa', title: 'y' }] }), // duplicate id
    JSON.stringify({ tabs: [{ id: 'a', mode: 'dfa', title: 'x' }] }), // missing activeId
  ]) assert.throws(() => readTabsIndex(raw))
})

test('readLegacyModeTabsIndex parses the old per-mode format for migration', () => {
  const legacy = { activeId: 'a', tabs: [{ id: 'a', title: 'DFA 1' }] }
  assert.deepEqual(readLegacyModeTabsIndex(JSON.stringify(legacy)), legacy)
  assert.throws(() => readLegacyModeTabsIndex('{'))
})

test('pda saves keep rules on edges, and only rules that read declared characters', () => {
  const pda = { ...structuredClone(base), mode: 'pda', symbols: ['a', 'b'] }
  pda.nodes = [{ id: 'x', type: 'start', position: { x: 0, y: 0 }, data: { label: 's', kind: 'start', color: '#67c9ff' } }]
  pda.edges = [{ id: 'e', source: 'x', target: 'x', symbols: ['ε,ε→$', 'a,ε→A', 'b,A→ε'] }]
  assert.deepEqual(read(JSON.stringify(pda), 'pda'), pda)
  for (const symbols of [['c,ε→ε'], ['a'], ['a,AB→ε']]) {
    assert.throws(() => read(JSON.stringify({ ...pda, edges: [{ ...pda.edges[0], symbols }] })))
  }
  assert.throws(() => read(JSON.stringify(pda), 'nfa'))
})

test('cfg saves and tabs of every mode', () => {
  const saved = { version: 1, mode: 'cfg', grammar: 'S → aSb | ε', testString: 'ab' }
  assert.deepEqual(readSavedGrammar(JSON.stringify(saved)), saved)
  for (const bad of [{ ...saved, mode: 'pda' }, { ...saved, grammar: 3 }, { ...saved, version: 2 }]) assert.throws(() => readSavedGrammar(JSON.stringify(bad)))
  const index = { activeId: 'c', tabs: [{ id: 'p', mode: 'pda', title: 'PDA 1' }, { id: 'c', mode: 'cfg', title: 'CFG 1' }] }
  assert.deepEqual(readTabsIndex(JSON.stringify(index)), index)
  assert.equal(tabStorageKey('cfg', 'c'), 'automata-lab.cfg.tab.c.v1')
})
