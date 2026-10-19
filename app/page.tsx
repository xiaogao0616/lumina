import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'
import { ThemeToggle } from '../components/theme-toggle'

const labs = [
  { mode: 'dfa', title: 'Deterministic', body: 'No ε. Each state and character has at most one successor. Missing arrows reject. You can complete the graph with a sink.' },
  { mode: 'nfa', title: 'Nondeterministic', body: 'ε-moves and branching are allowed. When you want the deterministic equivalent, convert with subset construction.' },
  { mode: 'pda', title: 'Pushdown', body: 'An NFA with a stack. Each rule reads a character, pops a symbol and pushes a string. Watch the stack change move by move.' },
  { mode: 'cfg', title: 'Context-free grammar', body: 'Write rules like S → aSb | ε. Test a string to see its parse tree and leftmost derivation, or convert the grammar to a PDA.' },
] as const

export default function HomePage() {
  return (
    <div className="lab-home-page">
      <nav className="lab-home-nav" aria-label="Site">
        <span className="brand-home"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</span>
        <ThemeToggle />
      </nav>
      <main className="lab-home">
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
