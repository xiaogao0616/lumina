'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, CircleQuestionMark, Dices, FileDown, FileUp, FolderOpen,
  Play, TextCursorInput, TriangleAlert, Wrench, Zap,
} from 'lucide-react'
import { SOURCE_COLORS, inkColor } from '../lib/automaton-graph'
import {
  analyzeGrammar, cfgToPda, formatProduction, generateStrings, isNonterminal, parseGrammar, testMembership,
  type MembershipResult, type ParseTree,
} from '../lib/cfg'
import { readSavedGrammar, type SavedGrammar } from '../lib/editor-storage'
import { EXAMPLE_POOL_SIZE, randomTestString } from '../lib/accepted-strings'
import { ThemeToggle } from './theme-toggle'
import { WorkspaceCat } from './workspace-cat'
import { Dropdown, MenuItem } from './menus'
import { ExampleStrings, nextExampleBatch, type ExampleBatch } from './example-strings'
import type { OpenTab } from './automata-editor'

const DEFAULT_GRAMMAR = 'S → aSb | ε'
const DERIVE_STEP_MS = 520
const EXAMPLE_LENGTH = 20

const grammarExamples = [
  { name: 'aⁿbⁿ', grammar: 'S → aSb | ε' },
  { name: 'Balanced parentheses', grammar: 'S → SS | (S) | ε' },
  { name: 'Palindromes over {a, b}', grammar: 'S → aSa | bSb | a | b | ε' },
  { name: 'Arithmetic expressions', grammar: 'E → E+T | T\nT → T*F | F\nF → (E) | x' },
  { name: 'Equal numbers of a and b', grammar: 'S → aSbS | bSaS | ε' },
]

type PlacedNode = { id: number; symbol: string; x: number; y: number; parent: number | null; expandedAt: number; kind: 'nonterminal' | 'terminal' | 'epsilon' }

const LEAF_GAP = 46
const LEVEL_GAP = 72
const TREE_PAD = 36

/**
 * Lays a parse tree out top-down: leaves sit side by side in reading order and each parent is
 * centred over its children. Each nonterminal also records which step of the leftmost derivation
 * expands it, so the animation can grow the tree in the same order the derivation list reads.
 */
function layoutTree(tree: ParseTree): { nodes: PlacedNode[]; width: number; height: number } {
  const nodes: PlacedNode[] = []
  const refs = new Map<ParseTree, PlacedNode>()
  let leaf = 0
  let depthMax = 0
  const place = (node: ParseTree, depth: number, parent: number | null): PlacedNode => {
    const placed: PlacedNode = { id: nodes.length, symbol: node.symbol, x: 0, y: TREE_PAD + depth * LEVEL_GAP, parent, expandedAt: Infinity,
      kind: node.symbol === 'ε' ? 'epsilon' : isNonterminal(node.symbol) ? 'nonterminal' : 'terminal' }
    nodes.push(placed)
    refs.set(node, placed)
    depthMax = Math.max(depthMax, depth)
    if (!node.children.length) placed.x = TREE_PAD + leaf++ * LEAF_GAP
    else {
      const children = node.children.map(child => place(child, depth + 1, placed.id))
      placed.x = (children[0].x + children[children.length - 1].x) / 2
    }
    return placed
  }
  place(tree, 0, null)
  let frontier: ParseTree[] = [tree]
  for (let step = 0; ; step++) {
    const index = frontier.findIndex(node => isNonterminal(node.symbol) && node.children.length)
    if (index === -1) break
    refs.get(frontier[index])!.expandedAt = step
    frontier = [...frontier.slice(0, index), ...frontier[index].children.filter(child => child.symbol !== 'ε'), ...frontier.slice(index + 1)]
  }
  return { nodes, width: TREE_PAD * 2 + Math.max(0, leaf - 1) * LEAF_GAP, height: TREE_PAD * 2 + depthMax * LEVEL_GAP }
}

function ParseTreeView({ tree, shownSteps, colorOf }: { tree: ParseTree; shownSteps: number; colorOf: (symbol: string) => string }) {
  const { nodes, width, height } = useMemo(() => layoutTree(tree), [tree])
  const visible = (node: PlacedNode) => node.parent === null || nodes[node.parent].expandedAt < shownSteps
  // The expansion that just happened is drawn brighter; nothing is when the whole tree is shown at once.
  const latest = Number.isFinite(shownSteps) ? shownSteps - 1 : -1
  return <svg className="parse-tree" viewBox={`0 0 ${Math.max(width, 120)} ${height}`} width={Math.max(width, 120)} height={height} role="img" aria-label="Parse tree">
    {nodes.filter(node => node.parent !== null && visible(node)).map(node => {
      const parent = nodes[node.parent!]
      return <line key={`edge-${node.id}`} x1={parent.x} y1={parent.y + 16} x2={node.x} y2={node.y - 16}
        style={{ stroke: colorOf(parent.symbol) }} strokeOpacity={parent.expandedAt === latest ? 1 : 0.55} strokeWidth={parent.expandedAt === latest ? 2.4 : 1.6} />
    })}
    {nodes.filter(visible).map(node => {
      const color = node.kind === 'nonterminal' ? colorOf(node.symbol) : node.kind === 'epsilon' ? 'var(--muted)' : 'var(--text)'
      const pulsing = node.expandedAt === latest
      return <g key={node.id} className={`parse-node is-${node.kind} ${pulsing ? 'is-latest' : ''}`} style={{ color }}>
        {node.kind === 'nonterminal'
          ? <circle cx={node.x} cy={node.y} r={16} style={{ fill: 'var(--node-fill)', stroke: color }} strokeWidth={pulsing ? 2.6 : 1.5} />
          : <rect x={node.x - 14} y={node.y - 13} width={28} height={26} rx={6} style={{ fill: 'var(--label-fill)', stroke: color }} strokeOpacity={0.55} strokeWidth={1.2} />}
        <text x={node.x} y={node.y} style={{ fill: color }} textAnchor="middle" dominantBaseline="central">{node.symbol}</text>
      </g>
    })}
  </svg>
}

function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** A grammar tab: rules typed as text, with membership tests that show a derivation and a parse tree. */
export function GrammarLab({ saveKey, tabTitle, onConvert }: { saveKey: string; tabTitle: string; onConvert: OpenTab }) {
  const [grammarText, setGrammarText] = useState(DEFAULT_GRAMMAR)
  const [testString, setTestString] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [testPanelOpen, setTestPanelOpen] = useState(true)
  const [storageReady, setStorageReady] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Loading local grammar…')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [importError, setImportError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const testInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(saveKey)
      if (raw !== null) {
        const saved = readSavedGrammar(raw)
        setGrammarText(saved.grammar)
        setTestString(saved.testString)
      }
    } catch {
      setStorageBlocked(true)
      setSaveStatus('Could not restore local grammar. Existing save has not been overwritten.')
    }
    setStorageReady(true)
  }, [saveKey])
  const savedJson = JSON.stringify({ version: 1, mode: 'cfg', grammar: grammarText, testString } satisfies SavedGrammar)
  useEffect(() => {
    if (!storageReady || storageBlocked) return
    try {
      localStorage.setItem(saveKey, savedJson)
      setSaveStatus('Saved in this browser')
    } catch {
      setSaveStatus('Could not save. Keep this tab open and retry.')
    }
  }, [savedJson, storageReady, storageBlocked, saveAttempt, saveKey])

  const parsed = useMemo(() => parseGrammar(grammarText), [grammarText])
  const grammar = parsed.ok ? parsed.grammar : null
  const report = useMemo(() => grammar ? analyzeGrammar(grammar) : null, [grammar])
  const colorOf = useCallback((symbol: string) => {
    const index = grammar?.nonterminals.indexOf(symbol) ?? -1
    return inkColor(index === -1 ? '#9292a0' : SOURCE_COLORS[index % SOURCE_COLORS.length])
  }, [grammar])
  const issues = report ? [
    ...report.undefinedSymbols.map(symbol => ({ symbol, text: 'has no rules, so it can never finish' })),
    ...report.nonProductive.map(symbol => ({ symbol, text: 'never derives a string of terminals' })),
    ...report.unreachable.map(symbol => ({ symbol, text: `is never reached from ${grammar!.start}` })),
  ] : []

  // Results are keyed on the grammar and input they were computed from, like the automaton tests.
  const testKey = JSON.stringify([grammarText, testString])
  const [lastTest, setLastTest] = useState<{ key: string; result: MembershipResult } | null>(null)
  const testResult = lastTest?.key === testKey ? lastTest.result : null
  const [shownSteps, setShownSteps] = useState(Infinity)
  const [animating, setAnimating] = useState(false)
  const derivation = testResult?.status === 'accepted' ? testResult.derivation : []
  useEffect(() => {
    if (!animating) return
    if (shownSteps >= derivation.length - 1) { setAnimating(false); return }
    const timer = setTimeout(() => setShownSteps(steps => steps + 1), DERIVE_STEP_MS)
    return () => clearTimeout(timer)
  }, [animating, shownSteps, derivation.length])
  const runTest = (animate: boolean) => {
    setTestPanelOpen(true)
    if (!grammar) {
      setLastTest({ key: testKey, result: { status: 'error', message: parsed.ok ? '' : parsed.message } })
      return
    }
    const result = testMembership(grammar, testString)
    setLastTest({ key: testKey, result })
    setShownSteps(animate && result.status === 'accepted' ? 0 : Infinity)
    setAnimating(animate && result.status === 'accepted')
  }

  const [examples, setExamples] = useState<ExampleBatch | null>(null)
  useEffect(() => { setExamples(null) }, [grammarText])
  const generateExamples = () => {
    if (grammar) setExamples(nextExampleBatch(examples, () => ({ pool: generateStrings(grammar, EXAMPLE_POOL_SIZE, EXAMPLE_LENGTH), page: 0, maxLength: EXAMPLE_LENGTH })))
  }
  const convertToPda = () => {
    if (!grammar) return
    onConvert('pda', cfgToPda(grammar), { testString }, `PDA from ${tabTitle}`)
  }
  const insertAtCursor = (text: string) => {
    const area = textareaRef.current
    if (!area) { setGrammarText(current => current + text); return }
    const { selectionStart, selectionEnd } = area
    const next = grammarText.slice(0, selectionStart) + text + grammarText.slice(selectionEnd)
    setGrammarText(next)
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(selectionStart + text.length, selectionStart + text.length) })
  }
  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const saved = readSavedGrammar(String(reader.result))
        setGrammarText(saved.grammar)
        setTestString(saved.testString)
        setImportError('')
      } catch {
        setImportError('That file is not a valid saved CFG.')
      }
    }
    reader.readAsText(file)
  }

  const saveFailed = storageBlocked || saveStatus.startsWith('Could not')
  const summaryTone = !grammar ? 'is-bad' : issues.length ? 'is-bad' : 'is-good'
  const summary = !grammar ? 'Syntax error' : issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'All rules usable'
  const testHint = grammar ? 'Press Enter or Run animated to watch the derivation grow. Leave blank to test ε.' : 'Fix the grammar first; the error is shown under the rules.'
  const resultLabel = (status: MembershipResult['status']) => status === 'accepted' ? 'Derivable' : status === 'rejected' ? 'Not derivable' : 'Cannot run'
  const currentStep = Math.min(shownSteps, derivation.length - 1)

  if (!storageReady) return <main className="app-shell"><p role="status">Loading local grammar…</p></main>
  return <main className="app-shell is-cfg">
    <header className="topbar">
      <div className="brand">
        <Link className="brand-home" href="/" title="Automata Lab home"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span><span className="brand-name">Automata Lab</span></Link>
        <span className="mode-badge is-cfg" title="Context-free grammar">CFG</span>
        <h1 className="sr-only">Context-free grammar editor: {tabTitle}</h1>
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group">
        <Dropdown label="File" title="Import or export this grammar" trigger={<><FolderOpen size={15} aria-hidden="true" /> File <ChevronDown size={13} className="caret" aria-hidden="true" /></>}>
          {close => <>
            <MenuItem icon={FileUp} label="Import JSON…" hint="Replaces this tab with a saved CFG file" onSelect={() => importInputRef.current?.click()} close={close} />
            <div className="menu-separator" role="separator" />
            <MenuItem icon={FileDown} label="Export JSON" hint="Re-importable save of this grammar" onSelect={() => downloadFile('automata-lab-cfg.json', savedJson, 'application/json')} close={close} />
            <MenuItem icon={FileDown} label="Export text" hint="The rules as plain text" onSelect={() => downloadFile('automata-lab-cfg.txt', grammarText, 'text/plain')} close={close} />
          </>}
        </Dropdown>
        <input ref={importInputRef} type="file" accept="application/json" className="file-input-hidden"
          onChange={event => { const file = event.target.files?.[0]; if (file) importJson(file); event.target.value = '' }} />
        <Dropdown label="CFG tools" title="Convert this grammar or load an example"
          trigger={<><Wrench size={15} aria-hidden="true" /> CFG tools <ChevronDown size={13} className="caret" aria-hidden="true" /></>}>
          {close => <>
            <MenuItem icon={ArrowRightLeft} label="Convert to PDA" hint={grammar ? 'Standard construction, opens a new PDA tab' : 'Fix the grammar first'} disabled={!grammar} onSelect={convertToPda} close={close} />
            <div className="menu-separator" role="separator" />
            {grammarExamples.map(example => <MenuItem key={example.name} icon={BookOpen} label={`Example: ${example.name}`} hint="Replaces these rules"
              onSelect={() => setGrammarText(example.grammar)} close={close} />)}
          </>}
        </Dropdown>
      </div>
      <div className="toolbar-spacer" />
      <ThemeToggle />
      <div className={`save-status ${saveFailed ? 'is-error' : saveStatus.startsWith('Saved') ? 'is-ok' : ''}`} role="status"
        title="Only on this browser and device. Clearing browser data removes this grammar. Each tab saves separately.">
        <span className="save-dot" aria-hidden="true" /><span>{saveStatus}</span>
        {saveFailed && <button type="button" onClick={() => { setStorageBlocked(false); setSaveAttempt(current => current + 1) }}>{storageBlocked ? 'Replace local save' : 'Retry save'}</button>}
      </div>
      <button className="primary-button" type="button" onClick={() => { setTestPanelOpen(true); requestAnimationFrame(() => testInputRef.current?.focus()) }}
        title="Opens the test panel and focuses the input string. Does not run a string.">
        <TextCursorInput size={15} aria-hidden="true" /> Go to test
      </button>
    </header>
    {importError && <p className="convert-error" role="alert">{importError}</p>}
    <section className="workspace">
      <aside className={`sidebar grammar-sidebar ${sidebarOpen ? '' : 'is-collapsed'}`}>
        <div className="sidebar-head">
          <button className="sidebar-toggle icon-button" type="button" aria-label={sidebarOpen ? 'Collapse rules panel' : 'Expand rules panel'} aria-expanded={sidebarOpen}
            title={sidebarOpen ? 'Collapse' : 'Expand rules'} onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
          <span className="sidebar-title">Rules</span>
          <span className="count" title="Productions">{grammar?.productions.length ?? 0}</span>
          <Dropdown className="sidebar-help" label="CFG syntax" role="dialog" triggerClassName="icon-button" title="How to write rules"
            trigger={<CircleQuestionMark size={16} aria-hidden="true" />}>
            {() => <div className="help-popover">
              <h3>Context-free grammar</h3>
              <p>Each rule rewrites one nonterminal. A string is in the language when the start symbol can be rewritten into it.</p>
              <ul>
                <li>Write <b>S → aSb | ε</b>. <b>-&gt;</b> and <b>::=</b> work too.</li>
                <li>Nonterminals are single uppercase letters A–Z. Every other character is a terminal, and spaces are ignored.</li>
                <li>ε or an empty alternative is the empty string.</li>
                <li>The first rule&apos;s left side is the start symbol. Another line for the same letter adds more alternatives.</li>
                <li>Lines starting with # or // are comments.</li>
              </ul>
            </div>}
          </Dropdown>
        </div>
        <div className="sidebar-body grammar-body">
          <div className="grammar-insert" role="group" aria-label="Insert a symbol">
            {['→', 'ε', '|'].map(symbol => <button key={symbol} type="button" className="secondary-button" title={`Insert ${symbol}`} onClick={() => insertAtCursor(symbol === '|' ? ' | ' : symbol === '→' ? ' → ' : symbol)}>{symbol}</button>)}
          </div>
          <label htmlFor="grammar-text" className="sr-only">Grammar rules</label>
          <textarea id="grammar-text" ref={textareaRef} className="grammar-textarea" value={grammarText} spellCheck={false} autoComplete="off"
            aria-invalid={!parsed.ok} aria-describedby="grammar-status" placeholder={'S → aSb | ε'} rows={10}
            onChange={event => setGrammarText(event.target.value)} />
          <div id="grammar-status">{parsed.ok
            ? <dl className="grammar-facts">
              <div><dt>Start</dt><dd><span className="grammar-chip is-nonterminal" style={{ color: colorOf(parsed.grammar.start) }}>{parsed.grammar.start}</span></dd></div>
              <div><dt>Nonterminals</dt><dd>{parsed.grammar.nonterminals.map(symbol => <span key={symbol} className="grammar-chip is-nonterminal" style={{ color: colorOf(symbol) }}>{symbol}</span>)}</dd></div>
              <div><dt>Terminals</dt><dd>{parsed.grammar.terminals.length ? parsed.grammar.terminals.map(symbol => <span key={symbol} className="grammar-chip">{symbol}</span>) : <span className="diagnostics-empty">None</span>}</dd></div>
            </dl>
            : <p className="grammar-error" role="alert"><TriangleAlert size={13} aria-hidden="true" /> {parsed.message}</p>}</div>
        </div>
      </aside>
      <section className="canvas-area">
        <div className="canvas-toolbar">
          <div className="toolbar-stats">
            <span className="stat-pill">Rules <b>{grammar?.productions.length ?? 0}</b></span>
            <span className="stat-pill">Nonterminals <b>{grammar?.nonterminals.length ?? 0}</b></span>
            <span className="stat-pill">Terminals <b>{grammar?.terminals.length ?? 0}</b></span>
            <Dropdown className="diagnostics" label="Diagnostics" role="dialog" triggerClassName={`stat-pill diagnostic-pill ${summaryTone}`}
              title="Show all diagnostics" trigger={<>{summaryTone === 'is-good' ? <CircleCheck size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />}<span>{summary}</span><ChevronDown size={12} className="caret" aria-hidden="true" /></>}>
              {() => <div className="diagnostics-panel">
                {!parsed.ok ? <p className="diagnostics-empty">{parsed.message}</p> : <>
                  <dl className="diagnostics-facts">
                    <div><dt>Start symbol</dt><dd>{parsed.grammar.start}</dd></div>
                    <div><dt>Nullable</dt><dd>{report!.nullable.length ? report!.nullable.join(', ') : 'None'} <small>derive ε</small></dd></div>
                  </dl>
                  <section>
                    <h3>Unusable nonterminals <span className="count">{issues.length}</span></h3>
                    {issues.length ? <ul className="diagnostics-list">{issues.map((issue, index) => <li key={index}><code>{issue.symbol}</code> {issue.text}</li>)}</ul>
                      : <p className="diagnostics-empty">None</p>}
                  </section>
                  <section>
                    <h3>Productions <span className="count">{parsed.grammar.productions.length}</span></h3>
                    <ul className="diagnostics-list grammar-production-list">{parsed.grammar.productions.map((production, index) => <li key={index}>{formatProduction(production)}</li>)}</ul>
                  </section>
                </>}
              </div>}
            </Dropdown>
          </div>
        </div>
        <div className="flow-wrap derivation-area">
          {testResult?.status === 'accepted' && testResult.derivation.length ? <div className="derivation-layout">
            <div className="parse-tree-scroll"><ParseTreeView tree={testResult.tree} shownSteps={shownSteps} colorOf={colorOf} /></div>
            <aside className="derivation-panel" aria-label="Leftmost derivation">
              <header><span>Derivation</span><span className="stack-panel-move">Step {currentStep} of {derivation.length - 1}</span></header>
              <ol className="derivation-steps">{derivation.slice(0, currentStep + 1).map((form, index) => <li key={index} className={index === currentStep ? 'is-current' : ''}>
                <span className="derivation-arrow" aria-hidden="true">{index === 0 ? '' : '⇒'}</span><code>{form}</code>
              </li>)}</ol>
              {animating && <button type="button" className="text-button" onClick={() => { setAnimating(false); setShownSteps(Infinity) }}>Skip to the end</button>}
            </aside>
          </div> : <div className="canvas-empty-hint">{testResult?.status === 'rejected'
            ? 'No parse tree: this string is not in the language.'
            : 'Test a string below to see its parse tree and leftmost derivation here'}</div>}
          <WorkspaceCat result={testResult} watching={animating} placement="left" />
        </div>
        <section className="string-test-panel" aria-label="Terminals and string test">
          <button className="string-test-toggle" type="button" aria-expanded={testPanelOpen} aria-controls="cfg-test-content" onClick={() => setTestPanelOpen(open => !open)}>
            <span className="panel-bar-title">Terminals &amp; test{testResult && <span className={`test-result-badge is-${testResult.status}`}>{resultLabel(testResult.status)}</span>}</span>
            <span className="string-test-summary">{testPanelOpen ? 'Collapse' : 'Expand'} <span aria-hidden="true">{testPanelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span></span>
          </button>
          <div id="cfg-test-content" className="string-test-content" hidden={!testPanelOpen}>
            <section className="panel-region alphabet-editor" aria-labelledby="cfg-terminals-heading">
              <div className="region-head"><h2 id="cfg-terminals-heading">Terminals</h2><span className="count">{grammar?.terminals.length ?? 0}</span></div>
              <ul className="alphabet-chip-list">
                {grammar?.terminals.map(symbol => <li key={symbol} className="alphabet-chip"><span>{symbol}</span></li>)}
                {!grammar?.terminals.length && <li className="alphabet-chip-empty">No terminals yet. Lowercase letters, digits and symbols in your rules appear here.</li>}
              </ul>
            </section>
            <section className="panel-region test-region" aria-labelledby="cfg-test-heading">
              <div className="region-head"><h2 id="cfg-test-heading">Test &amp; generate</h2></div>
              <div className="string-test-row">
                <label htmlFor="cfg-test-string">Input</label>
                <div className="test-input-wrap">
                  <input ref={testInputRef} id="cfg-test-string" value={testString} onChange={event => setTestString(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); runTest(true) } }}
                    placeholder="e.g. aabb" autoComplete="off" spellCheck={false} aria-describedby="cfg-test-status" />
                  <span className="string-test-count">{testString.length === 0 ? 'ε' : `${Array.from(testString).length} chars`}</span>
                </div>
                <button className="icon-button is-bordered" type="button" onClick={() => setTestString(randomTestString(grammar?.terminals ?? []))} disabled={!grammar?.terminals.length}
                  aria-label="Fill in a random string" title="Fill in a random string (3-10 characters) from the terminals"><Dices size={16} /></button>
                <div className="run-group" role="group" aria-label="Test this string">
                  <button className="string-test-run" type="button" onClick={() => runTest(true)} title="Finds a derivation and grows the parse tree step by step (Enter)"><Play size={14} aria-hidden="true" /> Run animated</button>
                  <button className="string-test-instant" type="button" onClick={() => runTest(false)} title="Same check, but shows the whole parse tree right away"><Zap size={14} aria-hidden="true" /> Run instantly</button>
                </div>
              </div>
              <div id="cfg-test-status" role="status" className={`string-test-footer ${testResult ? `test-result is-${testResult.status}` : ''}`}>
                {testResult ? <><strong>{resultLabel(testResult.status)}</strong> · {testResult.message}</> : testHint}
              </div>
              <ExampleStrings batch={examples} noun="strings" emptyText="This grammar derives no string within a reasonable length." disabled={!grammar}
                onGenerate={generateExamples} onUse={example => { setTestString(example); testInputRef.current?.focus() }} />
            </section>
          </div>
        </section>
      </section>
    </section>
  </main>
}
