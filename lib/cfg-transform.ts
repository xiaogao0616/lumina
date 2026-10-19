import { analyzeGrammar, generateStrings, isNonterminal, minimumLengths, parseTrees, type Grammar, type ParseTree, type Production } from './cfg'

/** The grammar as text the CFG tab can read back: one line per nonterminal, start symbol first. */
export function formatGrammar(grammar: Grammar): string {
  const heads = [grammar.start, ...grammar.nonterminals.filter(symbol => symbol !== grammar.start)]
  return heads
    .map(head => [head, grammar.productions.filter(production => production.head === head)] as const)
    .filter(([, productions]) => productions.length)
    .map(([head, productions]) => `${head} → ${productions.map(production => production.body.length ? production.body.join('') : 'ε').join(' | ')}`)
    .join('\n')
}

const bodyKey = (production: Production) => `${production.head}→${production.body.join('\u0001')}`

function dedupe(productions: Production[]): Production[] {
  const seen = new Set<string>()
  return productions.filter(production => !seen.has(bodyKey(production)) && !!seen.add(bodyKey(production)))
}

function rebuild(start: string, productions: Production[]): Grammar {
  const nonterminals: string[] = [start]
  const terminals: string[] = []
  for (const production of productions) {
    if (!nonterminals.includes(production.head)) nonterminals.push(production.head)
    for (const symbol of production.body) {
      const list = isNonterminal(symbol) ? nonterminals : terminals
      if (!list.includes(symbol)) list.push(symbol)
    }
  }
  return { start, nonterminals, terminals, productions }
}

/** Keeps only nonterminals that derive some string and are reachable from the start. */
function withoutUselessSymbols(grammar: Grammar): Grammar {
  const lengths = minimumLengths(grammar)
  const productive = (symbol: string) => !isNonterminal(symbol) || (lengths.get(symbol) ?? Infinity) < Infinity
  const kept = grammar.productions.filter(production => productive(production.head) && production.body.every(productive))
  const reachable = new Set([grammar.start])
  for (let changed = true; changed;) {
    changed = false
    for (const production of kept) {
      if (!reachable.has(production.head)) continue
      for (const symbol of production.body) if (isNonterminal(symbol) && !reachable.has(symbol)) { reachable.add(symbol); changed = true }
    }
  }
  return rebuild(grammar.start, kept.filter(production => reachable.has(production.head)))
}

export type CnfStep = { title: string; grammar: string }
export type CnfResult = { ok: true; grammar: Grammar; text: string; steps: CnfStep[] } | { ok: false; message: string }

/**
 * Converts to Chomsky normal form the way Sipser does: a new start symbol, then remove ε-rules,
 * remove unit rules, and finally give every terminal in a long rule its own nonterminal and split
 * long rules into chains of two. Useless rules are dropped along the way. New nonterminals take
 * letters the grammar doesn't use yet (a terminal's own capital when it's free, like A → a), since
 * a CFG tab only knows single-letter nonterminals; a grammar that would need more than 26 says so.
 */
export function toChomskyNormalForm(input: Grammar): CnfResult {
  const steps: CnfStep[] = []
  const free = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').filter(letter => !input.nonterminals.includes(letter))
  const fresh = (preferred?: string): string | null => {
    const pick = preferred && free.includes(preferred) ? preferred : free[0]
    if (!pick) return null
    free.splice(free.indexOf(pick), 1)
    return pick
  }
  const tooMany = { ok: false as const, message: 'This grammar needs more than 26 nonterminals in Chomsky normal form, and a CFG tab only has the letters A–Z.' }

  let grammar = withoutUselessSymbols(input)
  if (!grammar.productions.length) return { ok: false, message: `${input.start} never derives a string of terminals, so the language is empty and there is nothing to convert.` }

  // 1. A new start symbol, so the start never appears on a right side.
  let start = grammar.start
  if (grammar.productions.some(production => production.body.includes(start))) {
    const newStart = fresh(start === 'S' ? 'Z' : 'S')
    if (!newStart) return tooMany
    grammar = rebuild(newStart, [{ head: newStart, body: [start] }, ...grammar.productions])
    start = newStart
    steps.push({ title: `Add a new start symbol ${start} → ${input.start}`, grammar: formatGrammar(grammar) })
  }

  // 2. Remove ε-rules: copy each rule once per way of leaving out nullable symbols.
  const nullable = new Set(analyzeGrammar(grammar).nullable)
  if (nullable.size) {
    const expanded: Production[] = []
    for (const production of grammar.productions) {
      let bodies: string[][] = [[]]
      for (const symbol of production.body) bodies = bodies.flatMap(body => nullable.has(symbol) ? [body, [...body, symbol]] : [[...body, symbol]])
      // An empty copy is dropped, and so is a copy that became A → A, which says nothing.
      for (const body of bodies) if (body.length && !(body.length === 1 && body[0] === production.head)) expanded.push({ head: production.head, body })
    }
    if (nullable.has(start)) expanded.push({ head: start, body: [] })
    grammar = rebuild(start, dedupe(expanded))
    steps.push({ title: `Remove ε-rules (nullable: ${[...nullable].join(', ')})`, grammar: formatGrammar(grammar) })
  }

  // 3. Remove unit rules A → B by giving A everything B can do directly.
  const isUnit = (production: Production) => production.body.length === 1 && isNonterminal(production.body[0])
  if (grammar.productions.some(isUnit)) {
    const replaced: Production[] = []
    for (const head of grammar.nonterminals) {
      const closure = new Set([head])
      for (let changed = true; changed;) {
        changed = false
        for (const production of grammar.productions) {
          if (isUnit(production) && closure.has(production.head) && !closure.has(production.body[0])) { closure.add(production.body[0]); changed = true }
        }
      }
      for (const production of grammar.productions) {
        if (closure.has(production.head) && !isUnit(production)) replaced.push({ head, body: production.body })
      }
    }
    grammar = withoutUselessSymbols(rebuild(start, dedupe(replaced)))
    steps.push({ title: 'Remove unit rules', grammar: formatGrammar(grammar) })
  }

  // 4. Terminals inside long rules get their own nonterminal.
  const terminalVar = new Map<string, string>()
  const extra: Production[] = []
  let productions = grammar.productions
  if (productions.some(production => production.body.length >= 2 && production.body.some(symbol => !isNonterminal(symbol)))) {
    for (const production of productions) {
      if (production.body.length < 2) continue
      for (const symbol of production.body) {
        if (isNonterminal(symbol) || terminalVar.has(symbol)) continue
        // Reuse an existing A → a if the grammar already has exactly that.
        const existing = grammar.nonterminals.find(head => {
          const rules = productions.filter(item => item.head === head)
          return head !== start && rules.length === 1 && rules[0].body.length === 1 && rules[0].body[0] === symbol
        })
        const name = existing ?? fresh(symbol.toUpperCase())
        if (!name) return tooMany
        terminalVar.set(symbol, name)
        if (!existing) extra.push({ head: name, body: [symbol] })
      }
    }
    productions = [...productions.map(production => production.body.length < 2 ? production
      : { head: production.head, body: production.body.map(symbol => terminalVar.get(symbol) ?? symbol) }), ...extra]
    grammar = rebuild(start, productions)
    steps.push({ title: `Give terminals their own nonterminals (${[...terminalVar].map(([terminal, name]) => `${name} → ${terminal}`).join(', ')})`, grammar: formatGrammar(grammar) })
  }

  // 5. Split rules longer than two into chains; the same tail always gets the same nonterminal.
  if (productions.some(production => production.body.length > 2)) {
    const tailVar = new Map<string, string>()
    const split: Production[] = []
    const added: Production[] = []
    const nameFor = (tail: string[]): string | null => {
      const tailKey = tail.join('')
      if (tailVar.has(tailKey)) return tailVar.get(tailKey)!
      const name = fresh()
      if (!name) return null
      tailVar.set(tailKey, name)
      if (tail.length === 2) added.push({ head: name, body: tail })
      else {
        const rest = nameFor(tail.slice(1))
        if (!rest) return null
        added.push({ head: name, body: [tail[0], rest] })
      }
      return name
    }
    for (const production of productions) {
      if (production.body.length <= 2) { split.push(production); continue }
      const rest = nameFor(production.body.slice(1))
      if (!rest) return tooMany
      split.push({ head: production.head, body: [production.body[0], rest] })
    }
    grammar = rebuild(start, [...split, ...added])
    steps.push({ title: 'Split long rules into pairs', grammar: formatGrammar(grammar) })
  }

  return { ok: true, grammar, text: formatGrammar(grammar), steps }
}

/** Whether every rule is A → BC, A → a, or S → ε for the start symbol S that appears on no right side. */
export function isChomskyNormalForm(grammar: Grammar): boolean {
  const startOnRight = grammar.productions.some(production => production.body.includes(grammar.start))
  return grammar.productions.every(production =>
    (production.body.length === 2 && production.body.every(symbol => isNonterminal(symbol) && symbol !== grammar.start))
    || (production.body.length === 1 && !isNonterminal(production.body[0]))
    || (production.body.length === 0 && production.head === grammar.start && !startOnRight))
}

export type AmbiguityResult =
  | { status: 'ambiguous'; input: string; trees: [ParseTree, ParseTree] }
  | { status: 'none-found'; checked: number; maxLength: number }

/**
 * Looks for a string with two different parse trees, trying the grammar's own strings shortest
 * first. Ambiguity is undecidable in general, so "none found" only covers the strings checked.
 */
export function findAmbiguity(grammar: Grammar, maxLength = 10, maxStrings = 400): AmbiguityResult {
  const candidates = generateStrings(grammar, maxStrings, maxLength)
  for (const input of candidates) {
    const { trees } = parseTrees(grammar, input, 2)
    if (trees.length >= 2) return { status: 'ambiguous', input, trees: [trees[0], trees[1]] }
  }
  return { status: 'none-found', checked: candidates.length, maxLength: candidates.length ? Math.min(maxLength, Math.max(...candidates.map(word => Array.from(word).length))) : maxLength }
}
