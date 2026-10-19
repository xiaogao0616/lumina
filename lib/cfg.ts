import { SOURCE_COLORS, type AutomatonGraph } from './automaton-graph'
import { formatPdaRule } from './pda'

/**
 * Context-free grammars written as text, one or more rules per line:
 *
 *   S → aSb | ε
 *   S -> T | x        (-> and ::= work too; a second line for S adds more alternatives)
 *
 * Nonterminals are single uppercase letters A–Z; every other visible character is a terminal, and
 * spaces are ignored. ε (or an empty alternative) is the empty string. The first rule's left side
 * is the start symbol. Lines starting with # or // are comments.
 */

export type Production = { head: string; body: string[] }
export type Grammar = { start: string; nonterminals: string[]; terminals: string[]; productions: Production[] }
export type GrammarParse = { ok: true; grammar: Grammar } | { ok: false; message: string; line: number }

const EPSILON = 'ε'
export const isNonterminal = (symbol: string) => /^[A-Z]$/.test(symbol)

export function parseGrammar(text: string): GrammarParse {
  const productions: Production[] = []
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const arrow = line.match(/→|->|::=/)
    if (!arrow || arrow.index === undefined) return { ok: false, line: index + 1, message: `Line ${index + 1} needs an arrow, like S → aSb.` }
    const head = line.slice(0, arrow.index).trim()
    if (!isNonterminal(head)) return { ok: false, line: index + 1, message: `Line ${index + 1}: the left side must be one uppercase letter (A–Z), not "${head || 'nothing'}".` }
    for (const alternative of line.slice(arrow.index + arrow[0].length).split('|')) {
      const body = Array.from(alternative.replace(/\s+/g, '').normalize('NFC')).filter(symbol => symbol !== EPSILON)
      const key = `${head}→${body.join('\u0001')}`
      if (seen.has(key)) continue
      seen.add(key)
      productions.push({ head, body })
    }
  }
  if (!productions.length) return { ok: false, line: 1, message: 'Write at least one rule, like S → aSb | ε.' }
  const nonterminals: string[] = []
  const terminals: string[] = []
  const add = (list: string[], symbol: string) => { if (!list.includes(symbol)) list.push(symbol) }
  for (const production of productions) {
    add(nonterminals, production.head)
    for (const symbol of production.body) add(isNonterminal(symbol) ? nonterminals : terminals, symbol)
  }
  return { ok: true, grammar: { start: productions[0].head, nonterminals, terminals, productions } }
}

export function formatProduction(production: Production): string {
  return `${production.head} → ${production.body.length ? production.body.join('') : EPSILON}`
}

/** Shortest terminal string length each nonterminal can derive; Infinity when it derives none. */
export function minimumLengths(grammar: Grammar): Map<string, number> {
  const lengths = new Map(grammar.nonterminals.map(symbol => [symbol, Infinity]))
  const lengthOf = (symbol: string) => isNonterminal(symbol) ? lengths.get(symbol) ?? Infinity : 1
  for (let changed = true; changed;) {
    changed = false
    for (const production of grammar.productions) {
      const total = production.body.reduce((sum, symbol) => sum + lengthOf(symbol), 0)
      if (total < (lengths.get(production.head) ?? Infinity)) { lengths.set(production.head, total); changed = true }
    }
  }
  return lengths
}

export type GrammarReport = {
  /** Used on a right side but never given a rule. */
  undefinedSymbols: string[]
  /** Can't derive any string of terminals, so they never help a derivation finish. */
  nonProductive: string[]
  /** No derivation from the start symbol ever uses them. */
  unreachable: string[]
  nullable: string[]
}

export function analyzeGrammar(grammar: Grammar): GrammarReport {
  const heads = new Set(grammar.productions.map(production => production.head))
  const lengths = minimumLengths(grammar)
  const reachable = new Set([grammar.start])
  const pending = [grammar.start]
  while (pending.length) {
    const symbol = pending.pop()!
    for (const production of grammar.productions) {
      if (production.head !== symbol) continue
      for (const next of production.body) if (isNonterminal(next) && !reachable.has(next)) { reachable.add(next); pending.push(next) }
    }
  }
  return {
    undefinedSymbols: grammar.nonterminals.filter(symbol => !heads.has(symbol)),
    nonProductive: grammar.nonterminals.filter(symbol => heads.has(symbol) && lengths.get(symbol) === Infinity),
    unreachable: grammar.nonterminals.filter(symbol => !reachable.has(symbol)),
    nullable: grammar.nonterminals.filter(symbol => lengths.get(symbol) === 0),
  }
}

export type ParseTree = { symbol: string; children: ParseTree[] }
export type MembershipResult =
  | { status: 'accepted'; message: string; tree: ParseTree; derivation: string[] }
  | { status: 'rejected' | 'error'; message: string }

/**
 * Earley parsing: handles every CFG, including ε-rules and left recursion, without first
 * converting to Chomsky normal form. Nullable nonterminals are skipped over at prediction time
 * (Aycock & Horspool) so an ε-derivation completed earlier in the same set isn't missed.
 */
export function testMembership(grammar: Grammar, input: string): MembershipResult {
  const chars = Array.from(input)
  const nullable = new Set(analyzeGrammar(grammar).nullable)
  const byHead = new Map<string, number[]>()
  grammar.productions.forEach((production, index) => byHead.set(production.head, [...(byHead.get(production.head) ?? []), index]))

  type Item = { production: number; dot: number; origin: number }
  const sets: Item[][] = Array.from({ length: chars.length + 1 }, () => [])
  const keys: Set<string>[] = Array.from({ length: chars.length + 1 }, () => new Set())
  // Completed spans: `${nonterminal}@${start}` → every end where it finishes.
  const spans = new Map<string, Set<number>>()
  const add = (position: number, item: Item) => {
    const key = `${item.production}.${item.dot}.${item.origin}`
    if (keys[position].has(key)) return
    keys[position].add(key)
    sets[position].push(item)
  }
  for (const production of byHead.get(grammar.start) ?? []) add(0, { production, dot: 0, origin: 0 })
  for (let position = 0; position <= chars.length; position++) {
    const set = sets[position]
    for (let index = 0; index < set.length; index++) {
      const item = set[index]
      const production = grammar.productions[item.production]
      const next = production.body[item.dot]
      if (next === undefined) {
        const spanKey = `${production.head}@${item.origin}`
        const ends = spans.get(spanKey) ?? new Set<number>()
        ends.add(position)
        spans.set(spanKey, ends)
        for (const waiting of sets[item.origin]) {
          if (grammar.productions[waiting.production].body[waiting.dot] === production.head) add(position, { ...waiting, dot: waiting.dot + 1 })
        }
      } else if (isNonterminal(next)) {
        for (const candidate of byHead.get(next) ?? []) add(position, { production: candidate, dot: 0, origin: position })
        if (nullable.has(next)) add(position, { ...item, dot: item.dot + 1 })
      } else if (position < chars.length && chars[position] === next) {
        add(position + 1, { ...item, dot: item.dot + 1 })
      }
    }
    if (position < chars.length && !sets[position + 1].length) {
      return { status: 'rejected', message: `No derivation can produce character ${position + 1} (${JSON.stringify(chars[position])}) at that spot.` }
    }
  }
  if (!spans.get(`${grammar.start}@0`)?.has(chars.length)) {
    return { status: 'rejected', message: `${grammar.start} can't derive ${chars.length ? 'this whole string' : 'the empty string'}. Every character was matched by some prefix, but no derivation finishes here.` }
  }
  const tree = buildTree(grammar, chars, spans)
  if (!tree) return { status: 'accepted', message: `${grammar.start} derives this string. The parse tree was too large to rebuild.`, tree: { symbol: grammar.start, children: [] }, derivation: [] }
  const derivation = leftmostDerivation(tree)
  return { status: 'accepted', tree, derivation, message: `${grammar.start} derives ${chars.length ? `all ${chars.length} characters` : 'the empty string'} in ${derivation.length - 1} step${derivation.length === 2 ? '' : 's'}.` }
}

/** Recovers one parse tree from Earley's completed spans. Cycles (A → A, or ε-loops) are cut. */
function buildTree(grammar: Grammar, chars: string[], spans: Map<string, Set<number>>): ParseTree | null {
  const memo = new Map<string, ParseTree | null>()
  const active = new Set<string>()
  let budget = 200000
  let cycleHit = false
  const build = (symbol: string, start: number, end: number): ParseTree | null => {
    const key = `${symbol}@${start}-${end}`
    if (memo.has(key)) return memo.get(key)!
    if (active.has(key)) { cycleHit = true; return null }
    if (!spans.get(`${symbol}@${start}`)?.has(end) || --budget < 0) return null
    active.add(key)
    const hitBefore = cycleHit
    cycleHit = false
    let result: ParseTree | null = null
    for (const production of grammar.productions) {
      if (production.head !== symbol) continue
      const children = match(production.body, 0, start, end)
      if (children) { result = { symbol, children: children.length ? children : [{ symbol: EPSILON, children: [] }] }; break }
    }
    active.delete(key)
    // A failure caused by cutting a cycle might succeed when reached another way, so only cache it otherwise.
    if (result || !cycleHit) memo.set(key, result)
    cycleHit = cycleHit || hitBefore
    return result
  }
  const match = (body: string[], index: number, position: number, end: number): ParseTree[] | null => {
    if (index === body.length) return position === end ? [] : null
    const symbol = body[index]
    if (!isNonterminal(symbol)) {
      if (chars[position] !== symbol || position >= end) return null
      const rest = match(body, index + 1, position + 1, end)
      return rest && [{ symbol, children: [] }, ...rest]
    }
    for (const stop of [...(spans.get(`${symbol}@${position}`) ?? [])].sort((a, b) => a - b)) {
      if (stop > end) continue
      const child = build(symbol, position, stop)
      if (!child) continue
      const rest = match(body, index + 1, stop, end)
      if (rest) return [child, ...rest]
    }
    return null
  }
  return build(grammar.start, 0, chars.length)
}

/** Sentential forms of the leftmost derivation that the tree describes, starting from the start symbol. */
export function leftmostDerivation(tree: ParseTree, maxSteps = 400): string[] {
  let frontier: ParseTree[] = [tree]
  const show = (nodes: ParseTree[]) => nodes.map(node => node.symbol).join('') || EPSILON
  const forms = [show(frontier)]
  for (let step = 0; step < maxSteps; step++) {
    const index = frontier.findIndex(node => isNonterminal(node.symbol) && node.children.length)
    if (index === -1) break
    const expansion = frontier[index].children.filter(child => child.symbol !== EPSILON)
    frontier = [...frontier.slice(0, index), ...expansion, ...frontier.slice(index + 1)]
    forms.push(show(frontier))
  }
  return forms
}

/**
 * The same language minus ε, with no ε-rules: each rule is copied once for every way of dropping
 * nullable symbols from its right side, and empty right sides are left out. Every nonterminal then
 * derives at least one character, so a sentential form never has more symbols than the string it
 * becomes, which keeps the search in generateStrings finite at each length.
 */
function withoutEpsilonRules(grammar: Grammar): Grammar {
  const nullable = new Set(analyzeGrammar(grammar).nullable)
  const productions: Production[] = []
  const seen = new Set<string>()
  for (const production of grammar.productions) {
    let bodies: string[][] = [[]]
    for (const symbol of production.body) {
      bodies = bodies.flatMap(body => nullable.has(symbol) ? [body, [...body, symbol]] : [[...body, symbol]])
      if (bodies.length > 1024) break // a pathological right side; the copies already made still help
    }
    for (const body of bodies) {
      const key = `${production.head}→${body.join('\u0001')}`
      if (!body.length || seen.has(key)) continue
      seen.add(key)
      productions.push({ head: production.head, body })
    }
  }
  return { ...grammar, productions }
}

/**
 * Up to `count` distinct strings the grammar generates, shortest first and alphabetical within a
 * length. Sentential forms are expanded leftmost-first in order of the shortest string they could
 * still become, so all strings of one length are found before any longer one.
 */
export function generateStrings(grammar: Grammar, count: number, maxLength = 20): string[] {
  const results: string[] = analyzeGrammar(grammar).nullable.includes(grammar.start) ? [''] : []
  const reduced = withoutEpsilonRules(grammar)
  const lengths = minimumLengths(reduced)
  const bound = (form: string[]) => form.reduce((sum, symbol) => sum + (isNonterminal(symbol) ? lengths.get(symbol) ?? Infinity : 1), 0)
  const buckets: string[][][] = Array.from({ length: maxLength + 1 }, () => [])
  const seen = new Set<string>()
  const push = (form: string[]) => {
    const value = bound(form)
    if (value > maxLength) return
    const key = form.join('\u0001')
    if (seen.has(key)) return
    seen.add(key)
    buckets[value].push(form)
  }
  push([reduced.start])
  let budget = 200000
  for (let length = 1; length <= maxLength && results.length < count && budget > 0; length++) {
    const bucket = buckets[length]
    // An ambiguous grammar reaches the same string through different forms; list it once.
    const words = new Set<string>()
    for (let index = 0; index < bucket.length && budget-- > 0; index++) {
      const form = bucket[index]
      const at = form.findIndex(isNonterminal)
      if (at === -1) { words.add(form.join('')); continue }
      for (const production of reduced.productions) {
        if (production.head === form[at]) push([...form.slice(0, at), ...production.body, ...form.slice(at + 1)])
      }
    }
    results.push(...[...words].sort().slice(0, count - results.length))
  }
  return results
}

/**
 * The textbook CFG → PDA construction: push $ and the start symbol, then in one looping state
 * either replace a nonterminal on top with one of its right sides, or match a terminal on top
 * against the input. Popping $ moves to the accepting state.
 */
export function cfgToPda(grammar: Grammar): AutomatonGraph {
  const used = new Set([...grammar.terminals, ...grammar.nonterminals])
  const bottom = ['$', '⊥', '#', '%'].find(symbol => !used.has(symbol)) ?? '⊥'
  const loop = [
    ...grammar.productions.map(production => formatPdaRule({ input: '', pop: production.head, push: production.body.join('') })),
    ...grammar.terminals.map(terminal => formatPdaRule({ input: terminal, pop: terminal, push: '' })),
  ]
  return {
    states: [
      { id: 'pda-start', label: 'start₀', kind: 'start', position: { x: 120, y: 220 }, color: SOURCE_COLORS[0] },
      { id: 'pda-loop', label: 'q₀', kind: 'state', position: { x: 400, y: 220 }, color: SOURCE_COLORS[1] },
      { id: 'pda-accept', label: 'accept₀', kind: 'accept', position: { x: 680, y: 220 }, color: SOURCE_COLORS[2] },
    ],
    transitions: [
      { id: 'pda-push-start', source: 'pda-start', target: 'pda-loop', symbols: [formatPdaRule({ input: '', pop: '', push: grammar.start + bottom })] },
      { id: 'pda-expand', source: 'pda-loop', target: 'pda-loop', symbols: loop },
      { id: 'pda-finish', source: 'pda-loop', target: 'pda-accept', symbols: [formatPdaRule({ input: '', pop: bottom, push: '' })] },
    ],
    symbols: [...grammar.terminals],
  }
}
