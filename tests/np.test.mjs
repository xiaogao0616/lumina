import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const {
  parseCnf, formulaText, formulaTrue, bruteForceSat, cnfToClique, isClique, findClique, assignmentToClique, cliqueToAssignment,
  cnfToVertexCover, isVertexCover, findVertexCover, assignmentToCover, coverToAssignment,
} = loadTs('np.ts')

const parse = text => { const result = parseCnf(text); assert.ok(result.ok, result.message); return result.formula }

test('parseCnf reads Unicode and ASCII', () => {
  const a = parse('(x ∨ y ∨ ¬z) ∧ (¬x ∨ ¬y ∨ z)')
  const b = parse('(x | y | ~z) & (!x or not y or z)')
  assert.equal(formulaText(a), '(x ∨ y ∨ ¬z) ∧ (¬x ∨ ¬y ∨ z)')
  assert.deepEqual(a, b)
  assert.deepEqual(parse('x1 v x2').variables, ['x1', 'x2'])
  assert.equal(formulaText(parse('¬¬x')), '(x)')
})

test('parseCnf explains mistakes', () => {
  for (const bad of ['', '(x ∨ y ∨ z ∨ w)', '(x ∨ ) ∧ y', '(x ∧ y', '(1 ∨ x)', '(x) ∧ ', 'a∧b∧c∧d∧e∧f∧g']) assert.equal(parseCnf(bad).ok, false, bad)
})

const SAMPLES = [
  '(x ∨ x ∨ y) ∧ (¬x ∨ ¬y ∨ ¬y) ∧ (¬x ∨ y ∨ y)', // Sipser's Figure 7.33 formula
  '(x ∨ y ∨ z) ∧ (¬x ∨ ¬y) ∧ (¬y ∨ ¬z) ∧ (¬x ∨ ¬z)',
  '(x) ∧ (¬x)',
  '(x ∨ y) ∧ (x ∨ ¬y) ∧ (¬x ∨ y) ∧ (¬x ∨ ¬y)',
  '(a ∨ b ∨ c) ∧ (¬a ∨ d ∨ e) ∧ (¬b ∨ ¬d ∨ f) ∧ (¬c ∨ ¬e ∨ ¬f) ∧ (a ∨ ¬f ∨ d)',
]

test('the CLIQUE reduction preserves the answer and maps solutions both ways', () => {
  for (const text of SAMPLES) {
    const formula = parse(text)
    const sat = bruteForceSat(formula).assignment
    const { graph, k } = cnfToClique(formula)
    const { clique } = findClique(graph, k)
    assert.equal(Boolean(clique), Boolean(sat), text)
    if (sat) {
      const mapped = assignmentToClique(formula, sat)
      assert.ok(mapped.length === k && isClique(graph, mapped), text)
      assert.ok(formulaTrue(formula, cliqueToAssignment(formula, graph, clique)), text)
    }
  }
})

test('the VERTEX-COVER reduction preserves the answer and maps solutions both ways', () => {
  for (const text of SAMPLES) {
    const formula = parse(text)
    const sat = bruteForceSat(formula).assignment
    const { graph, k } = cnfToVertexCover(formula)
    assert.equal(k, formula.variables.length + 2 * formula.clauses.length)
    const { cover } = findVertexCover(graph, k)
    assert.equal(Boolean(cover), Boolean(sat), text)
    if (sat) {
      const mapped = assignmentToCover(formula, sat)
      assert.ok(mapped.length === k && isVertexCover(graph, mapped), text)
      assert.ok(formulaTrue(formula, coverToAssignment(formula, cover)), text)
    }
  }
})

test('bruteForceSat counts the assignments it tried', () => {
  assert.equal(bruteForceSat(parse('(x) ∧ (¬x)')).tried, 2)
  assert.equal(bruteForceSat(parse('(x ∨ y) ∧ (x ∨ ¬y) ∧ (¬x ∨ y) ∧ (¬x ∨ ¬y)')).assignment, null)
})
