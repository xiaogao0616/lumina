'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, CircleCheck, CircleX, RotateCcw, Search, Wand2, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { NpGraphView, type EdgeLook } from './np-graph'
import {
  assignmentToClique, assignmentToCover, bruteForceSat, clauseText, cliqueToAssignment, cnfToClique, cnfToVertexCover, coverToAssignment,
  edgeSet, findClique, findVertexCover, formulaTrue, isClique, isVertexCover, NP_LIMITS, parseCnf, type Assignment, type Formula,
} from '../lib/np'
import './deciders.css'

type Target = 'clique' | 'cover'

const EXAMPLES = [
  { name: 'Sipser’s example', text: '(x ∨ x ∨ y) ∧ (¬x ∨ ¬y ∨ ¬y) ∧ (¬x ∨ y ∨ y)' },
  { name: 'Exactly one of three', text: '(x ∨ y ∨ z) ∧ (¬x ∨ ¬y) ∧ (¬y ∨ ¬z) ∧ (¬x ∨ ¬z)' },
  { name: 'Four variables', text: '(a ∨ b ∨ ¬c) ∧ (¬a ∨ c ∨ d) ∧ (¬b ∨ ¬c ∨ ¬d) ∧ (a ∨ ¬b ∨ d)' },
  { name: 'Unsatisfiable', text: '(x ∨ y) ∧ (x ∨ ¬y) ∧ (¬x ∨ y) ∧ (¬x ∨ ¬y)' },
]

const TARGETS: { id: Target; name: string; theorem: string; blurb: string }[] = [
  { id: 'clique', name: 'CLIQUE', theorem: 'Theorem 7.32', blurb: 'k nodes, all joined to each other' },
  { id: 'cover', name: 'VERTEX-COVER', theorem: 'Theorem 7.44', blurb: 'k nodes that touch every edge' },
]

const showAssignment = (formula: Formula, assignment: Assignment) => formula.variables.map(variable => `${variable} = ${assignment[variable] ? 'T' : 'F'}`).join(', ')

function Reduction({ formula, target }: { formula: Formula; target: Target }) {
  const { graph, k } = useMemo(() => target === 'clique' ? cnfToClique(formula) : cnfToVertexCover(formula), [formula, target])
  const edges = useMemo(() => edgeSet(graph), [graph])
  const [chosen, setChosen] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const selected = new Set(chosen)
  const toggle = (id: string) => { setChosen(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); setNote(null) }

  const valid = target === 'clique' ? chosen.length === k && isClique(graph, chosen) : chosen.length <= k && isVertexCover(graph, chosen)
  const tooMany = chosen.length > k
  const back = valid ? (target === 'clique' ? cliqueToAssignment(formula, graph, chosen) : coverToAssignment(formula, chosen)) : null
  const edgeLook = (a: string, b: string): EdgeLook => {
    if (target === 'clique') return selected.has(a) && selected.has(b) ? 'on' : chosen.length ? 'faded' : 'plain'
    return selected.has(a) || selected.has(b) ? 'faded' : chosen.length ? 'bad' : 'plain'
  }
  const uncovered = target === 'cover' ? graph.edges.filter(([a, b]) => !selected.has(a) && !selected.has(b)).length : 0
  const nonEdges = target === 'clique' ? chosen.flatMap((a, i) => chosen.slice(i + 1).filter(b => !edges.has(a < b ? `${a}|${b}` : `${b}|${a}`))).length : 0

  const search = () => {
    const result = target === 'clique' ? findClique(graph, k) : findVertexCover(graph, k)
    const found = 'clique' in result ? result.clique : result.cover
    setChosen(found ?? [])
    setNote(found
      ? `The search found one after ${result.explored.toLocaleString('en-US')} search steps.`
      : `The search tried ${result.explored.toLocaleString('en-US')} search steps and found no ${target === 'clique' ? `clique of size ${k}` : `cover of size ${k}`}. So the formula is unsatisfiable.`)
  }
  const fromAssignment = () => {
    const { assignment, tried } = bruteForceSat(formula)
    if (!assignment) { setChosen([]); setNote(`No setting of the ${formula.variables.length} variables satisfies the formula (tried all ${tried}). So the graph has no solution of size ${k} either.`); return }
    const mapped = target === 'clique' ? assignmentToClique(formula, assignment) : assignmentToCover(formula, assignment)
    setChosen(mapped ?? [])
    setNote(`Brute force found ${showAssignment(formula, assignment)} after trying ${tried} of ${2 ** formula.variables.length} settings. ${target === 'clique' ? 'Picking one true literal in each clause gives' : 'Taking the true end of each variable edge, and the two other corners of each triangle, gives'} the nodes now selected.`)
  }

  return <section className="dec-card" aria-labelledby="np-graph-title">
    <header className="dec-card-head">
      <h2 id="np-graph-title"><span>3SAT ≤<sub>p</sub> {target === 'clique' ? 'CLIQUE' : 'VERTEX-COVER'}</span><span className="dec-theorem">{TARGETS.find(item => item.id === target)!.theorem}</span></h2>
      <p className="dec-language">φ is satisfiable ⇔ G has {target === 'clique' ? 'a clique' : 'a vertex cover'} of size k = {target === 'clique' ? <>{formula.clauses.length} (clauses)</> : <>{formula.variables.length} + 2 × {formula.clauses.length} = {k}</>}</p>
    </header>
    <div className="dec-algorithm">
      <p>How the graph is built</p>
      {target === 'clique'
        ? <ol><li>One node for each literal in each clause.</li><li>Join two nodes unless they’re in the same clause, or one is x and the other ¬x.</li><li>k = the number of clauses.</li></ol>
        : <ol><li>For each variable x, two nodes x and ¬x joined by an edge.</li><li>For each clause, a triangle of its three literals (a shorter clause repeats its last literal).</li><li>Join each triangle node to the variable node with the same literal. k = variables + 2 × clauses.</li></ol>}
    </div>
    <p className="dec-note">{graph.nodes.length} nodes and {graph.edges.length} edges, built in polynomial time. Click nodes to choose them, or let the lab find a solution.</p>
    <div className="dec-graph np-lab-graph">
      <NpGraphView graph={graph} selected={selected} onToggle={toggle} edgeLook={edgeLook}
        label={target === 'clique' ? 'The CLIQUE graph' : 'The VERTEX-COVER graph'}
        groupOf={target === 'clique' ? group => `C${Number(group.slice(1)) + 1}` : undefined} />
    </div>
    <div className="dec-stepper">
      <button type="button" className="primary-button dec-play" onClick={search}><Search size={14} aria-hidden="true" /> Search the graph</button>
      <button type="button" className="secondary-button dec-play" onClick={fromAssignment}><Wand2 size={14} aria-hidden="true" /> Map a satisfying setting</button>
      <button type="button" className="text-button dec-play" onClick={() => { setChosen([]); setNote(null) }} disabled={!chosen.length}><RotateCcw size={13} aria-hidden="true" /> Clear</button>
      <span className="dec-step-count">{chosen.length} of k = {k} chosen</span>
    </div>
    {note && <p className="dec-note">{note}</p>}
    {valid && back
      ? <p className="dec-verdict is-accept"><CircleCheck size={16} aria-hidden="true" /><span>
        That’s {target === 'clique' ? `a clique of size ${k}` : `a vertex cover of size ${chosen.length}`}. Reading it back gives {showAssignment(formula, back)}, and φ is {formulaTrue(formula, back) ? 'true' : 'false'} under it.
        {target === 'clique' ? ' Each chosen literal is made true; there’s one per clause and never both x and ¬x.' : ' Each variable is true when the cover took its x node; the triangle corner the cover skipped is then a true literal.'}
      </span></p>
      : chosen.length > 0 && <p className="dec-verdict is-reject"><CircleX size={16} aria-hidden="true" /><span>
        {target === 'clique'
          ? tooMany ? `That’s more than k = ${k} nodes.` : nonEdges ? `${nonEdges} pair${nonEdges === 1 ? ' of your nodes isn’t' : 's of your nodes aren’t'} joined. Nodes in one clause, or x with ¬x, are never joined.` : `Joined so far. Choose ${k - chosen.length} more.`
          : tooMany ? `That’s more than k = ${k} nodes.` : `${uncovered} edge${uncovered === 1 ? ' is' : 's are'} not covered yet (dashed red).`}
      </span></p>}
  </section>
}

export function NpLabPage() {
  const [text, setText] = useState(EXAMPLES[0].text)
  const [target, setTarget] = useState<Target>('clique')
  const parsed = useMemo(() => parseCnf(text), [text])
  return <div className="dec-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="dec-main">
      <header className="dec-hero">
        <Link className="dec-back" href="/"><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <p className="eyebrow">NP-completeness · Sipser chapter 7</p>
        <h1>Formulas into <em>graphs</em></h1>
        <p className="dec-lead">A <b>polynomial-time reduction</b> turns every 3SAT question into a graph question with the same answer. Type a 3-CNF formula, pick a target problem, and watch the graph get built.
          Then find a solution in the graph and read the satisfying assignment back out, or go the other way. Up to {NP_LIMITS.variables} variables and {NP_LIMITS.clauses} clauses.</p>
      </header>

      <section className="dec-card" aria-labelledby="np-formula-title">
        <h2 id="np-formula-title" className="np-lab-h2">The formula φ</h2>
        <label className="dec-field np-lab-input">
          <span>3-CNF: ∧ between clauses, ∨ inside, ¬ to negate. |, &amp; and ~ work too.</span>
          <input value={text} onChange={event => setText(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
        </label>
        <div className="np-lab-examples">
          {EXAMPLES.map(example => <button key={example.name} type="button" className="np-lab-example" aria-pressed={text === example.text} onClick={() => setText(example.text)}>{example.name}</button>)}
        </div>
        {parsed.ok
          ? <p className="dec-note">{parsed.formula.variables.length} variable{parsed.formula.variables.length === 1 ? '' : 's'} ({parsed.formula.variables.join(', ')}), {parsed.formula.clauses.length} clause{parsed.formula.clauses.length === 1 ? '' : 's'}: {parsed.formula.clauses.map((clause, at) => <code key={at} className="np-f">{clauseText(clause)}</code>).reduce((list, item, at) => at ? <>{list} ∧ {item}</> : item, <></>)}</p>
          : <p className="dec-problem"><CircleX size={16} aria-hidden="true" /><span>{parsed.message}</span></p>}
      </section>

      <div className="dec-picker np-lab-picker" role="radiogroup" aria-label="Target problem">
        {TARGETS.map(item => <button key={item.id} type="button" role="radio" aria-checked={item.id === target} className="dec-option" onClick={() => setTarget(item.id)}>
          <span className="dec-option-name">{item.name}</span>
          <small>{item.theorem}</small>
          <span className="dec-option-blurb">{item.blurb}</span>
        </button>)}
      </div>

      {parsed.ok && <Reduction key={`${target}:${text}`} formula={parsed.formula} target={target} />}

      <p className="dec-note">New to this? <Link href="/learn/np">Lesson 10</Link> builds the CLIQUE graph step by step.</p>
    </main>
  </div>
}
