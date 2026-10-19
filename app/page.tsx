import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'
import { ThemeToggle } from '../components/theme-toggle'

const labs = [
  { mode: 'dfa', title: 'Deterministic', body: 'No ε. Each state and character has at most one successor. Missing arrows reject. You can complete the graph with a sink.' },
  { mode: 'nfa', title: 'Nondeterministic', body: 'ε-moves and branching are allowed. When you want the deterministic equivalent, convert with subset construction.' },
  { mode: 'pda', title: 'Pushdown', body: 'An NFA with a stack. Each rule reads a character, pops a symbol and pushes a string. Watch the stack change move by move.' },
  { mode: 'cfg', title: 'Context-free grammar', body: 'Write rules like S → aSb | ε. Test a string to see its parse tree and leftmost derivation, or convert the grammar to a PDA.' },
] as const

/** A small decorative automaton: start → q → accept, with a self-loop. */
function HeroArt() {
  const nodes = [
    { x: 70, y: 150, label: 'q₀', fill: 'var(--dfa-fill)' },
    { x: 220, y: 70, label: 'q₁', fill: 'var(--pda-fill)' },
    { x: 360, y: 170, label: 'q₂', fill: 'var(--cfg-fill)', accept: true },
  ]
  return <svg className="lab-hero-art" viewBox="0 0 430 250" aria-hidden="true">
    <defs><marker id="art-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path className="art-head" d="M0 0 L10 5 L0 10 Z" /></marker></defs>
    <path className="art-edge" d="M4 150 H30" markerEnd="url(#art-arrow)" />
    <path className="art-edge" d="M104 130 Q140 80 184 74" markerEnd="url(#art-arrow)" />
    <path className="art-edge" d="M254 88 Q310 110 326 146" markerEnd="url(#art-arrow)" />
    <path className="art-edge" d="M108 158 Q220 230 322 180" markerEnd="url(#art-arrow)" />
    <path className="art-edge" d="M204 38 C190 -4 252 -4 238 38" markerEnd="url(#art-arrow)" />
    {nodes.map(node => <g key={node.label}>
      <circle className="art-shadow" cx={node.x + 5} cy={node.y + 5} r="36" />
      <circle className="art-node" cx={node.x} cy={node.y} r="36" style={{ fill: node.fill }} />
      {node.accept && <circle className="art-node" cx={node.x} cy={node.y} r="28" style={{ fill: 'none' }} />}
      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central">{node.label}</text>
    </g>)}
    {[{ x: 130, y: 92, t: 'a' }, { x: 302, y: 104, t: 'b' }, { x: 220, y: 206, t: 'ε' }, { x: 221, y: 8, t: 'a' }].map(label =>
      <g key={`${label.x}`} className="art-label"><rect x={label.x - 13} y={label.y - 12} width="26" height="24" rx="4" /><text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">{label.t}</text></g>)}
  </svg>
}

export default function HomePage() {
  return (
    <div className="lab-home-page">
      <nav className="lab-home-nav" aria-label="Site">
        <span className="brand-home"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</span>
        <ThemeToggle />
      </nav>
      <main className="lab-home">
        <section className="lab-hero">
          <div>
            <header className="lab-home-brand">
              <p className="eyebrow">Automata Lab</p>
              <h1>One workspace, <em>four rulebooks</em></h1>
            </header>
            <p className="lab-home-lead">
              DFA, NFA and PDA look similar on the canvas but follow different transition rules, and a CFG is written as
              rules instead of drawn. Each keeps its own rules and its own save, but they all live together as tabs in one
              workspace. Open as many of each as you like, and convert between them without losing anything: converting
              always opens the result as a new tab.
            </p>
          </div>
          <HeroArt />
        </section>
        <div className="lab-cards">
          {labs.map(lab => (
            <Link key={lab.mode} className={`lab-card is-${lab.mode}`} href={`/${lab.mode}`}>
              <span className="lab-card-icon">{lab.mode.toUpperCase()}</span>
              <h2>{lab.title}</h2>
              <p>{lab.body}</p>
              <span>Open workspace <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
