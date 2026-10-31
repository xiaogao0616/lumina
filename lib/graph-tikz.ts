import { isAcceptingState, type AutomatonGraph } from './automaton-graph'
import { parsePdaRule } from './pda'
import { parseTmRule } from './turing'
import type { Grammar } from './cfg'

/**
 * LaTeX for homework: a TikZ picture of an automaton (using the `automata` library) and an
 * align* block for a grammar. Positions come from the canvas, so the picture matches the layout
 * on screen.
 */

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉'
const MATH_SYMBOLS: Record<string, string> = {
  'ε': '\\varepsilon ', '⊔': '\\sqcup ', '∅': '\\emptyset ', '→': '\\to ', '⊥': '\\bot ', '|': '\\mid ', ' ': '\\ ',
  '$': '\\$', '{': '\\{', '}': '\\}', '#': '\\#', '%': '\\%', '&': '\\&', '_': '\\_',
  '\\': '\\backslash ', '^': '\\hat{}', '~': '\\sim ',
}

/** Escapes text for math mode; Unicode symbols the app uses become their TeX commands, and subscript digits become _{…}. */
export function texMath(text: string): string {
  return (text.match(/[₀-₉]+|./gu) ?? []).map(token => {
    if (/^[₀-₉]+$/.test(token)) return `_{${Array.from(token).map(char => SUBSCRIPTS.indexOf(char)).join('')}}`
    if (MATH_SYMBOLS[token]) return MATH_SYMBOLS[token]
    if (/[a-zA-Z0-9+\-*/=()<>!?.,;:'[\]]/.test(token)) return token
    return `\\text{${token}}`
  }).join('').trim()
}

/** "q₁₂" → "$q_{12}$", "start₀" → "$\mathit{start}_{0}$"; any other name is set as text. */
export function texStateLabel(label: string): string {
  const match = label.match(/^(.*?)([₀-₉]+)$/)
  const base = match ? match[1] : label
  const subscript = match ? Array.from(match[2]).map(char => SUBSCRIPTS.indexOf(char)).join('') : ''
  const name = /^[a-zA-Z]$/.test(base) ? base : /^[a-zA-Z]+$/.test(base) ? `\\mathit{${base}}` : texMath(base)
  return `$${name}${subscript ? `_{${subscript}}` : ''}$`
}

const nodeName = (index: number) => `s${index}`

function edgeLabel(symbols: string[], kind: 'pda' | 'tm' | null): string {
  if (!symbols.length) return '$\\emptyset$'
  if (kind === 'tm') return symbols.map(raw => {
    const rule = parseTmRule(raw)
    if (!rule) return `$${texMath(raw)}$`
    // Always the full "a \to b, R", even when b = a.
    return `$${texMath(rule.read)} \\to ${texMath(rule.write)}, \\mathrm{${rule.move}}$`
  }).join(' \\\\ ')
  if (!kind) return `$${symbols.map(symbol => texMath(symbol)).join(', ')}$`
  // One rule per line: "a, X \to YZ".
  return symbols.map(rule => {
    const parsed = parsePdaRule(rule)
    if (!parsed) return `$${texMath(rule)}$`
    const part = (value: string) => value ? texMath(value) : '\\varepsilon'
    return `$${part(parsed.input)}, ${part(parsed.pop)} \\to ${part(parsed.push)}$`
  }).join(' \\\\ ')
}

export function graphToTikz(graph: AutomatonGraph, options: { pda?: boolean; tm?: boolean } = {}): string {
  const scale = 1 / 90 // canvas pixels per centimetre
  const index = new Map(graph.states.map((state, position) => [state.id, position]))
  const lines = [
    '% Needs \\usepackage{tikz} and \\usetikzlibrary{automata, positioning, arrows.meta}',
    '\\begin{tikzpicture}[>={Stealth[round]}, shorten >=1pt, auto, every state/.style={minimum size=1.1cm}, initial text={}]',
  ]
  for (const state of graph.states) {
    const styles = ['state', ...(state.kind === 'start' ? ['initial'] : []), ...(isAcceptingState(state) ? ['accepting'] : [])]
    const x = (state.position.x * scale).toFixed(2), y = (-state.position.y * scale).toFixed(2)
    lines.push(`  \\node[${styles.join(', ')}] (${nodeName(index.get(state.id)!)}) at (${x}, ${y}) {${texStateLabel(state.label)}};`)
  }
  if (graph.transitions.length) {
    lines.push('  \\path[->]')
    for (const transition of graph.transitions) {
      const from = nodeName(index.get(transition.source)!), to = nodeName(index.get(transition.target)!)
      const label = edgeLabel(transition.symbols, options.tm ? 'tm' : options.pda ? 'pda' : null)
      const multiline = label.includes('\\\\')
      const node = `node${multiline ? '[align=center]' : ''} {${label}}`
      if (transition.source === transition.target) lines.push(`    (${from}) edge[loop above] ${node} ()`)
      else {
        const reverse = graph.transitions.some(other => other.source === transition.target && other.target === transition.source)
        lines.push(`    (${from}) edge${reverse ? '[bend left=20]' : ''} ${node} (${to})`)
      }
    }
    lines[lines.length - 1] += ';'
  }
  lines.push('\\end{tikzpicture}')
  return lines.join('\n') + '\n'
}

export function grammarToLatex(grammar: Grammar): string {
  const heads = [grammar.start, ...grammar.nonterminals.filter(symbol => symbol !== grammar.start)]
  const rows = heads.map(head => {
    const bodies = grammar.productions.filter(production => production.head === head)
      .map(production => production.body.length ? texMath(production.body.join('')) : '\\varepsilon')
    return bodies.length ? `  ${head} &\\to ${bodies.join(' \\mid ')}` : null
  }).filter(Boolean)
  return ['% Needs \\usepackage{amsmath}', '\\begin{align*}', rows.join(' \\\\\n'), '\\end{align*}'].join('\n') + '\n'
}
