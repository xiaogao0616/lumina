import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { EXERCISES, checkExercise, readSolved } = loadTs('exercises.ts')
const { regexToNfa } = loadTs('regex-to-nfa.ts')
const { nfaToDfa } = loadTs('nfa-to-dfa.ts')
const { PUMPING_LANGUAGES, allSplits, opponentSplit, checkChosenString, pumped } = loadTs('pumping.ts')
const { encodeShare, decodeShare, shareCodeFromHash } = loadTs('share-link.ts')
const { graphToSavedEditor } = loadTs('editor-storage.ts')
const { graphToTikz, grammarToLatex, texStateLabel } = loadTs('graph-tikz.ts')
const { parseGrammar } = loadTs('cfg.ts')

const state = (id, kind = 'state', extra = {}) => ({ id, label: id, kind, position: { x: 0, y: 0 }, color: '#67c9ff', ...extra })
const edge = (id, source, target, ...symbols) => ({ id, source, target, symbols })

test('every exercise answer parses, and its own DFA passes the check', () => {
  const ids = new Set()
  for (const exercise of EXERCISES) {
    assert.ok(!ids.has(exercise.id), exercise.id)
    ids.add(exercise.id)
    const nfa = regexToNfa(exercise.answer)
    assert.equal(nfa.ok, true, exercise.id)
    const dfa = nfaToDfa({ ...nfa.graph, symbols: exercise.alphabet }).graph
    assert.deepEqual(checkExercise(exercise, dfa), { status: 'correct' }, exercise.id)
  }
})

test('a wrong answer comes back with the strings it gets wrong', () => {
  const exercise = EXERCISES.find(item => item.id === 'ends-ab')
  // Accepts strings ending in b instead.
  const endsInB = { states: [state('s', 'start'), state('f', 'accept')],
    transitions: [edge('1', 's', 's', 'a'), edge('2', 's', 'f', 'b'), edge('3', 'f', 'f', 'b'), edge('4', 'f', 's', 'a')], symbols: ['a', 'b'] }
  assert.deepEqual(checkExercise(exercise, endsInB), { status: 'wrong', accepts: 'b', rejects: null })
})

test('a machine with no start state gets a readable error', () => {
  const verdict = checkExercise(EXERCISES[0], { states: [state('f', 'accept')], transitions: [], symbols: ['a', 'b'] })
  assert.equal(verdict.status, 'error')
  assert.doesNotMatch(verdict.message, /First machine/)
})

test('readSolved tolerates junk', () => {
  assert.deepEqual(readSolved(null), [])
  assert.deepEqual(readSolved('{"x":1}'), [])
  assert.deepEqual(readSolved('["a", 3, "b"]'), ['a', 'b'])
})

test('the suggested string wins against every split for each non-regular language', () => {
  for (const language of PUMPING_LANGUAGES.filter(item => !item.regular)) {
    for (const p of [3, 4, 5, 6]) {
      const s = language.suggest(p)
      assert.deepEqual(checkChosenString(language, s, p), { ok: true }, `${language.id} p=${p}`)
      for (const split of allSplits(language, s, p)) assert.ok(split.breaking.length > 0, `${language.id} p=${p} ${split.x}|${split.y}|${split.z}`)
    }
  }
})

test('a regular language always has a split that survives every i', () => {
  for (const language of PUMPING_LANGUAGES.filter(item => item.regular)) {
    for (const p of [3, 4, 5]) {
      const s = language.suggest(p)
      assert.deepEqual(checkChosenString(language, s, p), { ok: true }, language.id)
      assert.deepEqual(opponentSplit(language, s, p).breaking, [], language.id)
    }
  }
})

test('splits respect |xy| ≤ p and |y| ≥ 1', () => {
  const language = PUMPING_LANGUAGES[0]
  const splits = allSplits(language, 'aaabbb', 3)
  assert.equal(splits.length, 6)
  for (const split of splits) {
    assert.ok(split.y.length >= 1 && split.x.length + split.y.length <= 3)
    assert.equal(pumped(split, 1), 'aaabbb')
  }
})

test('chosen strings are checked for alphabet, length and membership', () => {
  const language = PUMPING_LANGUAGES[0]
  assert.equal(checkChosenString(language, 'ab', 3).ok, false)
  assert.equal(checkChosenString(language, 'aaab', 3).ok, false)
  assert.equal(checkChosenString(language, 'aacbb', 3).ok, false)
  assert.equal(checkChosenString(language, 'aaabbb', 3).ok, true)
})

test('share codes round-trip a tab and reject damage', async () => {
  const graph = { states: [state('s', 'start', { label: 'start₀' }), state('f', 'accept', { label: 'accept₀' })], transitions: [edge('e', 's', 'f', 'a')], symbols: ['a'] }
  const saved = graphToSavedEditor('dfa', graph, { testString: 'a' })
  const code = await encodeShare(saved)
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/)
  assert.deepEqual(await decodeShare(code), saved)
  const grammar = { version: 1, mode: 'cfg', grammar: 'S → aSb | ε', testString: '' }
  assert.deepEqual(await decodeShare(await encodeShare(grammar)), grammar)
  await assert.rejects(decodeShare(code.slice(0, -6)))
  await assert.rejects(decodeShare('x123'))
})

test('shareCodeFromHash finds the code', () => {
  assert.equal(shareCodeFromHash('#share=zabc'), 'zabc')
  assert.equal(shareCodeFromHash('#other'), null)
  assert.equal(shareCodeFromHash(''), null)
})

test('TikZ output marks start and accepting states and bends opposite arrows', () => {
  const graph = {
    states: [state('s', 'start', { label: 'start₀', position: { x: 90, y: 0 } }), state('f', 'accept', { label: 'q₁₂', position: { x: 270, y: 90 } })],
    transitions: [edge('1', 's', 'f', 'a', 'b'), edge('2', 'f', 's', 'ε'), edge('3', 'f', 'f', '$')], symbols: ['a', 'b', '$'],
  }
  const tikz = graphToTikz(graph)
  assert.match(tikz, /\\node\[state, initial\] \(s0\) at \(1\.00, (-)?0\.00\) \{\$\\mathit\{start\}_\{0\}\$\};/)
  assert.match(tikz, /\\node\[state, accepting\] \(s1\) at \(3\.00, -1\.00\) \{\$q_\{12\}\$\};/)
  assert.match(tikz, /\(s0\) edge\[bend left=20\] node \{\$a, b\$\} \(s1\)/)
  assert.match(tikz, /\(s1\) edge\[loop above\] node \{\$\\\$\$\} \(\);/)
  assert.match(tikz, /\\varepsilon/)
})

test('PDA rules become one TeX line each', () => {
  const graph = { states: [state('s', 'start')], transitions: [edge('1', 's', 's', 'a,ε→a', 'ε,$→ε')], symbols: ['a'] }
  const tikz = graphToTikz(graph, { pda: true })
  assert.match(tikz, /node\[align=center\] \{\$a, \\varepsilon \\to a\$ \\\\ \$\\varepsilon, \\\$ \\to \\varepsilon\$\}/)
})

test('state labels and grammar LaTeX', () => {
  assert.equal(texStateLabel('q₀'), '$q_{0}$')
  assert.equal(texStateLabel('{q₀, q₁}'), '$\\{q_{0},\\ q_{1}\\}$')
  assert.equal(texStateLabel('∅'), '$\\emptyset$')
  const latex = grammarToLatex(parseGrammar('S → aSb | ε\nA → a#').grammar)
  assert.match(latex, /S &\\to aSb \\mid \\varepsilon \\\\\n  A &\\to a\\#/)
})
