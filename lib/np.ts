/**
 * Sipser chapter 7.4 and 7.5: 3SAT and the two polynomial-time reductions from it that the NP
 * lesson and the reduction lab show, 3SAT ≤p CLIQUE (Theorem 7.32) and 3SAT ≤p VERTEX-COVER
 * (Theorem 7.44). Each reduction builds the graph, maps a satisfying assignment to a solution, and
 * maps a solution back to an assignment. The searches are plain exponential backtracking, which is
 * the point: nobody knows a fast one.
 */

export type Literal = { variable: string; negated: boolean }
export type Clause = Literal[]
export type Formula = { clauses: Clause[]; variables: string[] }
export type Assignment = Record<string, boolean>

export const NP_LIMITS = { variables: 6, clauses: 6 }

export const literalText = (literal: Literal) => `${literal.negated ? '¬' : ''}${literal.variable}`
export const clauseText = (clause: Clause) => `(${clause.map(literalText).join(' ∨ ')})`
export const formulaText = (formula: Formula) => formula.clauses.map(clauseText).join(' ∧ ')

/**
 * Reads a CNF formula such as `(x ∨ y ∨ ¬z) ∧ (¬x ∨ z)`. ASCII works too: `|` or `v` or `or` for ∨,
 * `&` or `^` or `and` for ∧, and `~`, `!` or `not` for ¬. Clauses have one to three literals.
 */
export function parseCnf(text: string): { ok: true; formula: Formula } | { ok: false; message: string } {
  const source = text.trim()
  if (!source) return { ok: false, message: 'Type a formula, like (x ∨ y ∨ ¬z) ∧ (¬x ∨ ¬y ∨ z).' }
  const normalized = source
    .replace(/∧|&&?|\^|\band\b/gi, ' ∧ ')
    .replace(/∨|\|\|?|\bor\b/gi, ' ∨ ')
    .replace(/¬|~|!|\bnot\b/gi, ' ¬')
  const parts = normalized.split('∧').map(part => part.trim().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')'))
  if (parts.some(part => part === '')) return { ok: false, message: 'There is an ∧ with no clause next to it.' }
  const clauses: Clause[] = []
  for (const part of parts) {
    const inner = part.replace(/^\(\s*/, '').replace(/\s*\)$/, '')
    if (/[()]/.test(inner) || part.startsWith('(') !== part.endsWith(')')) return { ok: false, message: `Check the brackets in “${part}”. Write each clause as (a ∨ b ∨ c).` }
    // A lone "v" between two literals also means ∨.
    const pieces = inner.split(/∨|\s+v\s+/).map(piece => piece.trim())
    if (pieces.some(piece => piece === '')) return { ok: false, message: `“${part}” has an ∨ with no literal next to it.` }
    const clause: Clause = []
    for (const piece of pieces) {
      const match = /^(¬\s*)*([A-Za-z][A-Za-z0-9_]*)$/.exec(piece.replace(/\s+/g, ''))
      if (!match) return { ok: false, message: `“${piece}” isn’t a literal. Use a variable name like x or x1, with ¬ in front to negate it.` }
      const negations = (piece.match(/¬/g) ?? []).length
      clause.push({ variable: match[2], negated: negations % 2 === 1 })
    }
    if (clause.length > 3) return { ok: false, message: `${clauseText(clause)} has ${clause.length} literals. In 3-CNF each clause has at most 3.` }
    clauses.push(clause)
  }
  const variables = [...new Set(clauses.flat().map(literal => literal.variable))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  if (clauses.length > NP_LIMITS.clauses) return { ok: false, message: `Keep it to ${NP_LIMITS.clauses} clauses so the graphs stay readable.` }
  if (variables.length > NP_LIMITS.variables) return { ok: false, message: `Keep it to ${NP_LIMITS.variables} variables so the graphs stay readable.` }
  return { ok: true, formula: { clauses, variables } }
}

export const literalTrue = (literal: Literal, assignment: Assignment) => (assignment[literal.variable] ?? false) !== literal.negated
export const clauseTrue = (clause: Clause, assignment: Assignment) => clause.some(literal => literalTrue(literal, assignment))
export const formulaTrue = (formula: Formula, assignment: Assignment) => formula.clauses.every(clause => clauseTrue(clause, assignment))

/** Tries all 2ⁿ assignments in order and returns the first that satisfies the formula, with how many it tried. */
export function bruteForceSat(formula: Formula): { assignment: Assignment | null; tried: number } {
  const n = formula.variables.length
  for (let bits = 0; bits < 2 ** n; bits++) {
    const assignment: Assignment = Object.fromEntries(formula.variables.map((variable, at) => [variable, Boolean(bits & (1 << (n - 1 - at)))]))
    if (formulaTrue(formula, assignment)) return { assignment, tried: bits + 1 }
  }
  return { assignment: null, tried: 2 ** n }
}

// ---------- Graphs ----------

export type NpNode = { id: string; label: string; x: number; y: number; group: string; literal: Literal }
export type NpGraph = { nodes: NpNode[]; edges: [string, string][] }

const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`
export const edgeSet = (graph: NpGraph) => new Set(graph.edges.map(([a, b]) => edgeKey(a, b)))
const contradicts = (a: Literal, b: Literal) => a.variable === b.variable && a.negated !== b.negated

// ---------- 3SAT ≤p CLIQUE ----------

/**
 * One node per literal occurrence, grouped by clause. Two nodes are joined unless they are in the
 * same clause or are x and ¬x. The formula is satisfiable exactly when the graph has a clique of
 * size k = the number of clauses.
 */
export function cnfToClique(formula: Formula): { graph: NpGraph; k: number } {
  const m = formula.clauses.length
  const nodes: NpNode[] = []
  // Clause groups sit around a circle; a clause's literals sit side by side along it.
  const radius = m <= 2 ? 110 : m === 3 ? 140 : 170
  formula.clauses.forEach((clause, c) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * c) / m
    const cx = Math.cos(angle) * radius, cy = Math.sin(angle) * radius
    clause.forEach((literal, at) => {
      const offset = (at - (clause.length - 1) / 2) * 50
      nodes.push({
        id: `c${c}l${at}`, label: literalText(literal), group: `c${c}`, literal,
        x: Math.round(cx - Math.sin(angle) * offset), y: Math.round(cy + Math.cos(angle) * offset),
      })
    })
  })
  const edges: [string, string][] = []
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i].group !== nodes[j].group && !contradicts(nodes[i].literal, nodes[j].literal)) edges.push([nodes[i].id, nodes[j].id])
  }
  return { graph: { nodes, edges }, k: m }
}

export function isClique(graph: NpGraph, chosen: string[]): boolean {
  const edges = edgeSet(graph)
  for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) if (!edges.has(edgeKey(chosen[i], chosen[j]))) return false
  return true
}

/** Backtracking search for a clique of size k. Returns the clique (or null) and how many partial cliques it extended. */
export function findClique(graph: NpGraph, k: number): { clique: string[] | null; explored: number } {
  const edges = edgeSet(graph)
  const ids = graph.nodes.map(node => node.id)
  let explored = 0
  const grow = (chosen: string[], from: number): string[] | null => {
    explored++
    if (chosen.length === k) return chosen
    for (let at = from; at <= ids.length - (k - chosen.length); at++) {
      const id = ids[at]
      if (chosen.every(other => edges.has(edgeKey(id, other)))) {
        const found = grow([...chosen, id], at + 1)
        if (found) return found
      }
    }
    return null
  }
  return { clique: k === 0 ? [] : grow([], 0), explored }
}

/** A satisfying assignment picks one true literal in each clause; those nodes form a k-clique. */
export function assignmentToClique(formula: Formula, assignment: Assignment): string[] | null {
  const chosen: string[] = []
  for (const [c, clause] of formula.clauses.entries()) {
    const at = clause.findIndex(literal => literalTrue(literal, assignment))
    if (at < 0) return null
    chosen.push(`c${c}l${at}`)
  }
  return chosen
}

/**
 * A k-clique has one node in each clause and never both x and ¬x, so making its literals true is
 * consistent and satisfies every clause. Variables the clique doesn't mention are set to false.
 */
export function cliqueToAssignment(formula: Formula, graph: NpGraph, clique: string[]): Assignment {
  const assignment: Assignment = Object.fromEntries(formula.variables.map(variable => [variable, false]))
  for (const id of clique) {
    const node = graph.nodes.find(item => item.id === id)
    if (node) assignment[node.literal.variable] = !node.literal.negated
  }
  return assignment
}

// ---------- 3SAT ≤p VERTEX-COVER ----------

/**
 * For each variable x, an edge x — ¬x. For each clause, a triangle of its three literals (a clause
 * with fewer literals repeats its last one), and each triangle node is joined to the matching node
 * of the variable edges. The formula is satisfiable exactly when the graph has a vertex cover of
 * size k = (number of variables) + 2 × (number of clauses).
 */
export function cnfToVertexCover(formula: Formula): { graph: NpGraph; k: number } {
  const { variables, clauses } = formula
  const nodes: NpNode[] = []
  const edges: [string, string][] = []
  const vGap = 104, cGap = 112
  const vWidth = (variables.length - 1) * vGap, cWidth = (clauses.length - 1) * cGap
  variables.forEach((variable, at) => {
    const x = Math.round(at * vGap - vWidth / 2)
    nodes.push({ id: `v:${variable}`, label: variable, group: `v:${variable}`, literal: { variable, negated: false }, x: x - 26, y: 0 })
    nodes.push({ id: `v:¬${variable}`, label: `¬${variable}`, group: `v:${variable}`, literal: { variable, negated: true }, x: x + 26, y: 0 })
    edges.push([`v:${variable}`, `v:¬${variable}`])
  })
  clauses.forEach((clause, c) => {
    const three = [0, 1, 2].map(at => clause[Math.min(at, clause.length - 1)])
    const cx = Math.round(c * cGap - cWidth / 2)
    const spots = [[cx, 150], [cx - 30, 205], [cx + 30, 205]]
    three.forEach((literal, at) => {
      const id = `c${c}l${at}`
      nodes.push({ id, label: literalText(literal), group: `c${c}`, literal, x: spots[at][0], y: spots[at][1] })
      edges.push([id, `v:${literalText(literal)}`])
    })
    edges.push([`c${c}l0`, `c${c}l1`], [`c${c}l1`, `c${c}l2`], [`c${c}l0`, `c${c}l2`])
  })
  return { graph: { nodes, edges }, k: variables.length + 2 * clauses.length }
}

export function isVertexCover(graph: NpGraph, chosen: string[]): boolean {
  const set = new Set(chosen)
  return graph.edges.every(([a, b]) => set.has(a) || set.has(b))
}

/** Branching search: take an uncovered edge, one of its two ends must be in the cover. At most 2ᵏ branches. */
export function findVertexCover(graph: NpGraph, k: number): { cover: string[] | null; explored: number } {
  let explored = 0
  const search = (chosen: Set<string>, budget: number): Set<string> | null => {
    explored++
    const open = graph.edges.find(([a, b]) => !chosen.has(a) && !chosen.has(b))
    if (!open) return chosen
    if (budget === 0) return null
    for (const end of open) {
      const found = search(new Set([...chosen, end]), budget - 1)
      if (found) return found
    }
    return null
  }
  const found = search(new Set(), k)
  return { cover: found ? graph.nodes.map(node => node.id).filter(id => found.has(id)) : null, explored }
}

/** The true literal of each variable edge, plus the two triangle nodes other than one true literal per clause. */
export function assignmentToCover(formula: Formula, assignment: Assignment): string[] | null {
  const cover: string[] = formula.variables.map(variable => `v:${assignment[variable] ? '' : '¬'}${variable}`)
  for (const [c, clause] of formula.clauses.entries()) {
    const three = [0, 1, 2].map(at => clause[Math.min(at, clause.length - 1)])
    const keep = three.findIndex(literal => literalTrue(literal, assignment))
    if (keep < 0) return null
    for (let at = 0; at < 3; at++) if (at !== keep) cover.push(`c${c}l${at}`)
  }
  return cover
}

/**
 * A cover of size exactly k must take one end of every variable edge and two corners of every
 * triangle. Making the variable ends it took true satisfies every clause: the triangle corner it
 * left out has its edge to the variable gadget covered from the gadget side.
 */
export function coverToAssignment(formula: Formula, cover: string[]): Assignment {
  const set = new Set(cover)
  return Object.fromEntries(formula.variables.map(variable => [variable, !set.has(`v:¬${variable}`)]))
}
