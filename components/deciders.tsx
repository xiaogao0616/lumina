'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, CircleX, Infinity as InfinityIcon, Pause, Play, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { graphToSvg, type StateHighlight } from '../lib/graph-svg'
import type { AutomatonGraph } from '../lib/automaton-graph'
import { parseGrammar, type Grammar } from '../lib/cfg'
import {
  decideACfg, decideADfa, decideANfa, decideARex, decideECfg, decideEDfa, decideEqDfa, formatProduction, isNonterminal,
  type ADfaResult, type EDfaResult,
} from '../lib/deciders'
import { ACFG_EXAMPLES, DFA_EXAMPLES, ECFG_EXAMPLES, NFA_EXAMPLES, REGEX_EXAMPLES, type MachineExample } from '../lib/decider-examples'
import { readSavedEditor, readSavedGrammar, readTabsIndex, savedEditorToGraph, tabStorageKey, tabsIndexKey } from '../lib/editor-storage'
import './deciders.css'

type DeciderId = 'adfa' | 'anfa' | 'arex' | 'edfa' | 'eqdfa' | 'acfg' | 'ecfg' | 'atm'

const Sub = ({ children }: { children: ReactNode }) => <sub>{children}</sub>

const deciders: { id: DeciderId; name: ReactNode; theorem: string; blurb: string }[] = [
  { id: 'adfa', name: <>A<Sub>DFA</Sub></>, theorem: 'Theorem 4.1', blurb: 'Does DFA B accept w?' },
  { id: 'anfa', name: <>A<Sub>NFA</Sub></>, theorem: 'Theorem 4.2', blurb: 'Does NFA B accept w?' },
  { id: 'arex', name: <>A<Sub>REX</Sub></>, theorem: 'Theorem 4.3', blurb: 'Does regex R generate w?' },
  { id: 'edfa', name: <>E<Sub>DFA</Sub></>, theorem: 'Theorem 4.4', blurb: 'Is L(A) empty?' },
  { id: 'eqdfa', name: <>EQ<Sub>DFA</Sub></>, theorem: 'Theorem 4.5', blurb: 'Do A and B accept the same language?' },
  { id: 'acfg', name: <>A<Sub>CFG</Sub></>, theorem: 'Theorem 4.7', blurb: 'Does grammar G generate w?' },
  { id: 'ecfg', name: <>E<Sub>CFG</Sub></>, theorem: 'Theorem 4.8', blurb: 'Is L(G) empty?' },
  { id: 'atm', name: <>A<Sub>TM</Sub></>, theorem: 'Theorem 4.11', blurb: 'Does TM M accept w? No decider exists.' },
]

// ---------- Inputs from the workspace ----------

type WorkspaceMachine = { id: string; name: string; graph: AutomatonGraph; mode: 'dfa' | 'nfa' }
type WorkspaceGrammar = { id: string; name: string; grammar: string }

/** The DFA, NFA and CFG tabs saved in this browser, so a decider can run on the student's own machine. */
function readWorkspace(): { machines: WorkspaceMachine[]; grammars: WorkspaceGrammar[] } {
  const machines: WorkspaceMachine[] = []
  const grammars: WorkspaceGrammar[] = []
  try {
    const raw = localStorage.getItem(tabsIndexKey())
    if (!raw) return { machines, grammars }
    for (const tab of readTabsIndex(raw).tabs) {
      try {
        const saved = localStorage.getItem(tabStorageKey(tab.mode, tab.id))
        if (!saved) continue
        if (tab.mode === 'dfa' || tab.mode === 'nfa') {
          machines.push({ id: `tab:${tab.id}`, name: `${tab.title} (your ${tab.mode.toUpperCase()} tab)`, mode: tab.mode, graph: savedEditorToGraph(readSavedEditor(saved, tab.mode)) })
        } else if (tab.mode === 'cfg') {
          grammars.push({ id: `tab:${tab.id}`, name: `${tab.title} (your CFG tab)`, grammar: readSavedGrammar(saved).grammar })
        }
      } catch { /* A tab whose save can't be read is just left out of the list. */ }
    }
  } catch { /* No storage, or an unreadable index: only the built-in examples are offered. */ }
  return { machines, grammars }
}

function useWorkspace() {
  const [workspace, setWorkspace] = useState<ReturnType<typeof readWorkspace>>({ machines: [], grammars: [] })
  useEffect(() => { setWorkspace(readWorkspace()) }, [])
  return workspace
}

function MachinePicker({ label, value, onChange, examples, workspace }: {
  label: string; value: string; onChange: (id: string) => void; examples: MachineExample[]; workspace: WorkspaceMachine[]
}) {
  return <label className="dec-field">
    <span>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      <optgroup label="Examples">{examples.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
      {workspace.length > 0 && <optgroup label="From your workspace">{workspace.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}
    </select>
  </label>
}

const findMachine = (id: string, examples: MachineExample[], workspace: WorkspaceMachine[]) =>
  (examples.find(item => item.id === id) ?? workspace.find(item => item.id === id))?.graph ?? examples[0].graph

function WordField({ value, onChange, label = 'w =' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="dec-field dec-word">
    <span>{label}</span>
    <input value={value} spellCheck={false} autoComplete="off" placeholder="ε (empty string)" onChange={event => onChange(event.target.value)} />
  </label>
}

function GrammarField({ value, onChange, examples, workspace }: { value: string; onChange: (value: string) => void; examples: { id: string; name: string; grammar: string }[]; workspace: WorkspaceGrammar[] }) {
  const all = [...examples, ...workspace]
  const current = all.find(item => item.grammar === value)?.id ?? ''
  return <div className="dec-grammar-input">
    <label className="dec-field">
      <span>G</span>
      <select value={current} onChange={event => { const picked = all.find(item => item.id === event.target.value); if (picked) onChange(picked.grammar) }}>
        <option value="" disabled>Edited by hand</option>
        <optgroup label="Examples">{examples.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
        {workspace.length > 0 && <optgroup label="From your workspace">{workspace.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}
      </select>
    </label>
    <textarea value={value} spellCheck={false} rows={Math.max(2, value.split('\n').length)} aria-label="Grammar rules" onChange={event => onChange(event.target.value)} />
  </div>
}

// ---------- Shared pieces ----------

function GraphView({ graph, highlight, activeEdges, label }: { graph: AutomatonGraph; highlight?: Record<string, StateHighlight>; activeEdges?: string[]; label: string }) {
  const svg = useMemo(() => graphToSvg(graph, '', undefined, { themed: true, highlight, activeEdges }), [graph, highlight, activeEdges])
  return <div className="dec-graph" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Step through a trace: first, back, play/pause, forward, last. Resets whenever the trace changes. */
function useStepper(total: number, resetKey: unknown) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setIndex(0); setPlaying(false) }, [resetKey])
  useEffect(() => {
    if (!playing) return
    if (index >= total - 1) { setPlaying(false); return }
    const timer = setTimeout(() => setIndex(current => Math.min(total - 1, current + 1)), 700)
    return () => clearTimeout(timer)
  }, [playing, index, total])
  const controls = <div className="dec-stepper" role="group" aria-label="Step through the decider">
    <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex(0) }} disabled={index === 0} aria-label="First step"><ChevronsLeft size={16} /></button>
    <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex(current => Math.max(0, current - 1)) }} disabled={index === 0} aria-label="Previous step"><ChevronLeft size={16} /></button>
    <button type="button" className="primary-button dec-play" onClick={() => { if (index >= total - 1) setIndex(0); setPlaying(current => !current) }}>
      {playing ? <><Pause size={14} aria-hidden="true" /> Pause</> : <><Play size={14} aria-hidden="true" /> {index >= total - 1 && total > 1 ? 'Replay' : 'Run'}</>}
    </button>
    <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex(current => Math.min(total - 1, current + 1)) }} disabled={index >= total - 1} aria-label="Next step"><ChevronRight size={16} /></button>
    <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex(total - 1) }} disabled={index >= total - 1} aria-label="Last step"><ChevronsRight size={16} /></button>
    <span className="dec-step-count">step {index + 1} / {total}</span>
  </div>
  return { index, done: index >= total - 1, controls }
}

function Verdict({ accept, children }: { accept: boolean; children: ReactNode }) {
  return <p className={`dec-verdict ${accept ? 'is-accept' : 'is-reject'}`} role="status">
    {accept ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}
    <span><b>{accept ? 'Accept.' : 'Reject.'}</b> {children}</span>
  </p>
}

function Problem({ message }: { message: string }) {
  return <p className="dec-problem" role="alert"><CircleX size={16} aria-hidden="true" /> {message}</p>
}

function Halts({ children }: { children: ReactNode }) {
  return <p className="dec-halts"><span><b>Why it always halts.</b> {children}</span></p>
}

function Algorithm({ input, steps }: { input: ReactNode; steps: ReactNode[] }) {
  return <div className="dec-algorithm">
    <p>On input {input}:</p>
    <ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
  </div>
}

// ---------- A_DFA: also the last stage of A_NFA and A_REX ----------

function Tape({ input, consumed }: { input: string; consumed: number }) {
  const chars = Array.from(input)
  if (!chars.length) return <div className="dec-tape"><span className="dec-cell is-empty">ε</span></div>
  return <div className="dec-tape" aria-label={`${consumed} of ${chars.length} characters read`}>
    {chars.map((char, index) => <span key={index} className={`dec-cell ${index < consumed ? 'is-read' : ''} ${index === consumed ? 'is-next' : ''}`}>{char}</span>)}
  </div>
}

function DfaRun({ graph, input, run, name = 'B' }: { graph: AutomatonGraph; input: string; run: ADfaResult; name?: string }) {
  const total = run.steps.length + (run.stuck ? 1 : 0)
  const { index, done, controls } = useStepper(total, run)
  const step = run.steps[Math.min(index, run.steps.length - 1)]
  const stuckNow = run.stuck && index === run.steps.length
  const previous = index > 0 && !stuckNow ? run.steps[index - 1] : null
  const chars = Array.from(input)
  const edge = previous ? graph.transitions.find(item => item.source === previous.stateId && item.target === step.stateId && item.symbols.includes(chars[previous.consumed])) : null
  const highlight = useMemo(() => ({ [step.stateId]: 'current' as const }), [step.stateId])
  const activeEdges = useMemo(() => edge ? [edge.id] : [], [edge])
  const label = (id: string) => graph.states.find(item => item.id === id)?.label ?? id
  return <>
    {controls}
    <Tape input={input} consumed={step.consumed} />
    <GraphView graph={graph} highlight={highlight} activeEdges={activeEdges} label={`${name}, currently in ${label(step.stateId)}`} />
    <p className="dec-narration">{index === 0 ? `${name} starts in ${label(step.stateId)}.`
      : stuckNow ? `${label(step.stateId)} has no arrow for ${chars[step.consumed]}.`
        : `Read ${chars[previous!.consumed]}: ${label(previous!.stateId)} → ${label(step.stateId)}.`}</p>
    {done && <Verdict accept={run.accepted}>{run.message}</Verdict>}
  </>
}

function ADfa({ workspace }: { workspace: WorkspaceMachine[] }) {
  const [machineId, setMachineId] = useState(DFA_EXAMPLES[0].id)
  const [input, setInput] = useState('abaab')
  const graph = findMachine(machineId, DFA_EXAMPLES, workspace)
  const run = useMemo(() => decideADfa(graph, input), [graph, input])
  return <>
    <Algorithm input={<>⟨B, w⟩, where B is a DFA and w is a string</>} steps={[
      'Simulate B on input w.',
      'If the simulation ends in an accept state, accept. If it ends in a non-accepting state, reject.',
    ]} />
    <div className="dec-inputs">
      <MachinePicker label="B" value={machineId} onChange={setMachineId} examples={DFA_EXAMPLES} workspace={workspace} />
      <WordField value={input} onChange={setInput} />
    </div>
    {run.ok ? <DfaRun graph={graph} input={input} run={run} /> : <Problem message={run.message} />}
    <Halts>A DFA reads one character per move and never moves back, so the simulation takes exactly |w| moves and then stops. There is no way for it to loop.</Halts>
  </>
}

function ANfa({ workspace }: { workspace: WorkspaceMachine[] }) {
  const examples = [...NFA_EXAMPLES, ...DFA_EXAMPLES]
  const [machineId, setMachineId] = useState(NFA_EXAMPLES[0].id)
  const [input, setInput] = useState('abab')
  const graph = findMachine(machineId, examples, workspace)
  const result = useMemo(() => decideANfa(graph, input), [graph, input])
  return <>
    <Algorithm input={<>⟨B, w⟩, where B is an NFA and w is a string</>} steps={[
      'Convert B to an equivalent DFA C with the subset construction (Theorem 1.39).',
      <>Run the A<Sub>DFA</Sub> decider on ⟨C, w⟩ and give the same answer.</>,
    ]} />
    <div className="dec-inputs">
      <MachinePicker label="B" value={machineId} onChange={setMachineId} examples={examples} workspace={workspace} />
      <WordField value={input} onChange={setInput} />
    </div>
    <h3>Stage 1: the NFA B</h3>
    <GraphView graph={graph} label="The NFA B" />
    {result.ok ? <>
      <h3>Stage 2: the DFA C, run on w</h3>
      <p className="dec-note">The subset construction gives C {result.dfa.states.length} state{result.dfa.states.length === 1 ? '' : 's'}. Each one is the set of states B could be in.</p>
      <DfaRun graph={result.dfa} input={input} run={result.run} name="C" />
    </> : <Problem message={result.message} />}
    <Halts>The subset construction makes at most 2<sup>k</sup> states for a k-state NFA, which is finite, and then the A<Sub>DFA</Sub> decider halts after |w| moves.</Halts>
  </>
}

function ARex() {
  const [pattern, setPattern] = useState(REGEX_EXAMPLES[0])
  const [input, setInput] = useState('babab')
  const result = useMemo(() => decideARex(pattern, input), [pattern, input])
  return <>
    <Algorithm input={<>⟨R, w⟩, where R is a regular expression and w is a string</>} steps={[
      'Convert R to an equivalent NFA A (Theorem 1.54).',
      <>Run the A<Sub>NFA</Sub> decider on ⟨A, w⟩ and give the same answer.</>,
    ]} />
    <div className="dec-inputs">
      <label className="dec-field dec-word">
        <span>R =</span>
        <input value={pattern} spellCheck={false} autoComplete="off" list="dec-regex-examples" onChange={event => setPattern(event.target.value)} />
        <datalist id="dec-regex-examples">{REGEX_EXAMPLES.map(item => <option key={item} value={item} />)}</datalist>
      </label>
      <WordField value={input} onChange={setInput} />
    </div>
    <p className="dec-note">Use | for union, * + ? for repetition and parentheses for grouping, as in the workspace’s Regex → NFA tool.</p>
    {result.ok ? <>
      <p className="dec-pipeline">
        <span>R</span><ChevronRight size={14} aria-hidden="true" />
        <span>NFA A, {result.nfa.states.length} states</span><ChevronRight size={14} aria-hidden="true" />
        <span>DFA C, {result.dfa.states.length} states</span>
      </p>
      <DfaRun graph={result.dfa} input={input} run={result.run} name="C" />
    </> : <Problem message={result.message} />}
    <Halts>Each conversion is a finite construction over the symbols of R, and the last stage is the A<Sub>DFA</Sub> decider, which halts after |w| moves.</Halts>
  </>
}

// ---------- E_DFA: also the last stage of EQ_DFA ----------

function Marking({ graph, result, name = 'A' }: { graph: AutomatonGraph; result: EDfaResult; name?: string }) {
  const total = result.rounds.length + 1
  const { index, done, controls } = useStepper(total, result)
  const rounds = result.rounds.slice(0, Math.min(index + 1, result.rounds.length))
  const highlight = useMemo(() => {
    const marks: Record<string, StateHighlight> = {}
    if (done) for (const state of graph.states) marks[state.id] = 'faded'
    rounds.forEach((round, roundIndex) => round.marked.forEach(id => { marks[id] = roundIndex === rounds.length - 1 && !done ? 'current' : 'marked' }))
    return marks
  }, [graph, rounds, done])
  const activeEdges = useMemo(() => {
    const latest = done ? null : rounds[rounds.length - 1]
    return latest ? graph.transitions.filter(item => latest.via.some(via => via.from === item.source && via.to === item.target)).map(item => item.id) : []
  }, [graph, rounds, done])
  const label = (id: string) => graph.states.find(item => item.id === id)?.label ?? id
  const latest = result.rounds[Math.min(index, result.rounds.length - 1)]
  return <>
    {controls}
    <GraphView graph={graph} highlight={highlight} activeEdges={activeEdges} label={`${name} with ${rounds.reduce((sum, round) => sum + round.marked.length, 0)} states marked`} />
    <p className="dec-narration">{done ? `No new state can be marked, so marking stops after ${result.rounds.length} round${result.rounds.length === 1 ? '' : 's'}. Faded states are unreachable.`
      : index === 0 ? `Mark the start state ${label(latest.marked[0])}.`
        : `Round ${index + 1}: mark ${latest.via.map(via => `${label(via.to)} (from ${label(via.from)} on ${via.symbol})`).join(', ')}.`}</p>
    {done && (result.empty
      ? <Verdict accept>No accept state is marked, so no string can reach one: L({name}) = ∅.</Verdict>
      : <Verdict accept={false}>Accept state {result.reachableAccepting.map(label).join(', ')} is marked, so L({name}) ≠ ∅. For example, {name} accepts {result.witness ? <code>{result.witness}</code> : 'ε'}.</Verdict>)}
  </>
}

function EDfa({ workspace }: { workspace: WorkspaceMachine[] }) {
  const [machineId, setMachineId] = useState('cut-off')
  const graph = findMachine(machineId, DFA_EXAMPLES, workspace)
  const result = useMemo(() => decideEDfa(graph), [graph])
  return <>
    <Algorithm input={<>⟨A⟩, where A is a DFA</>} steps={[
      'Mark the start state of A.',
      'Repeat until no new states get marked: mark any state that has a transition coming into it from a state that is already marked.',
      'If no accept state is marked, accept. Otherwise, reject.',
    ]} />
    <div className="dec-inputs">
      <MachinePicker label="A" value={machineId} onChange={setMachineId} examples={DFA_EXAMPLES} workspace={workspace} />
    </div>
    {result.ok ? <Marking graph={graph} result={result} /> : <Problem message={result.message} />}
    <Halts>Every round except the last marks at least one new state, and A has only finitely many states, so the loop runs at most |Q| times.</Halts>
  </>
}

function EqDfa({ workspace }: { workspace: WorkspaceMachine[] }) {
  const [firstId, setFirstId] = useState('ends-ab')
  const [secondId, setSecondId] = useState('ends-ab-4')
  const first = findMachine(firstId, DFA_EXAMPLES, workspace)
  const second = findMachine(secondId, DFA_EXAMPLES, workspace)
  const result = useMemo(() => decideEqDfa(first, second), [first, second])
  return <>
    <Algorithm input={<>⟨A, B⟩, where A and B are DFAs</>} steps={[
      <>Construct DFA C for (L(A) ∩ <span className="dec-over">L(B)</span>) ∪ (<span className="dec-over">L(A)</span> ∩ L(B)), the strings exactly one of them accepts.</>,
      <>Run the E<Sub>DFA</Sub> decider on ⟨C⟩. If it accepts, accept. If it rejects, reject.</>,
    ]} />
    <div className="dec-inputs">
      <MachinePicker label="A" value={firstId} onChange={setFirstId} examples={DFA_EXAMPLES} workspace={workspace} />
      <MachinePicker label="B" value={secondId} onChange={setSecondId} examples={DFA_EXAMPLES} workspace={workspace} />
    </div>
    <div className="dec-pair">
      <div><h3>A</h3><GraphView graph={first} label="DFA A" /></div>
      <div><h3>B</h3><GraphView graph={second} label="DFA B" /></div>
    </div>
    {result.ok ? <>
      <h3>C, the symmetric difference</h3>
      <p className="dec-note">C runs A and B side by side: state (p, q) means A is in p and B is in q, and ∅ is a missing arrow’s dead state. C accepts where exactly one of them accepts.
        It has {result.product.states.length} reachable state{result.product.states.length === 1 ? '' : 's'}.</p>
      <Marking graph={result.product} result={result.emptiness} name="C" />
      {result.witness && <p className="dec-note">So A and B are <b>not</b> equivalent: <code>{result.witness.input || 'ε'}</code> is accepted by {result.witness.acceptedBy} only.</p>}
    </> : <Problem message={result.message} />}
    <Halts>C is built from finitely many pairs of states, at most |Q<Sub>A</Sub>| × |Q<Sub>B</Sub>| (one more state on each side if missing arrows need a dead state), and the E<Sub>DFA</Sub> decider on C always halts.</Halts>
  </>
}

// ---------- A_CFG and E_CFG ----------

function useGrammar(text: string): { grammar: Grammar } | { error: string } {
  return useMemo(() => {
    const parsed = parseGrammar(text)
    return parsed.ok ? { grammar: parsed.grammar } : { error: parsed.message }
  }, [text])
}

function ACfg({ workspace }: { workspace: WorkspaceGrammar[] }) {
  const [text, setText] = useState(ACFG_EXAMPLES[0].grammar)
  const [input, setInput] = useState('aabb')
  const parsed = useGrammar(text)
  const result = useMemo(() => 'grammar' in parsed ? decideACfg(parsed.grammar, input) : null, [parsed, input])
  const n = Array.from(input).length
  return <>
    <Algorithm input={<>⟨G, w⟩, where G is a CFG and w is a string</>} steps={[
      'Convert G to an equivalent grammar in Chomsky normal form.',
      <>List all derivations with 2n − 1 steps, where n is the length of w; except if n = 0, then list all derivations with one step.</>,
      'If any of these derivations generate w, accept; if not, reject.',
    ]} />
    <div className="dec-inputs dec-inputs-grammar">
      <GrammarField value={text} onChange={setText} examples={ACFG_EXAMPLES} workspace={workspace} />
      <WordField value={input} onChange={setInput} />
    </div>
    {'error' in parsed ? <Problem message={parsed.error} /> : result && (result.ok ? <>
      <h3>Stage 1: G in Chomsky normal form</h3>
      <pre className="dec-grammar">{result.cnfText}</pre>
      <h3>Stage 2: derivations of {result.bound} step{result.bound === 1 ? '' : 's'}</h3>
      <p className="dec-note">{n === 0 ? `w is empty, so only one-step derivations matter: in CNF the only way to derive ε is the rule ${result.cnf.start} → ε.`
        : <>In CNF every step either splits one variable into two (that happens n − 1 = {n - 1} times) or turns one into a terminal (n = {n} times), so a derivation of w takes exactly {result.bound} steps. There are only finitely many such derivations.</>}</p>
      {result.accepted && result.derivation.length > 1 && <DerivationSteps derivation={result.derivation} />}
      {(!result.accepted || result.derivation.length <= 1) && <Verdict accept={result.accepted}>{result.message}</Verdict>}
    </> : <Problem message={result.message} />)}
    <Halts>The number of derivations with exactly 2n − 1 steps is finite, so checking them all ends. (In practice a chart parser finds the right one directly. Here it shows you the derivation it found.)</Halts>
  </>
}

function DerivationSteps({ derivation }: { derivation: string[] }) {
  const { index, done, controls } = useStepper(derivation.length, derivation)
  return <>
    {controls}
    <ol className="dec-derivation" start={0}>
      {derivation.slice(0, index + 1).map((form, step) => <li key={step} className={step === index ? 'is-current' : ''}>
        <span>{step === 0 ? '' : '⇒'}</span><code>{Array.from(form).map((symbol, at) => <span key={at} className={isNonterminal(symbol) ? 'is-variable' : ''}>{symbol}</span>)}</code>
      </li>)}
    </ol>
    {done && <Verdict accept>This derivation has {derivation.length - 1} steps and produces w, so G generates w.</Verdict>}
  </>
}

function ECfg({ workspace }: { workspace: WorkspaceGrammar[] }) {
  const [text, setText] = useState(ECFG_EXAMPLES[0].grammar)
  const parsed = useGrammar(text)
  const result = useMemo(() => 'grammar' in parsed ? decideECfg(parsed.grammar) : null, [parsed])
  return <>
    <Algorithm input={<>⟨G⟩, where G is a CFG</>} steps={[
      'Mark all terminal symbols in G.',
      <>Repeat until no new variables get marked: mark any variable A where G has a rule A → U₁U₂⋯U<sub>k</sub> and each symbol U₁, …, U<sub>k</sub> has already been marked.</>,
      'If the start variable is not marked, accept; otherwise, reject.',
    ]} />
    <div className="dec-inputs dec-inputs-grammar">
      <GrammarField value={text} onChange={setText} examples={ECFG_EXAMPLES} workspace={workspace} />
    </div>
    {'error' in parsed ? <Problem message={parsed.error} /> : result && 'grammar' in parsed && <GrammarMarking grammar={parsed.grammar} result={result} />}
    <Halts>Every round except the last marks at least one new variable, and G has finitely many variables, so the loop runs at most |V| + 1 times.</Halts>
  </>
}

function GrammarMarking({ grammar, result }: { grammar: Grammar; result: ReturnType<typeof decideECfg> }) {
  const total = result.rounds.length + 1
  const { index, done, controls } = useStepper(total, result)
  const visible = result.rounds.slice(0, Math.min(index + 1, result.rounds.length))
  const marked = new Set(visible.flatMap(round => round.marked))
  const fresh = new Set(done ? [] : visible[visible.length - 1].marked)
  const because = new Set(done ? [] : visible[visible.length - 1].because)
  const latest = result.rounds[Math.min(index, result.rounds.length - 1)]
  const chip = (symbol: string, key: number | string) => <span key={key} className={`dec-symbol ${marked.has(symbol) ? 'is-marked' : ''} ${fresh.has(symbol) ? 'is-fresh' : ''}`}>{symbol}</span>
  return <>
    {controls}
    <ul className="dec-rules">
      {grammar.productions.map((production, at) => <li key={at} className={because.has(production) ? 'is-because' : ''}>
        {chip(production.head, 'head')}<span className="dec-arrow">→</span>
        {production.body.length ? production.body.map((symbol, position) => chip(symbol, position)) : <span className="dec-symbol is-marked">ε</span>}
      </li>)}
    </ul>
    <p className="dec-narration">{done ? `No new variable can be marked, so marking stops after ${result.rounds.length} round${result.rounds.length === 1 ? '' : 's'}.`
      : index === 0 ? `Mark every terminal${latest.marked.length ? `: ${latest.marked.join(', ')}` : ' (this grammar has none)'}.`
        : `Round ${index + 1}: mark ${latest.because.map(production => `${production.head} (because of ${formatProduction(production)})`).join(', ')}.`}</p>
    {done && (result.empty
      ? <Verdict accept>The start variable {grammar.start} is never marked, so it can’t derive any string of terminals: L(G) = ∅.</Verdict>
      : <Verdict accept={false}>The start variable {grammar.start} is marked, so it derives at least one string of terminals: L(G) ≠ ∅.{result.unmarked.length > 0 && <> ({result.unmarked.join(', ')} never derive{result.unmarked.length === 1 ? 's' : ''} anything, but that doesn’t matter.)</>}</Verdict>)}
  </>
}

// ---------- A_TM: where deciding stops ----------

function ATm() {
  return <>
    <div className="dec-algorithm">
      <p>The obvious idea is a universal Turing machine U. On input ⟨M, w⟩, where M is a TM and w is a string:</p>
      <ol>
        <li>Simulate M on input w.</li>
        <li>If M ever enters its accept state, accept; if M ever enters its reject state, reject.</li>
      </ol>
    </div>
    <p className="dec-note">U <b>recognizes</b> A<Sub>TM</Sub>, but it isn’t a decider: if M loops on w, so does U. Unlike every machine above, nothing bounds how long M can run, so U can’t know when to give up.
      Try it in the Turing machine workspace. A machine that never halts shows <b>Loops forever</b> when the simulator spots a repeated configuration, but a run that keeps finding new configurations ends in <b>No verdict</b> instead.</p>
    <div className="dec-diagonal">
      <h3>Why no decider can exist (Theorem 4.11)</h3>
      <ol>
        <li>Suppose a decider H existed: H accepts ⟨M, w⟩ if M accepts w, and rejects otherwise.</li>
        <li>Build D: on input ⟨M⟩, run H on ⟨M, ⟨M⟩⟩ and output the <b>opposite</b>.</li>
        <li>Run D on its own description. D accepts ⟨D⟩ exactly when D does not accept ⟨D⟩.</li>
        <li>That is a contradiction, so H can’t exist. This is the diagonal argument: D differs from every machine M on the input ⟨M⟩.</li>
      </ol>
    </div>
    <p className="dec-halts is-loop"><InfinityIcon size={16} aria-hidden="true" /> <span><b>Recognizable, but not decidable.</b> A<Sub>TM</Sub> is Turing-recognizable (U above), so its complement is not even recognizable (Corollary 4.23). <Link href="/tm">Open the Turing machine workspace</Link></span></p>
  </>
}

// ---------- Page ----------

export function DecidersPage() {
  const [selected, setSelected] = useState<DeciderId>('adfa')
  const workspace = useWorkspace()
  const current = deciders.find(item => item.id === selected)!
  return <div className="dec-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="dec-main">
      <header className="dec-hero">
        <Link className="dec-back" href="/"><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <p className="eyebrow">Decidability · Sipser chapter 4</p>
        <h1>Machines that <em>always answer</em></h1>
        <p className="dec-lead">A <b>decider</b> is a Turing machine that halts on every input, with accept or reject. Each problem below has one, and the tools in the workspace are those deciders at work: the Test button runs A<Sub>DFA</Sub>, and Compare and the practice checker run EQ<Sub>DFA</Sub>.
          Pick a theorem, give it an input, and step through the algorithm from the proof. Each one comes with the reason it can never loop, which is the whole point.</p>
      </header>

      <div className="dec-picker" role="radiogroup" aria-label="Decidable language">
        {deciders.map(item => <button key={item.id} type="button" role="radio" aria-checked={item.id === selected}
          className={`dec-option ${item.id === 'atm' ? 'is-undecidable' : ''}`} onClick={() => setSelected(item.id)}>
          <span className="dec-option-name">{item.name}</span>
          <small>{item.theorem}</small>
          <span className="dec-option-blurb">{item.blurb}</span>
        </button>)}
      </div>

      <section className="dec-card" aria-labelledby="dec-title">
        <header className="dec-card-head">
          <h2 id="dec-title"><span>{current.name}</span><span className="dec-theorem">{current.theorem}</span></h2>
          <p className="dec-language">{statements[selected]}</p>
        </header>
        {selected === 'adfa' && <ADfa workspace={workspace.machines} />}
        {selected === 'anfa' && <ANfa workspace={workspace.machines} />}
        {selected === 'arex' && <ARex />}
        {selected === 'edfa' && <EDfa workspace={workspace.machines} />}
        {selected === 'eqdfa' && <EqDfa workspace={workspace.machines} />}
        {selected === 'acfg' && <ACfg workspace={workspace.grammars} />}
        {selected === 'ecfg' && <ECfg workspace={workspace.grammars} />}
        {selected === 'atm' && <ATm />}
      </section>
    </main>
  </div>
}

const statements: Record<DeciderId, ReactNode> = {
  adfa: <>A<Sub>DFA</Sub> = {'{'} ⟨B, w⟩ | B is a DFA that accepts input string w {'}'} is decidable.</>,
  anfa: <>A<Sub>NFA</Sub> = {'{'} ⟨B, w⟩ | B is an NFA that accepts input string w {'}'} is decidable.</>,
  arex: <>A<Sub>REX</Sub> = {'{'} ⟨R, w⟩ | R is a regular expression that generates string w {'}'} is decidable.</>,
  edfa: <>E<Sub>DFA</Sub> = {'{'} ⟨A⟩ | A is a DFA and L(A) = ∅ {'}'} is decidable.</>,
  eqdfa: <>EQ<Sub>DFA</Sub> = {'{'} ⟨A, B⟩ | A and B are DFAs and L(A) = L(B) {'}'} is decidable.</>,
  acfg: <>A<Sub>CFG</Sub> = {'{'} ⟨G, w⟩ | G is a CFG that generates string w {'}'} is decidable.</>,
  ecfg: <>E<Sub>CFG</Sub> = {'{'} ⟨G⟩ | G is a CFG and L(G) = ∅ {'}'} is decidable.</>,
  atm: <>A<Sub>TM</Sub> = {'{'} ⟨M, w⟩ | M is a TM and M accepts w {'}'} is <b>undecidable</b>.</>,
}
