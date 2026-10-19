import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { graphToSvg } = loadTs('graph-svg.ts')

const state = (id, kind = 'state', extra = {}) => ({
  id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra,
})
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })

test('empty graph renders a placeholder svg', () => {
  const svg = graphToSvg({ states: [], transitions: [], symbols: [] })
  assert.match(svg, /^<svg /)
  assert.match(svg, /Empty graph/)
})

test('renders every state label and edge label, with a start marker and double ring for accept', () => {
  const graph = {
    states: [
      state('s', 'start', { position: { x: 0, y: 0 } }),
      state('f', 'accept', { position: { x: 200, y: 0 } }),
    ],
    transitions: [edge('e', 's', 'f', 'a', 'b')],
    symbols: ['a', 'b'],
  }
  const svg = graphToSvg(graph)
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(svg, />s<\/text>/)
  assert.match(svg, />f<\/text>/)
  assert.match(svg, />a, b<\/text>/)
  assert.equal((svg.match(/<circle/g) || []).length, 3) // 2 outer + 1 accept ring
  assert.match(svg, /<marker /)
})

test('self-loops and reverse pairs still route without throwing', () => {
  const graph = {
    states: [state('a', 'start'), state('b', 'accept', { position: { x: 150, y: 0 } })],
    transitions: [edge('e1', 'a', 'a', 'x'), edge('e2', 'a', 'b', 'y'), edge('e3', 'b', 'a', 'z')],
    symbols: ['x', 'y', 'z'],
  }
  assert.doesNotThrow(() => graphToSvg(graph))
})

test('labels and ids are XML-escaped', () => {
  const graph = {
    states: [state('a', 'start', { label: '<a>&"\'' })],
    transitions: [],
    symbols: [],
  }
  const svg = graphToSvg(graph)
  assert.doesNotMatch(svg, /<a>&"'/)
  assert.match(svg, /&lt;a&gt;&amp;&quot;&apos;/)
})

test('a caption with line breaks stacks one line per rule', () => {
  const graph = { symbols: ['a'], states: [{ id: 's', label: 's', kind: 'start', position: { x: 0, y: 0 }, color: '#67c9ff' }],
    transitions: [{ id: 'e', source: 's', target: 's', symbols: ['a,ε→A', 'ε,A→ε'] }] }
  const svg = graphToSvg(graph, undefined, rules => rules.join('\n'))
  assert.ok(svg.includes('>a,ε→A</text>') && svg.includes('>ε,A→ε</text>'))
})
