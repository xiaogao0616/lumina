import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../lib/automata-simulator.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
new Function('exports', 'module', compiled)(module.exports, module)
const { simulateAutomaton: run } = module.exports
const s = (id, start = false, accepting = false) => ({ id, label: id, start, accepting })
const e = (source, target, ...symbols) => ({ source, target, symbols })
const states = [s('s', true), s('q'), s('f', false, true)]
test('full input required; unknown input rejects', () => {
  const edges = [e('s','f','a')]
  assert.equal(run(states, edges, 'a').status, 'accepted')
  assert.equal(run(states, edges, 'ab').status, 'rejected')
  assert.equal(run(states, edges, '').status, 'rejected')
})
test('epsilon closure before, between and after symbols; epsilon cycles terminate', () => {
  const edges = [e('s','q','ε'), e('q','s','ε'), e('q','q','a'), e('q','f','ε'), e('f','q','ε')]
  for (const input of ['', 'a', 'aaa']) assert.equal(run(states, edges, input).status, 'accepted')
  assert.equal(run(states, edges, 'ε').status, 'rejected')
})
test('explores all nondeterministic branches, not just the first', () => {
  const edges = [e('s','q','a'),e('s','f','a'),e('q','f','b')]
  assert.equal(run(states,edges,'a').status,'accepted')
  assert.equal(run(states,edges,'ab').status,'accepted')
  assert.equal(run(states,edges,'aa').status,'rejected')
})
test('multiple inputs on one path including epsilon', () => {
  const edges = [e('s','f','b','h','ε')]
  for (const input of ['b','h','']) assert.equal(run(states,edges,input).status,'accepted')
  assert.equal(run(states,edges,'bh').status,'rejected')
})
test('inactive path, no accepting states and unreachable accepting state reject', () => {
  assert.equal(run(states,[e('s','f')],'').status,'rejected')
  assert.equal(run(states,[],'').status,'rejected')
  assert.equal(run([s('s',true)],[],'').status,'rejected')
})
test('missing/multiple starts and broken graph are configuration errors', () => {
  assert.equal(run([],[],'').status,'error')
  assert.equal(run([s('s',true),s('t',true)],[],'').status,'error')
  assert.equal(run(states,[e('s','missing','a')],'a').status,'error')
  assert.equal(run(states,[e('s','f','ab')],'ab').status,'error')
})
test('Unicode code points, exact whitespace and punctuation; no normalization or trimming', () => {
  assert.equal(run(states,[e('s','f','😀')],'😀').status,'accepted')
  assert.equal(run(states,[e('s','f','a')],' a').status,'rejected')
  assert.equal(run(states,[e('s','f',',')],',').status,'accepted')
  assert.equal(run(states,[e('s','f','é')],'e\u0301').status,'rejected')
})
test('iterative closure handles long chains and cycles', () => {
  const ns=Array.from({length:5000},(_,i)=>s(String(i),i===0,i===4999))
  const es=ns.slice(1).map((_,i)=>e(String(i),String(i+1),'ε'))
  es.push(e('4999','0','ε'))
  assert.equal(run(ns,es,'').status,'accepted')
})
test('does not mutate caller data', () => {
  const graph=JSON.stringify([states,[e('s','f','a','ε')]])
  const [ns,es]=JSON.parse(graph);run(ns,es,'a')
  assert.equal(JSON.stringify([ns,es]),graph)
})
