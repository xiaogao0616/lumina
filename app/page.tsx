import Link from 'next/link'
import { ArrowRight, GraduationCap, Swords, Zap } from 'lucide-react'
import { HeroAutomaton } from '../components/hero-automaton'
import { ThemeToggle } from '../components/theme-toggle'

const labs = [
  { mode: 'dfa', title: 'Deterministic', body: 'No ε. Each state and character has at most one successor. Missing arrows reject. You can complete the graph with a sink.' },
  { mode: 'nfa', title: 'Nondeterministic', body: 'ε-moves and branching are allowed. When you want the deterministic equivalent, convert with subset construction.' },
  { mode: 'pda', title: 'Pushdown', body: 'An NFA with a stack. Each rule reads a character, pops a symbol and pushes a string. Watch the stack change move by move.' },
  { mode: 'cfg', title: 'Context-free grammar', body: 'Write rules like S → aSb | ε. Test a string to see its parse tree and leftmost derivation, or convert the grammar to a PDA.' },
  { mode: 'tm', title: 'Turing machine', body: 'A tape that is infinite to the right and a head that reads, writes and moves. Watch the tape change cell by cell, and see a run accept, reject or loop forever.' },
] as const

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
              <h1>One workspace, <em>five rulebooks</em></h1>
            </header>
            <p className="lab-home-lead">
              DFA, NFA, PDA and Turing machines look similar on the canvas but follow different transition rules, and a CFG is written as
              rules instead of drawn. Each keeps its own rules and its own save, but they all live together as tabs in one
              workspace. Open as many of each as you like, and convert between them without losing anything: converting
              always opens the result as a new tab.
            </p>
          </div>
          <HeroAutomaton />
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
        <h2 className="lab-section-title">Go further</h2>
        <div className="lab-cards">
          <Link className="lab-card is-practice" href="/dfa?practice=1">
            <span className="lab-card-icon"><GraduationCap size={22} aria-hidden="true" /></span>
            <h2>Practice</h2>
            <p>Twelve languages to build a DFA or NFA for. Check compares your machine with the answer exactly and shows the shortest string it gets wrong.</p>
            <span>Start practising <ArrowRight size={14} aria-hidden="true" /></span>
          </Link>
          <Link className="lab-card is-pump" href="/pumping">
            <span className="lab-card-icon"><Swords size={22} aria-hidden="true" /></span>
            <h2>Pumping lemma game</h2>
            <p>Show aⁿbⁿ isn’t regular by beating the computer: it picks p and the split, you pick the string and how far to pump.</p>
            <span>Play <ArrowRight size={14} aria-hidden="true" /></span>
          </Link>
        </div>
      </main>
    </div>
  )
}
