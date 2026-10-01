import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="lab-home">
      <header className="lab-home-brand">
        <span className="brand-mark">⌁</span>
        <div>
          <p className="eyebrow">Automata Lab</p>
          <h1>One workspace, two rulebooks</h1>
        </div>
      </header>
      <p className="lab-home-lead">
        DFA and NFA look similar on the canvas but follow different transition rules, so each keeps its own rules
        and its own save — but they live together as tabs in one workspace. Open as many of each as you like, and
        convert between them without losing anything: converting always opens the result as a new tab.
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
      </div>
    </main>
  )
}
