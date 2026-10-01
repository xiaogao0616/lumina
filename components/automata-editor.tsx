'use client'

import Link from 'next/link'
import { createContext, useContext, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, CirclePlus, CircleQuestionMark, CircleX, Copy, Dices, FileDown,
  FileUp, FolderOpen, GripVertical, ImageDown, ListChecks, Minimize2, Pencil, Play, Redo2, Regex, Sparkles, TextCursorInput,
  TriangleAlert, Trash2, Undo2, Wrench, X, Zap, type LucideIcon,
} from 'lucide-react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getBezierPath,
  MarkerType,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { completeWithSink, countEpsilonEdges, dfaAssignError, isDfaShaped, missingDfaTransitions, symbolConflicts } from '../lib/automata-dfa'
import { minimizeDfa } from '../lib/dfa-minimize'
import { regexToNfa } from '../lib/regex-to-nfa'
import { graphToSvg } from '../lib/graph-svg'
import { simulateAutomaton, type SimulationResult } from '../lib/automata-simulator'
import {
  SOURCE_COLORS,
  builtInCategories,
  graphFromEditor,
  indexedLabel,
  pickLeastUsedColor,
  sourceColor,
  transitionSymbols,
  type AutomatonGraph,
  type AutomatonMode,
  type StateCategory,
  type StateKind,
} from '../lib/automaton-graph'
import { routeEdge, type Circle } from '../lib/edge-geometry'
import {
  LEGACY_EDITOR_STORAGE_KEY,
  graphToSavedEditor,
  legacyModeTabsIndexKey,
  readLegacyModeTabsIndex,
  readSavedEditor,
  readTabsIndex,
  savedEditorHasContent,
  storageKey,
  tabStorageKey,
  tabsIndexKey,
  type SavedEditor,
  type SavedTab,
  type TabsIndex,
} from '../lib/editor-storage'
import { copyAsNfa, nfaToDfa } from '../lib/nfa-to-dfa'
import { findAcceptedStrings, randomTestString } from '../lib/accepted-strings'
import { findAnimatedPaths, type PathAttempt } from '../lib/path-animation'

type AutomataNodeData = { label: string; kind: StateKind; color?: string; related?: boolean; accepting?: boolean; onRename?: () => void; onDelete?: () => void; animating?: 'active' | 'accept' | 'reject'; animatingTick?: number }
type AutomataNode = Node<AutomataNodeData>

function withTransitionSymbols(edge: Edge, symbols: string[]): Edge {
  return { ...edge, data: { ...edge.data, symbols }, label: symbols.length ? symbols.join(', ') : '∅' }
}

/** A single reusable dialog: a plain alert (success/error), a confirm with Cancel + a destructive
 * action, or a prompt (Cancel + a text field) replacing window.prompt for renaming things. */
type DialogState =
  | { kind: 'alert'; tone: 'success' | 'error'; title: string; message: string }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; onConfirm: () => void }
  | { kind: 'prompt'; title: string; message?: string; initialValue: string; placeholder?: string; confirmLabel: string; onConfirm: (value: string) => void }

const dialogIcons = { success: CircleCheck, error: CircleX, warning: TriangleAlert }

function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const tone = state.kind === 'alert' ? state.tone : 'warning'
  const ToneIcon = dialogIcons[tone]
  const [draft, setDraft] = useState(state.kind === 'prompt' ? state.initialValue : '')
  const submit = () => {
    if (state.kind === 'prompt') {
      const value = draft.trim()
      if (value) state.onConfirm(value)
    } else if (state.kind === 'confirm') {
      state.onConfirm()
    }
    onClose()
  }
  return <div className="modal-overlay" role="presentation" onClick={onClose}>
    <div className={`modal-box is-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="modal-title" onClick={event => event.stopPropagation()}>
      <h3 id="modal-title"><ToneIcon className={`modal-icon is-${tone}`} size={17} aria-hidden="true" /> {state.title}</h3>
      {state.message && <p>{state.message}</p>}
      {state.kind === 'prompt' && <input className="modal-input" value={draft} autoFocus placeholder={state.placeholder}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submit() }} />}
      <div className="modal-actions">
        {state.kind !== 'alert' && <button type="button" className="modal-button" onClick={onClose}>Cancel</button>}
        <button type="button" className="modal-button is-primary" autoFocus={state.kind !== 'prompt'} onClick={submit}>
          {state.kind === 'alert' ? 'OK' : state.confirmLabel}
        </button>
      </div>
    </div>
  </div>
}

const edgeStyle = { stroke: '#9292a0', strokeWidth: 1.8 }
const edgeMarker = { type: MarkerType.ArrowClosed, color: '#b5b3c2', width: 18, height: 18 }
// Per-frame delay while animating a test string's walk: dead-end branches play fast (there can be
// several before an NFA gives up on them), the step that actually decides accept/reject is slower
// so the moment registers.
const ANIM_STEP_MS = 280
const ANIM_FINAL_MS = 650

const nfaInitialNodes: AutomataNode[] = [
  { id: 'q0', type: 'start', position: { x: 290, y: 168 }, data: { label: 'start₀', kind: 'start', color: SOURCE_COLORS[0] } },
  { id: 'q1', type: 'state', position: { x: 545, y: 88 }, data: { label: 'q₀', kind: 'state', color: SOURCE_COLORS[1] } },
  { id: 'q2', type: 'state', position: { x: 545, y: 248 }, data: { label: 'q₁', kind: 'state', color: SOURCE_COLORS[3] } },
  { id: 'q3', type: 'accept', position: { x: 800, y: 168 }, data: { label: 'accept₀', kind: 'accept', color: SOURCE_COLORS[2] } },
]
const nfaInitialEdges: Edge[] = [
  { id: 'e-q0-q1', source: 'q0', target: 'q1', type: 'routed', data: { symbols: ['a'] }, label: 'a', style: edgeStyle, markerEnd: edgeMarker },
  { id: 'e-q0-q2', source: 'q0', target: 'q2', type: 'routed', data: { symbols: ['a'] }, label: 'a', style: edgeStyle, markerEnd: edgeMarker },
  { id: 'e-q1-q3', source: 'q1', target: 'q3', type: 'routed', data: { symbols: ['ε'] }, label: 'ε', style: edgeStyle, markerEnd: edgeMarker },
]
const dfaInitialNodes: AutomataNode[] = [
  { id: 'q0', type: 'start', position: { x: 290, y: 168 }, data: { label: 'start₀', kind: 'start', color: SOURCE_COLORS[0] } },
  { id: 'q1', type: 'state', position: { x: 545, y: 168 }, data: { label: 'q₀', kind: 'state', color: SOURCE_COLORS[1] } },
  { id: 'q2', type: 'accept', position: { x: 800, y: 168 }, data: { label: 'accept₀', kind: 'accept', color: SOURCE_COLORS[2] } },
]
const dfaInitialEdges: Edge[] = [
  { id: 'e-q0-q1', source: 'q0', target: 'q1', type: 'routed', data: { symbols: ['a'] }, label: 'a', style: edgeStyle, markerEnd: edgeMarker },
  { id: 'e-q1-q2', source: 'q1', target: 'q2', type: 'routed', data: { symbols: ['b'] }, label: 'b', style: edgeStyle, markerEnd: edgeMarker },
]

function isAcceptingNode(data: AutomataNodeData) {
  return data.kind === 'accept' || !!data.accepting
}

function StateNode({ id, data, selected }: NodeProps<AutomataNode>) {
  const accepting = isAcceptingNode(data)
  return <div style={{ '--state-color': sourceColor({ id, data }) } as CSSProperties} className={`automata-node automata-node-${data.kind} ${accepting ? 'automata-node-accept' : ''} ${selected ? 'is-selected' : ''} ${data.related ? 'is-related' : ''} ${data.animating ? `is-anim-${data.animating}` : ''}`}><Handle type="target" position={Position.Left} id="target" /><span className="initial-marker" aria-hidden="true" /><span className="source-color-dot" style={{ background: sourceColor({ id, data }) }} aria-hidden="true" /><span className="state-name" title={data.label}>{data.label}</span><Handle type="source" position={Position.Right} id="source" />
    {data.animating === 'active' && <span key={data.animatingTick} className="node-pulse-ring" aria-hidden="true" />}
    {(data.animating === 'accept' || data.animating === 'reject') && <span className={`node-result-glow is-${data.animating}`} aria-hidden="true" />}
    {(data.onRename || data.onDelete) && <div className="node-actions nodrag nopan" onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
      <button type="button" aria-label={`Rename ${data.label}`} title="Rename" onClick={event => { event.stopPropagation(); data.onRename?.() }}><Pencil size={13} /></button>
      <button type="button" aria-label={`Delete ${data.label}`} title="Delete" onClick={event => { event.stopPropagation(); data.onDelete?.() }}><Trash2 size={13} /></button>
    </div>}
  </div>
}

type TransitionActions = {
  mode: AutomatonMode
  symbols: string[]
  assign: (edgeId: string, symbol: string) => string | null
  removeEdge: (edgeId: string) => void
  closeTransitionEditor: (edgeId: string) => void
  addSymbol: (symbol: string) => string | null
  removeSymbol: (symbol: string) => void
}
const TransitionContext = createContext<TransitionActions | null>(null)

function TransitionEditor({ edgeId, value, heading }: { edgeId: string; value: string[]; heading: string }) {
  const actions = useContext(TransitionContext)!
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const listId = useId()
  const editorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const editor = editorRef.current
    const anchor = editor?.parentElement
    const canvas = editor?.closest('.react-flow')
    if (!editor || !anchor || !canvas) return
    const place = () => {
      anchor.style.translate = '0px 0px'
      const bounds = canvas.getBoundingClientRect()
      const scale = editor.getBoundingClientRect().width / editor.offsetWidth || 1
      editor.style.maxHeight = `${Math.max(60, bounds.height - 16) / scale}px`
      const box = editor.getBoundingClientRect()
      const dx = Math.max(bounds.left + 8 - box.left, Math.min(0, bounds.right - 8 - box.right))
      const dy = Math.max(bounds.top + 8 - box.top, Math.min(0, bounds.bottom - 8 - box.bottom))
      anchor.style.translate = `${dx / scale}px ${dy / scale}px`
    }
    const observer = new ResizeObserver(place)
    observer.observe(editor)
    observer.observe(canvas)
    place()
    return () => observer.disconnect()
  }, [])
  const choose = (symbol: string) => {
    const message = actions.assign(edgeId, symbol)
    setError(message ?? '')
  }
  return <section ref={editorRef} className="transition-editor nodrag nopan nowheel" aria-label="Edit transition"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation() }}>
    <header><span>{heading}</span><div className="transition-editor-actions">
      <button type="button" className="transition-remove" aria-label="Delete transition" title="Delete transition"
        onClick={() => actions.removeEdge(edgeId)}>Delete</button>
      <button type="button" className="transition-close" aria-label="Close editor" title="Close editor"
        onClick={() => actions.closeTransitionEditor(edgeId)}><X size={15} /></button>
    </div></header>
    <div className="symbol-summary">Inputs: {value.length ? value.join(', ') : 'None'}</div>
    <div id={listId} className="symbol-dropdown">
      {actions.mode === 'nfa' && <div className="symbol-option"><button type="button" aria-pressed={value.includes('ε')} onClick={() => choose('ε')}>ε · Empty input</button><span title="Permanent option">Fixed</span></div>}
      {actions.symbols.map(symbol => <div className="symbol-option" key={symbol}>
        <button type="button" aria-pressed={value.includes(symbol)} onClick={() => choose(symbol)}>{symbol}</button>
        <button type="button" className="symbol-remove" aria-label={`Delete symbol ${symbol} everywhere`}
          title="Remove this character from all transitions" onClick={() => actions.removeSymbol(symbol)}><X size={14} /></button>
      </div>)}
      <form onSubmit={event => {
        event.preventDefault()
        const symbol = draft.trim().normalize('NFC')
        const message = actions.addSymbol(symbol)
        if (message) { setError(message); return }
        const assigned = actions.assign(edgeId, symbol)
        if (assigned) { setError(assigned); return }
        setDraft(''); setError('')
      }}>
        <p className="symbol-selection-hint">{actions.mode === 'dfa'
          ? 'Each character may leave this state on only one arrow. Missing characters reject during a test.'
          : 'Click to highlight the inputs allowed on this transition. Click again to deselect.'}</p>
        <label htmlFor={`${listId}-new`}>Add a character</label>
        <div><input id={`${listId}-new`} value={draft} placeholder="e.g. a"
          aria-invalid={!!error} onChange={event => { setDraft(event.target.value); setError('') }} />
        <button type="submit">Add</button></div>
        {error && <p role="alert">{error}</p>}
      </form>
      <small>{actions.mode === 'dfa'
        ? 'No highlighted inputs (∅) means this path is inactive. Add alphabet characters before they can label a DFA arrow.'
        : 'Deleting a character removes it from all transitions. No highlighted inputs (∅) means this path is inactive.'}</small>
    </div>
  </section>
}

type RoutedEdgeData = { symbols?: string[]; editingDisabled?: boolean; obstacles?: Circle[]; curved?: boolean; color?: string; dimmed?: boolean; emphasized?: boolean; focused?: boolean; animating?: boolean; animatingTick?: number }
type AutomataEdge = Edge<RoutedEdgeData>

function RoutedEdge({ id, source, target, style, data, label, selected }: EdgeProps<AutomataEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const markerId = `transition-arrow-${useId().replace(/:/g, '')}`
  const preferredSide = useRef(1)
  const circle = (node: NonNullable<typeof sourceNode>) => {
    const width = node.measured.width ?? 74
    const height = node.measured.height ?? 74
    return { x: node.internals.positionAbsolute.x + width / 2,
      y: node.internals.positionAbsolute.y + height / 2, radius: Math.min(width, height) / 2 }
  }
  const route = sourceNode && targetNode
    ? routeEdge(circle(sourceNode), circle(targetNode), source === target, !!data?.curved, data?.obstacles, preferredSide.current)
    : null
  useEffect(() => { if (route?.side) preferredSide.current = route.side }, [route?.side])
  if (!route || !sourceNode || !targetNode) return null
  const color = data?.color ?? String(style?.stroke ?? '#9292a0')
  const emphasized = data?.emphasized || selected
  const opacity = data?.dimmed ? 0.18 : 1
  const caption = label
  const points = [route.start, ...route.controls, route.end]
  while (points.length > 1) {
    for (let i = 0; i < points.length - 1; i++) points[i] = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    points.pop()
  }
  const labelPoint = points[0]
  return <>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="10" refY="5"
      markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} stroke="none" />
    </marker></defs>
    <BaseEdge id={id} path={route.path} markerEnd={`url(#${markerId})`}
      style={{ ...style, stroke: color, opacity, strokeWidth: emphasized || data?.animating ? 3 : 1.8 }} interactionWidth={24} />
    {data?.animating && <EdgeLabelRenderer><div key={data.animatingTick} className="edge-pulse" style={{
      transform: `translate(-50%, -50%) translate(${labelPoint.x}px,${labelPoint.y}px)`, color,
    }} aria-hidden="true" /></EdgeLabelRenderer>}
    {caption != null && <EdgeLabelRenderer><div className="edge-label" style={{
      color: data?.dimmed ? `color-mix(in srgb, ${color} 35%, #17171c)` : color,
      borderColor: 'currentColor', zIndex: data?.focused ? 20 : 1,
      transform: `translate(-50%, -50%) translate(${labelPoint.x}px,${labelPoint.y}px)`
    }}>{caption}</div></EdgeLabelRenderer>}
    {route.blocked && <EdgeLabelRenderer><div className="edge-route-warning" style={{ transform: `translate(-50%, 16px) translate(${labelPoint.x}px,${labelPoint.y}px)` }}>Move a state to clear this path</div></EdgeLabelRenderer>}
    {selected && !data?.editingDisabled && <EdgeLabelRenderer><div className="transition-editor-anchor" style={{
      transform: `translate(-50%, 12px) translate(${route.label.x}px,${route.label.y}px)`
    }}><TransitionEditor edgeId={id} value={transitionSymbols({ data, label })}
      heading={`${String(sourceNode.data.label)} → ${String(targetNode.data.label)}`} /></div></EdgeLabelRenderer>}
  </>
}
const nodeTypes = { state: StateNode, start: StateNode, accept: StateNode }
const edgeTypes = { routed: RoutedEdge }

function PaletteItem({ category, title, subtitle, onDragStart, onClick }: {
  category: StateCategory; title: string; subtitle: string;
  onDragStart: (event: React.DragEvent, categoryId: string) => void; onClick?: () => void
}) {
  const kind = category.kind
  return <button className="palette-item" draggable onClick={onClick}
    onDragStart={event => onDragStart(event, category.id)} type="button">
    <span className={`palette-icon palette-icon-${kind}`}>{kind === 'start' ? '→' : kind === 'accept' ? '◎' : '○'}</span>
    <span className="palette-copy"><strong title={title}>{title}</strong><small>{subtitle}</small></span>
    <span className="drag-grip" aria-hidden="true"><GripVertical size={15} /></span>
  </button>
}

function ConnectionPreview({ sourcePoint, pointer, color }: { color: string; sourcePoint: { x: number; y: number }; pointer: { x: number; y: number } }) {
  const [path] = getBezierPath({ sourceX: sourcePoint.x, sourceY: sourcePoint.y, sourcePosition: Position.Right, targetX: pointer.x, targetY: pointer.y, targetPosition: Position.Left, curvature: 0.25 })
  return <svg style={{ '--state-color': color } as CSSProperties} className="connection-preview" aria-hidden="true"><defs><marker id="preview-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill={color} /></marker></defs><path d={path} markerEnd="url(#preview-arrow)" /></svg>
}

function graphToFlow(graph: AutomatonGraph): { nodes: AutomataNode[]; edges: Edge[] } {
  return {
    nodes: graph.states.map(state => ({
      id: state.id,
      type: state.kind,
      position: state.position,
      data: { label: state.label, kind: state.kind, color: state.color, accepting: state.accepting },
    })),
    edges: graph.transitions.map(transition => withTransitionSymbols({
      id: transition.id,
      source: transition.source,
      target: transition.target,
      type: 'routed',
      data: {},
      style: edgeStyle,
      markerEnd: edgeMarker,
    } as Edge, transition.symbols)),
  }
}

function savedToFlow(saved: SavedEditor): { nodes: AutomataNode[]; edges: Edge[] } {
  return {
    nodes: saved.nodes.map(node => ({
      id: node.id,
      type: node.data.kind,
      position: node.position,
      data: { label: node.data.label, kind: node.data.kind, color: node.data.color, accepting: node.data.accepting },
    })),
    edges: saved.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'routed',
      data: { symbols: edge.symbols },
      label: edge.symbols.length ? edge.symbols.join(', ') : '∅',
      style: edgeStyle,
      markerEnd: edgeMarker,
    })),
  }
}

function defaultEdgeSymbols(mode: AutomatonMode, source: string, alphabet: string[], current: Edge[]): string[] {
  if (mode === 'nfa') return ['ε']
  const first = alphabet[0]
  if (!first) return []
  return current.some(edge => edge.source === source && transitionSymbols(edge).includes(first)) ? [] : [first]
}

/** Button + floating panel (menus, help, diagnostics). Closes on outside pointerdown or Escape. */
function Dropdown({ label, trigger, title, className = '', triggerClassName = 'tool-button', align = 'start', role = 'menu', children }: {
  label: string; trigger: React.ReactNode; title?: string; className?: string; triggerClassName?: string
  align?: 'start' | 'end'; role?: 'menu' | 'dialog'; children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as globalThis.Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown) }
  }, [open])
  return <div ref={rootRef} className={`dropdown ${className}`}>
    <button type="button" className={triggerClassName} aria-haspopup={role === 'menu' ? 'menu' : 'dialog'} aria-expanded={open}
      aria-label={label} title={title} onClick={() => setOpen(value => !value)}>{trigger}</button>
    {open && <div className={`dropdown-panel is-${align} is-${role}`} role={role} aria-label={label}>{children(() => setOpen(false))}</div>}
  </div>
}

function MenuItem({ icon: Icon, label, hint, disabled, onSelect, close }: {
  icon: LucideIcon; label: string; hint?: string; disabled?: boolean; onSelect: () => void; close: () => void
}) {
  return <button type="button" className="menu-item" role="menuitem" disabled={disabled} onClick={() => { close(); onSelect() }}>
    <Icon size={16} aria-hidden="true" /><span className="menu-item-copy"><span>{label}</span>{hint && <small>{hint}</small>}</span>
  </button>
}

type OpenTab = (mode: AutomatonMode, graph?: AutomatonGraph, extras?: Parameters<typeof graphToSavedEditor>[2], title?: string) => void

function AutomataLab({ mode, saveKey, tabTitle, onConvert }: { mode: AutomatonMode; saveKey: string; tabTitle: string; onConvert: OpenTab }) {
  const isDfa = mode === 'dfa'
  const [testPanelOpen, setTestPanelOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [alphabetOpen, setAlphabetOpen] = useState(false)
  const [testString, setTestString] = useState('')
  const [convertError, setConvertError] = useState('')
  const testInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (testPanelOpen) testInputRef.current?.focus() }, [testPanelOpen])
  const [categories, setCategories] = useState<StateCategory[]>(builtInCategories)
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const nextIndices = useRef(new Map(isDfa ? [['start', 1], ['q', 1], ['accept', 1]] : [['start', 1], ['q', 2], ['accept', 1]]))
  const addCategory = (event: React.FormEvent) => {
    event.preventDefault()
    const name = categoryName.trim().normalize('NFC')
    if (!name) { setCategoryError('Enter a category name.'); return }
    if (['start', 'accept'].includes(name.toLowerCase())) {
      setCategoryError('Start and accept are reserved names.'); return
    }
    if (categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
      setCategoryError('This category already exists.'); return
    }
    const id = `category-${crypto.randomUUID()}`
    nextIndices.current.set(id, 0)
    setCategories(current => [...current, { id, name, kind: 'state' }])
    setCategoryName(''); setCategoryError(''); setAddingCategory(false)
  }
  const [nodes, setNodes, onNodesChange] = useNodesState<AutomataNode>(isDfa ? dfaInitialNodes : nfaInitialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(isDfa ? dfaInitialEdges : nfaInitialEdges)
  const simulationStates = nodes.map(node => ({ id: node.id, label: node.data.label, start: node.data.kind === 'start', accepting: isAcceptingNode(node.data) }))
  const simulationTransitions = edges.map(edge => ({ source: edge.source, target: edge.target, symbols: transitionSymbols(edge) }))
  const simulationKey = JSON.stringify([simulationStates, simulationTransitions, testString])
  const [lastTest, setLastTest] = useState<{ key: string; result: SimulationResult } | null>(null)
  const testResult = lastTest?.key === simulationKey ? lastTest.result : null
  const runTest = () => setLastTest({ key: simulationKey, result: simulateAutomaton(simulationStates, simulationTransitions, testString) })
  const [symbols, setSymbols] = useState<string[]>(isDfa ? ['a', 'b'] : ['a'])
  // Animates the walk a legal test string takes through the graph: one frame per edge taken
  // (an ε-move is its own frame), state-by-state, trying one NFA branch at a time until an
  // accepting one is found or every branch has been shown. `tick` only exists so the pulse on a
  // revisited state/edge (e.g. a self-loop read twice) remounts and replays instead of no-opping.
  const [animation, setAnimation] = useState<{ attempts: PathAttempt[]; attemptIndex: number; frameIndex: number; truncated: boolean; tick: number } | null>(null)
  useEffect(() => { setLastTest(null); setAnimation(null) }, [simulationKey])
  useEffect(() => {
    if (!animation) return
    const attempt = animation.attempts[animation.attemptIndex]
    if (!attempt) return
    const isLastFrameOfAttempt = animation.frameIndex === attempt.frames.length - 1
    const isLastAttempt = animation.attemptIndex === animation.attempts.length - 1
    const concluding = isLastFrameOfAttempt && (attempt.accepted || isLastAttempt)
    const delay = attempt.accepted || isLastAttempt ? ANIM_FINAL_MS : ANIM_STEP_MS
    const timer = setTimeout(() => {
      if (concluding) {
        const result = simulateAutomaton(simulationStates, simulationTransitions, testString)
        // No popup — the status badge and the line below the input already say Accepted/Rejected;
        // the truncation caveat (if any) is folded into that same line instead of its own dialog.
        const message = `${result.message}${animation.truncated ? ` (stopped after ${animation.attempts.length} path(s) without finding an accepting one — there may be more.)` : ''}`
        setLastTest({ key: simulationKey, result: { ...result, message } })
        return
      }
      setAnimation(current => {
        if (!current) return current
        const currentAttempt = current.attempts[current.attemptIndex]
        return current.frameIndex + 1 < currentAttempt.frames.length
          ? { ...current, frameIndex: current.frameIndex + 1, tick: current.tick + 1 }
          : { ...current, attemptIndex: current.attemptIndex + 1, frameIndex: 0, tick: current.tick + 1 }
      })
    }, delay)
    return () => clearTimeout(timer)
    // Deliberately keyed on `animation` alone: simulationStates/simulationTransitions are fresh
    // array literals every render, so including them (or testString/simulationKey, which are
    // derived from them) would re-fire this effect on every unrelated render — rescheduling the
    // "concluding" timeout forever and reopening the dialog in a loop that no Cancel/OK can escape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation])
  const runAnimatedTest = useCallback(() => {
    const starts = nodes.filter(node => node.data.kind === 'start')
    const everyCharDeclared = Array.from(testString).every(character => symbols.includes(character))
    if (starts.length !== 1 || !everyCharDeclared) { runTest(); return } // let the plain simulator's own error/reject messages handle it
    const startNode = starts[0]
    const simpleStates = nodes.map(node => ({ id: node.id, accepting: isAcceptingNode(node.data) }))
    const simpleEdges = edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, symbols: transitionSymbols(edge) }))
    const { attempts, truncated } = findAnimatedPaths(simpleStates, simpleEdges, startNode.id, testString)
    if (!attempts.length) { runTest(); return }
    setAnimation({ attempts, attemptIndex: 0, frameIndex: 0, truncated, tick: 0 })
  }, [nodes, edges, testString, symbols])
  const activeAttempt = animation ? animation.attempts[animation.attemptIndex] : null
  const activeFrame = activeAttempt ? activeAttempt.frames[animation!.frameIndex] : null
  const activeKind: 'active' | 'accept' | 'reject' | null = !activeFrame || !animation ? null
    : animation.frameIndex !== activeAttempt!.frames.length - 1 ? 'active'
    : activeAttempt!.accepted ? 'accept'
    : animation.attemptIndex === animation.attempts.length - 1 ? 'reject'
    : 'active'
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [newSymbolDraft, setNewSymbolDraft] = useState('')
  const [storageReady, setStorageReady] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Loading local graph…')
  const [saveAttempt, setSaveAttempt] = useState(0)
  // Bumped whenever an action replaces the whole graph in place (minimize, complete-with-sink) so a
  // brief flash can tell the user "the layout just got rebuilt" instead of it silently snapping.
  const [reshapeTick, setReshapeTick] = useState(0)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(saveKey)
      if (raw !== null) {
        const saved = readSavedEditor(raw, mode)
        const flow = savedToFlow(saved)
        setNodes(flow.nodes)
        setEdges(flow.edges)
        setCategories(saved.categories)
        nextIndices.current = new Map(saved.nextIndices)
        setSymbols(saved.symbols)
        setTestString(saved.testString)
      }
    } catch {
      setStorageBlocked(true)
      setSaveStatus('Could not restore local graph. Existing save has not been overwritten.')
    }
    setStorageReady(true)
  }, [saveKey, mode, setNodes, setEdges])
  const savedEditor: SavedEditor = {
    version: 2,
    mode,
    nodes: nodes.map(node => ({ id: node.id, type: node.data.kind, position: node.position,
      data: { label: node.data.label, kind: node.data.kind, color: sourceColor(node), ...(node.data.kind === 'start' && node.data.accepting ? { accepting: true as const } : {}) } })),
    edges: edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, symbols: transitionSymbols(edge) })),
    categories, nextIndices: [...nextIndices.current], symbols, testString,
  }
  const savedJson = JSON.stringify(savedEditor)
  useEffect(() => {
    if (!storageReady || storageBlocked) return
    try {
      localStorage.setItem(saveKey, savedJson)
      setSaveStatus('Saved in this browser')
    } catch {
      setSaveStatus('Could not save. Keep this tab open and retry.')
    }
  }, [savedJson, storageReady, storageBlocked, saveAttempt, saveKey])
  const graph = useMemo(() => graphFromEditor(nodes, edges, symbols), [nodes, edges, symbols])
  const conflicts = useMemo(() => symbolConflicts(graph), [graph])
  const missing = useMemo(() => missingDfaTransitions(graph), [graph])
  const epsilonCount = useMemo(() => countEpsilonEdges(graph), [graph])
  useEffect(() => { setConvertError('') }, [savedJson])
  const assignSymbol = useCallback((edgeId: string, symbol: string) => {
    if (mode === 'dfa') {
      const message = dfaAssignError(graphFromEditor(nodes, edges, symbols), edgeId, symbol)
      if (message) return message
    }
    setEdges(current => current.map(edge => {
      if (edge.id !== edgeId) return edge
      const selected = transitionSymbols(edge)
      return withTransitionSymbols(edge, selected.includes(symbol) ? selected.filter(item => item !== symbol) : [...selected, symbol])
    }))
    return null
  }, [mode, nodes, edges, symbols, setEdges])
  const removeEdge = useCallback((edgeId: string) => {
    setEdges(current => current.filter(edge => edge.id !== edgeId))
  }, [setEdges])
  const addSymbol = useCallback((symbol: string) => {
    if (Array.from(symbol).length !== 1 || !symbol.trim()) return 'Enter exactly one character.'
    if (symbol === 'ε') return mode === 'dfa' ? 'DFA transitions cannot use ε. Switch to the NFA lab for empty moves.' : 'ε is already available and cannot be changed.'
    if (symbols.includes(symbol)) return 'This character already exists.'
    setSymbols(current => current.includes(symbol) ? current : [...current, symbol])
    return null
  }, [mode, symbols])
  const removeSymbol = useCallback((symbol: string) => {
    if (symbol === 'ε') return
    setSymbols(current => current.filter(item => item !== symbol))
    setEdges(current => current.map(edge => {
      const selected = transitionSymbols(edge)
      return selected.includes(symbol) ? withTransitionSymbols(edge, selected.filter(item => item !== symbol)) : edge
    }))
  }, [setEdges])
  // Removing a character already in use clears it from every transition that has it (see removeSymbol
  // above) — ask first so that isn't a surprise; an unused character is removed with no prompt.
  const confirmRemoveSymbol = useCallback((symbol: string) => {
    const inUse = graph.transitions.some(transition => transition.symbols.includes(symbol))
    if (!inUse) { removeSymbol(symbol); return }
    setDialog({
      kind: 'confirm', title: 'Remove this character?', confirmLabel: 'Remove',
      message: `"${symbol}" is used on at least one transition. Removing it will clear it from every transition that uses it, and those may need to be reassigned.`,
      onConfirm: () => removeSymbol(symbol),
    })
  }, [graph, removeSymbol])
  // Per symbol, for a DFA: how many states already have an outgoing transition for it, out of all states.
  const symbolUsage = useMemo(() => {
    const totalStates = graph.states.length
    const usage = new Map<string, 'unused' | 'partial' | 'full'>()
    for (const symbol of symbols) {
      const missingCount = missing.filter(item => item.symbol === symbol).length
      usage.set(symbol, missingCount === totalStates ? 'unused' : missingCount === 0 ? 'full' : 'partial')
    }
    return usage
  }, [symbols, missing, graph])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const suppressEdgeHoverId = useRef<string | null>(null)
  const [draggingState, setDraggingState] = useState(false)
  const [overDeleteArea, setOverDeleteArea] = useState(false)
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow()
  const nodeCounts = useMemo(() => ({ start: nodes.filter((node) => node.data.kind === 'start').length, state: nodes.filter((node) => node.data.kind === 'state').length, accept: nodes.filter((node) => isAcceptingNode(node.data)).length }), [nodes])
  const connectingNode = nodes.find((node) => node.id === connectingId)
  const focusedEdge = connectingId ? undefined : edges.find(edge => edge.selected) ?? edges.find(edge => edge.id === hoveredEdgeId)
  const focusedNodeId = connectingId || focusedEdge ? null : hoveredNodeId
  const routedEdges = useMemo(() => edges.map((edge) => {
    const reversePair = edges.some(other => other.id !== edge.id && other.source === edge.target && other.target === edge.source)
    const focused = focusedEdge?.id === edge.id
    const emphasized = focused || focusedNodeId === edge.source
    const dimmed = !!(focusedEdge || focusedNodeId) && !emphasized
    return { ...edge, type: 'routed', zIndex: emphasized ? 5 : 0,
      data: { ...edge.data, editingDisabled: !!connectingId, obstacles: nodes.filter(node => node.id !== edge.source && node.id !== edge.target).map(node => {
        const width = node.measured?.width ?? 74, height = node.measured?.height ?? 74
        return { x: node.position.x + width/2, y: node.position.y + height/2, radius: Math.max(width,height)/2 }
      }), curved: reversePair, color: sourceColor(nodes.find(node => node.id === edge.source) ?? { id: edge.source }),
        focused, emphasized, dimmed, animating: !!activeFrame && edge.id === activeFrame.edgeId, animatingTick: animation?.tick } }
  }), [edges, nodes, focusedEdge, focusedNodeId, connectingId, activeFrame, animation])

  const applyNewEdge = useCallback((connection: Connection, current: Edge[], id?: string) => {
    const nextSymbols = defaultEdgeSymbols(mode, connection.source ?? '', symbols, current)
    return addEdge({
      ...connection,
      ...(id ? { id } : {}),
      type: 'routed',
      data: { symbols: nextSymbols },
      label: nextSymbols.length ? nextSymbols.join(', ') : '∅',
      style: edgeStyle,
      markerEnd: edgeMarker,
    }, current)
  }, [mode, symbols])
  const onConnect = useCallback((connection: Connection) => setEdges(current => applyNewEdge(connection, current)), [applyNewEdge, setEdges])
  const onDragStart = useCallback((event: React.DragEvent, categoryId: string) => {
    event.dataTransfer.setData('application/automata-node', categoryId)
    event.dataTransfer.effectAllowed = 'copy'
  }, [])
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const categoryId = event.dataTransfer.getData('application/automata-node')
    const category = categories.find(item => item.id === categoryId)
    if (!category) return
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    let index = nextIndices.current.get(category.id) ?? 0
    while (nodes.some(node => node.data.label === indexedLabel(category.name, index))) index++
    nextIndices.current.set(category.id, index + 1)
    const color = pickLeastUsedColor(nodes.map(node => sourceColor(node)))
    const newNode: AutomataNode = { id: crypto.randomUUID(), type: category.kind,
      position: { x: position.x - 37, y: position.y - 37 },
      data: { label: indexedLabel(category.name, index), kind: category.kind, color } }
    setNodes(current => current.concat(newNode))
  }, [categories, nodes, screenToFlowPosition, setNodes])

  const cancelConnection = useCallback(() => setConnectingId(null), [])
  const exitTransitionFocus = useCallback((edgeId?: string) => {
    if (edgeId) suppressEdgeHoverId.current = edgeId
    cancelConnection()
    setSelectedId(null)
    setHoveredNodeId(null)
    setHoveredEdgeId(null)
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
  }, [cancelConnection, setEdges])
  const closeTransitionEditor = useCallback((edgeId: string) => {
    exitTransitionFocus(edgeId)
  }, [exitTransitionFocus])
  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.id === suppressEdgeHoverId.current) return
    setHoveredEdgeId(edge.id)
  }, [])
  const onEdgeMouseLeave = useCallback(() => {
    suppressEdgeHoverId.current = null
    setHoveredEdgeId(null)
  }, [])
  const transitionActions = useMemo(() => ({ mode, symbols, assign: assignSymbol, removeEdge, closeTransitionEditor, addSymbol, removeSymbol }),
    [mode, symbols, assignSymbol, removeEdge, closeTransitionEditor, addSymbol, removeSymbol])
  const finishConnection = useCallback((targetId: string) => {
    if (!connectingId) return
    setEdges(current => applyNewEdge({ source: connectingId, target: targetId, sourceHandle: null, targetHandle: null }, current, `e-${connectingId}-${targetId}-${Date.now()}`))
    setConnectingId(null)
    setSelectedId(targetId)
  }, [connectingId, applyNewEdge, setEdges])
  const onNodeClick = useCallback((event: React.MouseEvent, node: AutomataNode) => {
    event.stopPropagation()
    if (connectingId) { finishConnection(node.id); return }
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (bounds) setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
    setSelectedId(node.id)
    setConnectingId(node.id)
  }, [connectingId, finishConnection, setEdges])
  const onNodeDragStart = useCallback((_: MouseEvent | TouchEvent, node: AutomataNode) => {
    cancelConnection()
    setDraggingState(true)
    setOverDeleteArea(false)
    setSelectedId(node.id)
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
  }, [cancelConnection, setEdges])
  const isOverSidebar = useCallback((event: MouseEvent | TouchEvent) => {
    const bounds = sidebarRef.current?.getBoundingClientRect()
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    return !!bounds && !!point && point.clientX >= bounds.left && point.clientX < bounds.right
      && point.clientY >= bounds.top && point.clientY < bounds.bottom
  }, [])
  const onNodeDrag = useCallback((event: MouseEvent | TouchEvent) => {
    setOverDeleteArea(isOverSidebar(event))
  }, [isOverSidebar])
  const onNodeDragStop = useCallback((event: MouseEvent | TouchEvent, node: AutomataNode) => {
    setDraggingState(false)
    setOverDeleteArea(false)
    if (event.type === 'touchcancel' || !isOverSidebar(event)) return
    setNodes(current => current.filter(item => item.id !== node.id))
    setEdges(current => current.filter(edge => edge.source !== node.id && edge.target !== node.id))
    setSelectedId(current => current === node.id ? null : current)
    setHoveredNodeId(current => current === node.id ? null : current)
    cancelConnection()
  }, [isOverSidebar, setNodes, setEdges, cancelConnection])
  const onPaneClick = useCallback(() => {
    cancelConnection()
    setSelectedId(null)
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
  }, [cancelConnection, setEdges])
  const onEdgeClick = useCallback((_: React.MouseEvent, clickedEdge: Edge) => {
    cancelConnection()
    setSelectedId(null)
    setEdges(current => current.map(edge => ({ ...edge, selected: edge.id === clickedEdge.id })))
  }, [cancelConnection, setEdges])
  const onPaneMouseMove = useCallback((event: React.MouseEvent) => { if (!connectingId || !reactFlowWrapper.current) return; const bounds = reactFlowWrapper.current.getBoundingClientRect(); setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) }, [connectingId])
  const previewSourcePoint = connectingNode && reactFlowWrapper.current ? (() => { const bounds = reactFlowWrapper.current.getBoundingClientRect(); const point = flowToScreenPosition({ x: connectingNode.position.x + 37, y: connectingNode.position.y + 37 }); return { x: point.x - bounds.left, y: point.y - bounds.top } })() : null
  useEffect(() => { const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { exitTransitionFocus(); setRegexPopoverOpen(false); setDialog(null) } }; window.addEventListener('keydown', onEscape); return () => window.removeEventListener('keydown', onEscape) }, [exitTransitionFocus])
  const onKeyDown = useCallback((event: React.KeyboardEvent) => { if (event.key === 'Escape' && connectingId) cancelConnection() }, [cancelConnection, connectingId])
  const deleteNode = useCallback((nodeId: string) => {
    cancelConnection()
    setNodes(current => current.filter(node => node.id !== nodeId))
    setEdges(current => current.filter(edge => edge.source !== nodeId && edge.target !== nodeId))
    setSelectedId(current => current === nodeId ? null : current)
  }, [setNodes, setEdges, cancelConnection])
  const onNodesDelete = useCallback((deleted: AutomataNode[]) => {
    const ids = new Set(deleted.map(node => node.id))
    setConnectingId(current => current && ids.has(current) ? null : current)
    setSelectedId(current => current && ids.has(current) ? null : current)
  }, [])
  const renameNode = useCallback((nodeId: string) => {
    const node = nodes.find(item => item.id === nodeId)
    if (!node) return
    setDialog({
      kind: 'prompt', title: 'Rename state', initialValue: node.data.label, confirmLabel: 'Rename',
      onConfirm: label => setNodes(current => current.map(item => item.id === nodeId ? { ...item, data: { ...item.data, label } } : item)),
    })
  }, [nodes, setNodes])
  const toggleStartAccepting = useCallback(() => {
    if (!selectedId) return
    setNodes(current => current.map(node => {
      if (node.id !== selectedId || node.data.kind !== 'start') return node
      return { ...node, data: { ...node.data, accepting: !node.data.accepting } }
    }))
  }, [selectedId, setNodes])
  const selectedStart = nodes.find(node => node.id === selectedId && node.data.kind === 'start')
  const completeSink = useCallback(() => {
    const completed = graphToFlow(completeWithSink(graphFromEditor(nodes, edges, symbols)))
    setNodes(completed.nodes)
    setEdges(completed.edges)
    setReshapeTick(tick => tick + 1)
  }, [nodes, edges, symbols, setNodes, setEdges])
  const convert = useCallback(() => {
    cancelConnection()
    const current = graphFromEditor(nodes, edges, symbols)
    if (mode === 'nfa') {
      const result = nfaToDfa(current)
      if (!result.ok) { setConvertError(result.message); return }
      onConvert('dfa', result.graph, { testString }, `Converted from ${tabTitle}`)
      return
    }
    onConvert('nfa', copyAsNfa(current), { categories, nextIndices: [...nextIndices.current], testString }, `Converted from ${tabTitle}`)
  }, [cancelConnection, nodes, edges, symbols, mode, testString, categories, tabTitle, onConvert])

  const minimize = useCallback(() => {
    const result = minimizeDfa(graphFromEditor(nodes, edges, symbols))
    if (!result.ok) { setConvertError(result.message); return }
    const flow = graphToFlow(result.graph)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setReshapeTick(tick => tick + 1)
  }, [nodes, edges, symbols, setNodes, setEdges])

  const [regexPopoverOpen, setRegexPopoverOpen] = useState(false)
  const [regexInput, setRegexInput] = useState('')
  const [regexError, setRegexError] = useState('')
  const generateFromRegex = useCallback((event: React.FormEvent) => {
    event.preventDefault()
    const result = regexToNfa(regexInput)
    if (!result.ok) { setRegexError(result.message); return }
    setRegexError('')
    const flow = graphToFlow(result.graph)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setSymbols(result.graph.symbols)
    setRegexPopoverOpen(false)
  }, [regexInput, setNodes, setEdges])

  const downloadFile = (filename: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }
  const exportJson = useCallback(() => downloadFile(`automata-lab-${mode}.json`, savedJson, 'application/json'), [savedJson, mode])
  const exportSvg = useCallback(() => downloadFile(`automata-lab-${mode}.svg`, graphToSvg(graph), 'image/svg+xml'), [graph, mode])
  const [importError, setImportError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const importJson = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const saved = readSavedEditor(String(reader.result), mode)
        const flow = savedToFlow(saved)
        setNodes(flow.nodes)
        setEdges(flow.edges)
        setCategories(saved.categories)
        nextIndices.current = new Map(saved.nextIndices)
        setSymbols(saved.symbols)
        setTestString(saved.testString)
        setImportError('')
      } catch {
        setImportError(`That file is not a valid saved ${mode.toUpperCase()} graph.`)
      }
    }
    reader.readAsText(file)
  }, [mode, setNodes, setEdges])

  // Undo/redo snapshots the graph shape (not the test string), debounced so a drag commits once.
  const graphJson = useMemo(() => JSON.stringify({
    nodes: savedEditor.nodes, edges: savedEditor.edges, categories: savedEditor.categories,
    nextIndices: savedEditor.nextIndices, symbols: savedEditor.symbols,
  }), [savedEditor])
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] })
  const previousGraphJsonRef = useRef(graphJson)
  const isRestoringRef = useRef(false)
  const wasStorageReadyRef = useRef(false)
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 })
  useEffect(() => {
    if (storageReady && !wasStorageReadyRef.current) {
      wasStorageReadyRef.current = true
      previousGraphJsonRef.current = graphJson
      return
    }
    if (!storageReady) return
    if (isRestoringRef.current) { isRestoringRef.current = false; previousGraphJsonRef.current = graphJson; return }
    const timer = setTimeout(() => {
      if (graphJson === previousGraphJsonRef.current) return
      const history = historyRef.current
      history.undo.push(previousGraphJsonRef.current)
      if (history.undo.length > 50) history.undo.shift()
      history.redo = []
      previousGraphJsonRef.current = graphJson
      setHistoryCounts({ undo: history.undo.length, redo: 0 })
    }, 400)
    return () => clearTimeout(timer)
  }, [graphJson, storageReady])
  const applySnapshot = useCallback((snapshot: { nodes: SavedEditor['nodes']; edges: SavedEditor['edges']; categories: SavedEditor['categories']; nextIndices: SavedEditor['nextIndices']; symbols: string[] }) => {
    isRestoringRef.current = true
    const flow = savedToFlow({ version: 2, mode, testString, ...snapshot })
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setCategories(snapshot.categories)
    nextIndices.current = new Map(snapshot.nextIndices)
    setSymbols(snapshot.symbols)
  }, [mode, testString, setNodes, setEdges])
  const undo = useCallback(() => {
    const history = historyRef.current
    if (!history.undo.length) return
    const previous = history.undo.pop()!
    history.redo.push(previousGraphJsonRef.current)
    previousGraphJsonRef.current = previous
    applySnapshot(JSON.parse(previous))
    setHistoryCounts({ undo: history.undo.length, redo: history.redo.length })
  }, [applySnapshot])
  const redo = useCallback(() => {
    const history = historyRef.current
    if (!history.redo.length) return
    const next = history.redo.pop()!
    history.undo.push(previousGraphJsonRef.current)
    previousGraphJsonRef.current = next
    applySnapshot(JSON.parse(next))
    setHistoryCounts({ undo: history.undo.length, redo: history.redo.length })
  }, [applySnapshot])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      event.preventDefault()
      if (event.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // A "standard" DFA: one start state, no ε/branching, and a transition for every (state, symbol).
  const isStandardDfa = useMemo(() => nodeCounts.start === 1 && isDfaShaped(graph) && missing.length === 0, [nodeCounts, graph, missing])
  // Fingerprint of just the automaton's behavior — states, their kind/label/accepting, and
  // transitions — used to remember that Run already passed on *this* graph, so the same "Valid
  // DFA" dialog doesn't repeat until something that actually changes behavior does. Position and
  // color are left out on purpose: dragging a state around the canvas shouldn't undo a pass.
  const graphSignature = useMemo(() => JSON.stringify({
    states: graph.states.map(state => ({ id: state.id, label: state.label, kind: state.kind, accepting: state.accepting })),
    transitions: graph.transitions.map(transition => ({ source: transition.source, target: transition.target, symbols: [...transition.symbols].sort() })),
    symbols: graph.symbols,
  }), [graph])
  const [validatedSignature, setValidatedSignature] = useState<string | null>(null)
  const testPassed = isDfa && validatedSignature === graphSignature
  // No popup either way — the Deterministic / Missing / Conflicts / Test stats above the canvas
  // already say whether this passes, so Run / Run test just reads them instead of announcing it.
  const confirmDfaReady = useCallback(() => {
    if (!isStandardDfa) return false
    if (validatedSignature !== graphSignature) setValidatedSignature(graphSignature)
    return true
  }, [isStandardDfa, validatedSignature, graphSignature])
  const onRunClick = useCallback(() => {
    cancelConnection()
    if (isDfa && !confirmDfaReady()) return
    setTestPanelOpen(true)
    testInputRef.current?.focus()
  }, [cancelConnection, isDfa, confirmDfaReady])
  const onRunTestClick = useCallback(() => {
    if (!isDfa) { runAnimatedTest(); return }
    if (!confirmDfaReady()) return
    setTestPanelOpen(true)
    testInputRef.current?.focus()
    if (testString) runAnimatedTest()
  }, [isDfa, confirmDfaReady, testString, runAnimatedTest])
  // Same gate as Run test, but skips the walk straight to the result — an NFA with a lot of
  // branching can take a while to animate through every attempt, so this is the escape hatch.
  const onRunTestInstantClick = useCallback(() => {
    setAnimation(null)
    if (!isDfa) { runTest(); return }
    if (!confirmDfaReady()) return
    setTestPanelOpen(true)
    testInputRef.current?.focus()
    if (testString) runTest()
  }, [isDfa, confirmDfaReady, testString])

  // Declared symbols can outnumber the ones actually placed on a transition; this is the subset a
  // random string or an accepted example should draw from.
  const activeAlphabet = useMemo(() => {
    const used = new Set(graph.transitions.flatMap(transition => transition.symbols).filter(symbol => symbol !== 'ε'))
    return symbols.filter(symbol => used.has(symbol))
  }, [graph, symbols])
  const onRandomString = useCallback(() => {
    cancelConnection()
    setTestString(randomTestString(activeAlphabet))
    setTestPanelOpen(true)
  }, [cancelConnection, activeAlphabet])
  const [examples, setExamples] = useState<string[] | null>(null)
  useEffect(() => { setExamples(null) }, [savedJson])
  const generateExamples = useCallback(() => {
    cancelConnection()
    if (isDfa) {
      if (!isStandardDfa) { setDialog({ kind: 'alert', tone: 'error', title: 'Not a standard DFA yet', message: 'Finish the design (one start state, no conflicts, no missing transitions) before generating examples.' }); return }
      setExamples(findAcceptedStrings(completeWithSink(graph), 5))
      return
    }
    const result = nfaToDfa(graph)
    if (!result.ok) { setDialog({ kind: 'alert', tone: 'error', title: 'Cannot generate examples', message: result.message }); return }
    setExamples(findAcceptedStrings(result.graph, 5))
  }, [cancelConnection, isDfa, isStandardDfa, graph])

  // Presentation-only derivations for the status strip and its diagnostics panel.
  const branching = conflicts.filter(item => item.symbol !== 'ε')
  const missingByState = new Map<string, { label: string; symbols: string[] }>()
  for (const item of missing) {
    const group = missingByState.get(item.source) ?? { label: item.sourceLabel, symbols: [] }
    group.symbols.push(item.symbol)
    missingByState.set(item.source, group)
  }
  const diagnosticIssues = [
    missing.length ? `${missing.length} missing` : '',
    conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}` : '',
    nodeCounts.start !== 1 ? (nodeCounts.start === 0 ? 'no start' : `${nodeCounts.start} starts`) : '',
  ].filter(Boolean)
  const diagnosticSummary = isDfa
    ? (isStandardDfa ? 'Complete DFA' : diagnosticIssues.join(' · ') || 'Not deterministic')
    : `${epsilonCount} ε · ${branching.length ? `${branching.length} branching` : 'No branching'}`
  const diagnosticTone = isDfa ? (isStandardDfa ? 'is-good' : 'is-bad') : ''
  const saveFailed = storageBlocked || saveStatus.startsWith('Could not')
  const testHint = isDfa
    ? (isStandardDfa ? 'Type a string, then press Enter or Run animated.' : 'Tests run once this is a complete DFA — open the diagnostics above to see what is missing.')
    : 'Press Enter or Run animated. Leave blank to test ε.'

  if (!storageReady) return <main className="app-shell"><p role="status">Loading local graph…</p></main>
  return <TransitionContext.Provider value={transitionActions}><main className={`app-shell is-${mode}`} onKeyDown={onKeyDown} tabIndex={-1}>
    <header className="topbar">
      <div className="brand">
        <Link className="brand-home" href="/" title="Automata Lab home"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span><span className="brand-name">Automata Lab</span></Link>
        <span className={`mode-badge is-${mode}`} title={isDfa ? 'Deterministic finite automaton' : 'Nondeterministic finite automaton'}>{mode.toUpperCase()}</span>
        <h1 className="sr-only">{isDfa ? 'Deterministic' : 'Nondeterministic'} finite automaton editor: {tabTitle}</h1>
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group" role="group" aria-label="History">
        <button className="icon-button" type="button" onClick={undo} disabled={!historyCounts.undo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
        <button className="icon-button" type="button" onClick={redo} disabled={!historyCounts.redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} /></button>
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group">
        <Dropdown label="File" title="Import or export this graph" trigger={<><FolderOpen size={15} aria-hidden="true" /> File <ChevronDown size={13} className="caret" aria-hidden="true" /></>}>
          {close => <>
            <MenuItem icon={FileUp} label="Import JSON…" hint={`Replaces this tab with a saved ${mode.toUpperCase()} file`} onSelect={() => importInputRef.current?.click()} close={close} />
            <div className="menu-separator" role="separator" />
            <MenuItem icon={FileDown} label="Export JSON" hint="Re-importable save of this graph" onSelect={exportJson} close={close} />
            <MenuItem icon={ImageDown} label="Export SVG" hint="Static picture of the canvas" onSelect={exportSvg} close={close} />
          </>}
        </Dropdown>
        <input ref={importInputRef} type="file" accept="application/json" className="file-input-hidden"
          onChange={event => { const file = event.target.files?.[0]; if (file) importJson(file); event.target.value = '' }} />
        <div className="regex-popover-wrap">
          <Dropdown label={isDfa ? 'DFA tools' : 'NFA tools'} title={isDfa ? 'Complete, minimize or copy this DFA' : 'Convert this NFA or build one from a regex'}
            trigger={<><Wrench size={15} aria-hidden="true" /> {isDfa ? 'DFA tools' : 'NFA tools'} <ChevronDown size={13} className="caret" aria-hidden="true" /></>}>
            {close => isDfa ? <>
              <MenuItem icon={missing.length === 0 ? CircleCheck : CirclePlus} label={missing.length === 0 ? 'Already complete' : 'Complete with sink'}
                hint={missing.length === 0 ? 'Every state has every character' : `Routes ${missing.length} missing transition${missing.length === 1 ? '' : 's'} to a sink`}
                disabled={missing.length === 0} onSelect={completeSink} close={close} />
              <MenuItem icon={Minimize2} label="Minimize" hint={isDfaShaped(graph) ? 'Merge equivalent states, drop unreachable ones' : 'Needs a deterministic graph first'}
                disabled={!isDfaShaped(graph)} onSelect={minimize} close={close} />
              <div className="menu-separator" role="separator" />
              <MenuItem icon={Copy} label="Open as NFA" hint="Copies this DFA into a new NFA tab" onSelect={convert} close={close} />
            </> : <>
              <MenuItem icon={ArrowRightLeft} label="Convert to DFA" hint="Subset construction, opens a new DFA tab" onSelect={convert} close={close} />
              <MenuItem icon={Regex} label="Regex → NFA…" hint="Replaces this graph" onSelect={() => setRegexPopoverOpen(true)} close={close} />
            </>}
          </Dropdown>
          {!isDfa && regexPopoverOpen && <div className="regex-popover" role="dialog" aria-label="Generate an NFA from a regular expression">
            <form onSubmit={generateFromRegex}>
              <label htmlFor="regex-input">Regex pattern <span>(replaces this graph)</span></label>
              <div><input id="regex-input" value={regexInput} placeholder="e.g. a(b|c)*d" autoFocus autoComplete="off" spellCheck={false}
                aria-invalid={!!regexError} onChange={event => { setRegexInput(event.target.value); setRegexError('') }} />
              <button type="submit" className="primary-button">Generate</button></div>
              {regexError && <p role="alert">{regexError}</p>}
            </form>
            <small>Supports | * + ? ( ) and \ to escape a character. A blank spot means ε.</small>
            <button type="button" className="text-button" onClick={() => setRegexPopoverOpen(false)}>Cancel</button>
          </div>}
        </div>
      </div>
      <div className="toolbar-spacer" />
      <div className={`save-status ${saveFailed ? 'is-error' : saveStatus.startsWith('Saved') ? 'is-ok' : ''}`} role="status"
        title="Only on this browser and device. Clearing browser data removes this graph. Each tab saves separately.">
        <span className="save-dot" aria-hidden="true" /><span>{saveStatus}</span>
        {saveFailed && <button type="button" onClick={() => { setStorageBlocked(false); setSaveAttempt(current => current + 1) }}>{storageBlocked ? 'Replace local save' : 'Retry save'}</button>}
      </div>
      <button className="primary-button" type="button" aria-controls="string-test-content" aria-expanded={testPanelOpen} onClick={onRunClick}
        title={isDfa
          ? 'Checks this is a complete DFA (one start state, no conflicts, no missing transitions). If it is, marks it Validated and jumps to the test input. Does not run a string.'
          : 'Opens the test panel and focuses the input string. Does not run a string.'}>
        {isDfa ? <><ListChecks size={15} aria-hidden="true" /> Validate DFA</> : <><TextCursorInput size={15} aria-hidden="true" /> Go to test</>}
      </button>
    </header>
    {convertError && <p className="convert-error" role="alert">{convertError}</p>}
    {importError && <p className="convert-error" role="alert">{importError}</p>}
    <section className="workspace"><aside ref={sidebarRef} className={`sidebar ${sidebarOpen ? '' : 'is-collapsed'} ${draggingState ? 'is-state-dragging' : ''} ${overDeleteArea ? 'is-delete-target' : ''}`}>
      <div className="sidebar-head">
        <button className="sidebar-toggle icon-button" type="button" aria-label={sidebarOpen ? 'Collapse components panel' : 'Expand components panel'} aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Collapse' : 'Expand components'} onClick={() => { cancelConnection(); setSidebarOpen(open => !open) }}>{sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
        <span className="sidebar-title">Components</span>
        <span className="count" title="States on the canvas">{nodes.length}</span>
        <Dropdown className="sidebar-help" label={`${mode.toUpperCase()} rules and editing tips`} role="dialog" triggerClassName="icon-button" title="Rules and editing tips"
          trigger={<CircleQuestionMark size={16} aria-hidden="true" />}>
          {() => <div className="help-popover">
            <h3>{isDfa ? 'Deterministic FA' : 'Nondeterministic FA'}</h3>
            <p>{isDfa ? 'One successor per (state, symbol). No ε. Missing arrows reject the input; optionally complete the graph with a sink.' : 'ε-moves and multiple successors are allowed. Convert to an equivalent DFA when you want the deterministic machine.'}</p>
            <ul>
              <li>Drag a component onto the canvas to add a state.</li>
              <li>Click a state, then a target (or the same state for a loop) to draw a transition. Click an arrow to pick its characters.</li>
              <li>Drag a state back onto this panel to delete it and its transitions.</li>
              <li>Click <b>State</b> or <b>Add category</b> to create a custom state category.</li>
              <li>Select a start state to toggle whether it also accepts.</li>
              <li>Ctrl+Z / Ctrl+Shift+Z undo and redo. Esc cancels a connection.</li>
            </ul>
          </div>}
        </Dropdown>
      </div>
      {draggingState && <div className="sidebar-delete-hint" role="status">{overDeleteArea ? 'Release to delete state and its transitions' : 'Drop a state here to delete'}</div>}
      <div className="sidebar-body"><div className="palette-list">
      {categories.map(category => <PaletteItem key={category.id} category={category}
        title={category.id === 'start' ? 'Start state' : category.id === 'accept' ? 'Accept state' : category.id === 'q' ? 'State' : category.name}
        subtitle={category.id === 'q' ? 'Drag q₀ · Click to add a category' : `${indexedLabel(category.name, 0)}, ${indexedLabel(category.name, 1)}, …`}
        onClick={category.id === 'q' ? () => { setAddingCategory(true); setCategoryError('') } : undefined}
        onDragStart={onDragStart} />)}
      {!addingCategory && <button type="button" className="add-category-button" onClick={() => { setAddingCategory(true); setCategoryError('') }}>+ Add category</button>}
      {addingCategory && <form className="category-form" onSubmit={addCategory}>
        <label htmlFor="category-name">Category name</label>
        <input id="category-name" autoFocus value={categoryName} placeholder="e.g. r"
          aria-invalid={!!categoryError} aria-describedby={categoryError ? 'category-error' : undefined}
          onChange={event => { setCategoryName(event.target.value); setCategoryError('') }}
          onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setAddingCategory(false) } }} />
        {categoryError && <p id="category-error" role="alert">{categoryError}</p>}
        <div><button type="submit" className="primary-button">Add</button><button type="button" className="secondary-button" onClick={() => { setAddingCategory(false); setCategoryName(''); setCategoryError('') }}>Cancel</button></div>
      </form>}
      </div></div></aside>
      <section className="canvas-area"><div className="canvas-toolbar">
        <div className="toolbar-stats">
          <span className="stat-pill">States <b>{nodes.length}</b></span>
          <span className={`stat-pill ${nodeCounts.start === 1 ? 'is-good' : 'is-bad'}`} title="Exactly one start state is required">Start <b>{nodeCounts.start}</b></span>
          <span className="stat-pill">Transitions <b>{edges.length}</b></span>
          <span className="stat-pill">Accepting <b>{nodeCounts.accept}</b></span>
          <Dropdown className="diagnostics" label="Diagnostics" role="dialog" triggerClassName={`stat-pill diagnostic-pill ${diagnosticTone}`}
            title="Show all diagnostics" trigger={<>{isDfa ? (isStandardDfa ? <CircleCheck size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />) : null}<span>{diagnosticSummary}</span><ChevronDown size={12} className="caret" aria-hidden="true" /></>}>
            {() => <div className="diagnostics-panel">
              <dl className="diagnostics-facts">
                {isDfa ? <>
                  <div><dt>Deterministic</dt><dd className={isStandardDfa ? 'is-good' : 'is-bad'}>{isStandardDfa ? 'Yes' : 'No'}</dd></div>
                  <div><dt>Start states</dt><dd className={nodeCounts.start === 1 ? 'is-good' : 'is-bad'}>{nodeCounts.start} <small>(exactly 1 needed)</small></dd></div>
                  <div><dt>Validated</dt><dd className={testPassed ? 'is-good' : ''}>{testPassed ? 'Yes' : 'No'} <small>Validate DFA confirms the current graph</small></dd></div>
                </> : <>
                  <div><dt>ε-transitions</dt><dd>{epsilonCount}</dd></div>
                  <div><dt>Branching</dt><dd>{branching.length ? 'Yes' : 'No'}</dd></div>
                </>}
              </dl>
              {isDfa && <section>
                <h3>Missing transitions <span className="count">{missing.length}</span></h3>
                {missing.length ? <ul className="diagnostics-list">{[...missingByState].map(([id, group]) => <li key={id}>
                  <b>{group.label}</b><span className="diagnostics-symbols">{group.symbols.map(symbol => <code key={symbol}>{symbol}</code>)}</span>
                </li>)}</ul> : <p className="diagnostics-empty">None</p>}
                {missing.length > 0 && <p className="diagnostics-tip">Missing characters reject during a test. DFA tools → Complete with sink fills them all.</p>}
              </section>}
              <section>
                <h3>{isDfa ? 'Conflicts' : 'Branching points'} <span className="count">{isDfa ? conflicts.length : branching.length}</span></h3>
                {(isDfa ? conflicts : branching).length ? <ul className="diagnostics-list">{(isDfa ? conflicts : branching).map(item => <li key={`${item.source}-${item.symbol}`}>
                  <b>{item.sourceLabel}</b> on <code>{item.symbol}</code> → {item.targets.map(target => target.label).join(', ')}
                </li>)}</ul> : <p className="diagnostics-empty">None</p>}
              </section>
            </div>}
          </Dropdown>
          {isDfa && <span className={`stat-pill ${testPassed ? 'is-good' : ''}`} title="Whether Validate DFA has confirmed this is a standard DFA since it last changed — not whether a particular test string was accepted">Validated <b>{testPassed ? 'Yes' : 'No'}</b></span>}
        </div>
        <div className="toolbar-actions">{selectedStart && <button className="tool-button" type="button" onClick={toggleStartAccepting} aria-pressed={!!selectedStart.data.accepting}>◎ <span>{selectedStart.data.accepting ? 'Start accepts' : 'Start rejects ε'}</span></button>}</div>
      </div><div className="flow-wrap" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onMouseMove={onPaneMouseMove}>{reshapeTick > 0 && <div key={reshapeTick} className="reshape-flash" aria-hidden="true" />}{connectingNode && previewSourcePoint && <ConnectionPreview sourcePoint={previewSourcePoint} pointer={pointer} color={sourceColor(connectingNode)} />}<ReactFlow nodes={nodes.map((node) => ({ ...node, data: { ...node.data, related: node.id === focusedEdge?.source || node.id === focusedEdge?.target, onRename: () => renameNode(node.id), onDelete: () => deleteNode(node.id), animating: activeFrame && node.id === activeFrame.stateId ? activeKind ?? undefined : undefined, animatingTick: animation?.tick }, selected: node.id === selectedId || node.id === connectingId, draggable: true }))} edges={routedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)} onNodeMouseLeave={() => setHoveredNodeId(null)} onEdgeClick={onEdgeClick} onEdgeMouseEnter={onEdgeMouseEnter} onEdgeMouseLeave={onEdgeMouseLeave} onNodeClick={onNodeClick} onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} autoPanOnNodeDrag={false} nodeDragThreshold={5} nodeClickDistance={5} onNodesDelete={onNodesDelete} deleteKeyCode={['Backspace', 'Delete']} onPaneClick={onPaneClick} onMove={(_, viewport) => setZoom(viewport.zoom)} zoomOnDoubleClick={false} fitView fitViewOptions={{ padding: 0.35, maxZoom: 1 }} minZoom={0.35} maxZoom={2}><Background color="#303039" gap={24} size={1} /><Controls showInteractive={false} position="bottom-right" /><MiniMap nodeColor={(node) => isAcceptingNode(node.data as AutomataNodeData) ? '#a78bfa' : node.data.kind === 'start' ? '#67e8f9' : '#71717a'} maskColor="rgba(17,17,22,.75)" position="bottom-left" /></ReactFlow>{connectingNode ? <div className="connection-hint">Click a target (or source for a loop) · Drag to move · Esc to cancel</div> : nodes.length === 0 ? <div className="canvas-empty-hint">Drag a state in from the sidebar to get started</div> : <div className="canvas-hint">Click a state to connect · Drag a state to move</div>}
      </div>
        <section className="string-test-panel" aria-label="Alphabet and string test" onKeyDown={event => event.stopPropagation()}>
          <button className="string-test-toggle" type="button" aria-expanded={testPanelOpen} aria-controls="string-test-content"
            onClick={() => { cancelConnection(); setTestPanelOpen(open => !open) }}>
            <span className="panel-bar-title">Alphabet &amp; test{testResult && <span className={`test-result-badge is-${testResult.status}`}>{testResult.status === 'accepted' ? 'Accepted' : testResult.status === 'rejected' ? 'Rejected' : 'Cannot run'}</span>}</span>
            <span className="string-test-summary">{testPanelOpen ? 'Collapse' : 'Expand'} <span aria-hidden="true">{testPanelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span></span>
          </button>
          <div id="string-test-content" className="string-test-content" hidden={!testPanelOpen}>
            <section className={`panel-region alphabet-editor ${alphabetOpen ? 'is-open' : ''}`} aria-labelledby="alphabet-heading">
              <div className="region-head">
                <h2 id="alphabet-heading">Alphabet</h2><span className="count" title="Declared characters">{symbols.length}</span>
                <button type="button" className="text-button region-toggle" aria-expanded={alphabetOpen} aria-controls="alphabet-manage"
                  onClick={() => setAlphabetOpen(open => !open)}>{alphabetOpen ? <>Done <ChevronUp size={14} aria-hidden="true" /></> : <>Manage <ChevronDown size={14} aria-hidden="true" /></>}</button>
              </div>
              <ul className="alphabet-chip-list">
                {symbols.map(symbol => <li key={symbol} className={`alphabet-chip ${isDfa ? `is-${symbolUsage.get(symbol)}` : ''}`}
                  title={isDfa ? { full: 'Used by every state', partial: 'Used by some states', unused: 'Not used by any state' }[symbolUsage.get(symbol) ?? 'unused'] : undefined}>
                  <span>{symbol}</span>
                  {alphabetOpen && <button type="button" className="alphabet-chip-remove" aria-label={`Remove character ${symbol}`} title="Remove this character" onClick={() => confirmRemoveSymbol(symbol)}><X size={10} /></button>}
                </li>)}
                {symbols.length === 0 && <li className="alphabet-chip-empty">No characters yet — draw a transition or add one</li>}
              </ul>
              {alphabetOpen && <div id="alphabet-manage" className="alphabet-manage">
                <form className="alphabet-add-form" onSubmit={event => {
                  event.preventDefault()
                  const message = addSymbol(newSymbolDraft.trim().normalize('NFC'))
                  if (message) { setDialog({ kind: 'alert', tone: 'error', title: 'Cannot add character', message }); return }
                  setNewSymbolDraft('')
                }}>
                  <label htmlFor="new-alphabet-symbol">Add a character</label>
                  <input id="new-alphabet-symbol" value={newSymbolDraft} onChange={event => setNewSymbolDraft(event.target.value)} placeholder="e.g. c" autoComplete="off" spellCheck={false} />
                  <button type="submit" className="secondary-button">Add</button>
                </form>
                {isDfa && <ul className="alphabet-legend">
                  <li><span className="legend-dot is-full" aria-hidden="true" />Every state</li>
                  <li><span className="legend-dot is-partial" aria-hidden="true" />Some states</li>
                  <li><span className="legend-dot is-unused" aria-hidden="true" />Unused</li>
                </ul>}
              </div>}
            </section>
            <section className="panel-region test-region" aria-labelledby="test-heading">
              <div className="region-head"><h2 id="test-heading">Test &amp; generate</h2></div>
              <div className="string-test-row">
                <label htmlFor="test-string">Input</label>
                <div className="test-input-wrap">
                  <input ref={testInputRef} id="test-string" value={testString} onChange={event => setTestString(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); onRunTestClick() } }} placeholder="e.g. abba" autoComplete="off" spellCheck={false} aria-describedby="string-test-help string-test-status" />
                  <span id="string-test-help" className="string-test-count">{testString.length === 0 ? 'ε' : `${Array.from(testString).length} chars`}</span>
                </div>
                <button className="icon-button is-bordered" type="button" onClick={onRandomString} disabled={!activeAlphabet.length} aria-label="Fill in a random string" title="Fill in a random string (3-10 characters) from the alphabet in use"><Dices size={16} /></button>
                <div className="run-group" role="group" aria-label="Run this string">
                  <button className="string-test-run" type="button" onClick={onRunTestClick} aria-describedby="string-test-status" title="Walks the string through the graph step by step (Enter)"><Play size={14} aria-hidden="true" /> Run animated</button>
                  <button className="string-test-instant" type="button" onClick={onRunTestInstantClick} aria-describedby="string-test-status" title="Same check, but skips the animated walk and shows the result right away — useful when an NFA has a lot of branches to try"><Zap size={14} aria-hidden="true" /> Run instantly</button>
                </div>
              </div>
              <div id="string-test-status" role="status" className={`string-test-footer ${testResult ? `test-result is-${testResult.status}` : ''}`}>{testResult ? <><strong>{testResult.status === 'accepted' ? 'Accepted' : testResult.status === 'rejected' ? 'Rejected' : 'Cannot run'}</strong> · {testResult.message}</> : testHint}</div>
              <div className="accepted-examples">
                <button className="secondary-button" type="button" onClick={generateExamples}><Sparkles size={14} aria-hidden="true" /> Generate 5 accepted strings</button>
                {examples && (examples.length
                  ? <ul className="accepted-examples-list" aria-label="Accepted strings — click one to use it">{examples.map((example, index) => <li key={index}>
                      <button type="button" title="Use as input" onClick={() => { setTestString(example); testInputRef.current?.focus() }}>{example.length ? example : 'ε'}</button>
                    </li>)}</ul>
                  : <span className="accepted-examples-empty">No accepted string found within a reasonable length.</span>)}
              </div>
            </section>
          </div>
        </section>
      </section>
    </section>
    {dialog && <Dialog state={dialog} onClose={() => setDialog(null)} />}
  </main></TransitionContext.Provider>
}

/** One-time upgrade from the older per-mode tab strip, and before that one save per mode, into a single mixed strip. */
function migrateToUnifiedIndex(bootstrapMode: AutomatonMode): TabsIndex {
  const tabs: SavedTab[] = []
  let activeId: string | null = null
  for (const tabMode of ['dfa', 'nfa'] as const) {
    try {
      const raw = localStorage.getItem(legacyModeTabsIndexKey(tabMode))
      if (raw !== null) {
        const legacy = readLegacyModeTabsIndex(raw)
        for (const tab of legacy.tabs) tabs.push({ id: tab.id, mode: tabMode, title: tab.title })
        if (tabMode === bootstrapMode) activeId = legacy.activeId
        continue
      }
    } catch { /* fall through to the even-older single-slot save below */ }
    const singleRaw = tabMode === 'nfa' ? (localStorage.getItem(storageKey('nfa')) ?? localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY)) : localStorage.getItem(storageKey('dfa'))
    if (savedEditorHasContent(singleRaw)) {
      const id = crypto.randomUUID()
      localStorage.setItem(tabStorageKey(tabMode, id), singleRaw as string)
      tabs.push({ id, mode: tabMode, title: `${tabMode.toUpperCase()} 1` })
      if (tabMode === bootstrapMode) activeId = id
    }
  }
  if (!tabs.length) {
    const id = crypto.randomUUID()
    tabs.push({ id, mode: bootstrapMode, title: `${bootstrapMode.toUpperCase()} 1` })
    activeId = id
  }
  if (!activeId || !tabs.some(tab => tab.id === activeId)) activeId = tabs[0].id
  return { activeId, tabs }
}

function loadWorkspaceIndex(bootstrapMode: AutomatonMode): TabsIndex {
  try {
    const raw = localStorage.getItem(tabsIndexKey())
    return raw !== null ? readTabsIndex(raw) : migrateToUnifiedIndex(bootstrapMode)
  } catch {
    return migrateToUnifiedIndex(bootstrapMode)
  }
}

function AutomataWorkspace({ bootstrapMode }: { bootstrapMode: AutomatonMode }) {
  const [index, setIndex] = useState<TabsIndex | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  useEffect(() => { const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDialog(null) }; window.addEventListener('keydown', onEscape); return () => window.removeEventListener('keydown', onEscape) }, [])
  useEffect(() => { setIndex(loadWorkspaceIndex(bootstrapMode)) }, [bootstrapMode])
  useEffect(() => {
    if (!index) return
    try { localStorage.setItem(tabsIndexKey(), JSON.stringify(index)) } catch { /* Per-tab graphs still save; only the tab strip itself failed to persist. */ }
  }, [index])

  const openTab: OpenTab = useCallback((tabMode, graph, extras, title) => {
    const id = crypto.randomUUID()
    if (graph) localStorage.setItem(tabStorageKey(tabMode, id), JSON.stringify(graphToSavedEditor(tabMode, graph, extras)))
    setIndex(current => {
      const tabs = current?.tabs ?? []
      const resolvedTitle = title ?? `${tabMode.toUpperCase()} ${tabs.filter(tab => tab.mode === tabMode).length + 1}`
      return { activeId: id, tabs: [...tabs, { id, mode: tabMode, title: resolvedTitle }] }
    })
  }, [])
  // State updaters must stay pure (React may invoke them more than once, e.g. under Strict Mode),
  // so side effects — localStorage, opening the rename dialog — run once here, outside setIndex.
  const closeTab = (id: string) => {
    if (!index) return
    const closing = index.tabs.find(tab => tab.id === id)
    if (closing) try { localStorage.removeItem(tabStorageKey(closing.mode, id)) } catch { /* best effort */ }
    setIndex(current => {
      if (!current) return current
      const tabs = current.tabs.filter(tab => tab.id !== id)
      if (!tabs.length) { const freshId = crypto.randomUUID(); return { activeId: freshId, tabs: [{ id: freshId, mode: bootstrapMode, title: `${bootstrapMode.toUpperCase()} 1` }] } }
      return { activeId: current.activeId === id ? tabs[tabs.length - 1].id : current.activeId, tabs }
    })
  }
  const switchTab = (id: string) => setIndex(current => current && current.activeId !== id ? { ...current, activeId: id } : current)
  const renameTab = (id: string) => {
    const tab = index?.tabs.find(item => item.id === id)
    if (!tab) return
    setDialog({
      kind: 'prompt', title: 'Rename tab', initialValue: tab.title, confirmLabel: 'Rename',
      onConfirm: title => setIndex(current => current ? { ...current, tabs: current.tabs.map(item => item.id === id ? { ...item, title } : item) } : current),
    })
  }

  if (!index) return <main className="app-shell"><p role="status">Loading local graph…</p></main>
  const activeTab = index.tabs.find(tab => tab.id === index.activeId) ?? index.tabs[0]
  return <div className="tabbed-shell">
    <div className="tab-strip" role="tablist" aria-label="Open automata">
      {index.tabs.map(tab => <div key={tab.id} className={`tab-chip is-${tab.mode} ${tab.id === index.activeId ? 'is-active' : ''}`}>
        <button role="tab" aria-selected={tab.id === index.activeId} onClick={() => switchTab(tab.id)}
          onDoubleClick={() => renameTab(tab.id)} title={`${tab.title} — double-click to rename`}>{tab.title}</button>
        {index.tabs.length > 1 && <button type="button" className="tab-close" aria-label={`Close ${tab.title}`} onClick={() => closeTab(tab.id)}><X size={12} /></button>}
      </div>)}
      <button type="button" className="tab-add is-dfa" aria-label="New DFA tab" title="New DFA tab" onClick={() => openTab('dfa')}>+ DFA</button>
      <button type="button" className="tab-add is-nfa" aria-label="New NFA tab" title="New NFA tab" onClick={() => openTab('nfa')}>+ NFA</button>
    </div>
    <ReactFlowProvider key={activeTab.id}><AutomataLab mode={activeTab.mode} saveKey={tabStorageKey(activeTab.mode, activeTab.id)} tabTitle={activeTab.title} onConvert={openTab} /></ReactFlowProvider>
    {dialog && <Dialog state={dialog} onClose={() => setDialog(null)} />}
  </div>
}

export function AutomataEditor({ mode }: { mode: AutomatonMode }) {
  return <AutomataWorkspace bootstrapMode={mode} />
}
