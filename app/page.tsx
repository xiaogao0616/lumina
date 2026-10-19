import Link from 'next/link'
import { Zap } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="lab-home">
      <header className="lab-home-brand">
        <span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>
        <div>
          <p className="eyebrow">Automata Lab</p>
          <h1>One workspace, four rulebooks</h1>
        </div>
      </header>
      <p className="lab-home-lead">
        DFA, NFA and PDA look similar on the canvas but follow different transition rules, and a CFG is written as
        rules instead of drawn. Each keeps its own rules and its own save, but they all live together as tabs in one
        workspace. Open as many of each as you like, and convert between them without losing anything: converting
        always opens the result as a new tab.
      </p>
      <div className="lab-cards">
        <Link className="lab-card is-dfa" href="/dfa">
          <p className="eyebrow">DFA</p>
          <h2>Deterministic</h2>
          <p>No ε. Each state and character has at most one successor. Missing arrows reject. You can complete the graph with a sink.</p>
          <span>Open workspace</span>
        </Link>
        <Link className="lab-card is-nfa" href="/nfa">
          <p className="eyebrow">NFA</p>
          <h2>Nondeterministic</h2>
          <p>ε-moves and branching are allowed. When you want the deterministic equivalent, convert with subset construction.</p>
          <span>Open workspace</span>
        </Link>
        <Link className="lab-card is-pda" href="/pda">
          <p className="eyebrow">PDA</p>
          <h2>Pushdown</h2>
          <p>An NFA with a stack. Each rule reads a character, pops a symbol and pushes a string. Watch the stack change move by move.</p>
          <span>Open workspace</span>
        </Link>
        <Link className="lab-card is-cfg" href="/cfg">
          <p className="eyebrow">CFG</p>
          <h2>Context-free grammar</h2>
          <p>Write rules like S → aSb | ε. Test a string to see its parse tree and leftmost derivation, or convert the grammar to a PDA.</p>
          <span>Open workspace</span>
        </Link>
      </div>
    </main>
  )
}
