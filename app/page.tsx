'use client'

import { createContext, useContext, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { routeEdge, type Circle } from '../lib/edge-geometry'
import { simulateAutomaton, type SimulationResult } from '../lib/automata-simulator'

type AutomataNodeData = { label: string; kind: 'start' | 'state' | 'accept'; color?: string; related?: boolean }
type AutomataNode = Node<AutomataNodeData>

function transitionSymbols(edge: Pick<Edge, 'data' | 'label'>): string[] {
  const symbols = edge.data?.symbols
  return Array.isArray(symbols) ? symbols.filter((symbol): symbol is string => typeof symbol === 'string')
    : [typeof edge.label === 'string' ? edge.label : 'ε']
}

function withTransitionSymbols(edge: Edge, symbols: string[]): Edge {
  return { ...edge, data: { ...edge.data, symbols }, label: symbols.length ? symbols.join(', ') : '∅' }
}

const sourceColors = ['#67c9ff', '#ffb86b', '#c4a0ff', '#64dcb4', '#f48fb1', '#e5d36f', '#91a8ff', '#ed9c78']
function sourceColor(node: Pick<AutomataNode, 'id' | 'data'> | undefined) {
  if (node?.data.color) return node.data.color
  let hash = 0
  for (const char of node?.id ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return sourceColors[hash % sourceColors.length]
}

const indexedLabel = (prefix: string, index: number) => prefix + String(index).replace(/[0-9]/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)])
type StateCategory = { id: string; name: string; kind: AutomataNodeData['kind'] }
const builtInCategories: StateCategory[] = [
  { id: 'start', name: 'start', kind: 'start' },
  { id: 'q', name: 'q', kind: 'state' },
  { id: 'accept', name: 'accept', kind: 'accept' },
]

const edgeStyle = { stroke: '#9292a0', strokeWidth: 1.8 }
const edgeMarker = { type: MarkerType.ArrowClosed, color: '#b5b3c2', width: 18, height: 18 }
const initialNodes: AutomataNode[] = [
  { id: 'q0', type: 'start', position: { x: 290, y: 168 }, data: { label: 'start₀', kind: 'start', color: sourceColors[0] } },
  { id: 'q1', type: 'state', position: { x: 545, y: 168 }, data: { label: 'q₀', kind: 'state', color: sourceColors[1] } },
  { id: 'q2', type: 'accept', position: { x: 800, y: 168 }, data: { label: 'accept₀', kind: 'accept', color: sourceColors[2] } },
]
const initialEdges: Edge[] = [
  { id: 'e-q0-q1', source: 'q0', target: 'q1', label: 'ε', type: 'routed', style: edgeStyle, markerEnd: edgeMarker, labelStyle: { fill: '#d4d4d8', fontSize: 13 }, labelBgStyle: { fill: '#17171c', fillOpacity: 1 }, labelBgPadding: [5, 3], labelBgBorderRadius: 4 },
  { id: 'e-q1-q2', source: 'q1', target: 'q2', label: 'ε', type: 'routed', style: edgeStyle, markerEnd: edgeMarker, labelStyle: { fill: '#d4d4d8', fontSize: 13 }, labelBgStyle: { fill: '#17171c', fillOpacity: 1 }, labelBgPadding: [5, 3], labelBgBorderRadius: 4 },
]

function StateNode({ id, data, selected }: NodeProps<AutomataNode>) {
  return <div style={{ '--state-color': sourceColor({ id, data }) } as CSSProperties} className={`automata-node automata-node-${data.kind} ${selected ? 'is-selected' : ''} ${data.related ? 'is-related' : ''}`}><Handle type="target" position={Position.Left} id="target" /><span className="initial-marker" aria-hidden="true" /><span className="source-color-dot" style={{ background: sourceColor({ id, data }) }} aria-hidden="true" /><span className="state-name" title={data.label}>{data.label}</span><Handle type="source" position={Position.Right} id="source" /></div>
}

type TransitionActions = {
  symbols: string[]
  assign: (edgeId: string, symbol: string) => void
  removeEdge: (edgeId: string) => void
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
  const choose = (symbol: string) => { actions.assign(edgeId, symbol); setError('') }
  return <section ref={editorRef} className="transition-editor nodrag nopan nowheel" aria-label="Edit transition"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation() }}>
    <header><span>{heading}</span><button type="button" className="transition-delete"
      aria-label="Delete transition" title="Delete transition" onClick={() => actions.removeEdge(edgeId)}>×</button></header>
    <div className="symbol-summary">Inputs: {value.length ? value.join(', ') : 'None'}</div>
    <div id={listId} className="symbol-dropdown">
      <div className="symbol-option"><button type="button" aria-pressed={value.includes('ε')} onClick={() => choose('ε')}>ε · Empty input</button><span title="Permanent option">Fixed</span></div>
      {actions.symbols.map(symbol => <div className="symbol-option" key={symbol}>
        <button type="button" aria-pressed={value.includes(symbol)} onClick={() => choose(symbol)}>{symbol}</button>
        <button type="button" className="symbol-remove" aria-label={`Delete symbol ${symbol} everywhere`}
          title="Remove this character from all transitions" onClick={() => actions.removeSymbol(symbol)}>×</button>
      </div>)}
      <form onSubmit={event => {
        event.preventDefault()
        const symbol = draft.trim().normalize('NFC')
        const message = actions.addSymbol(symbol)
        if (message) { setError(message); return }
        actions.assign(edgeId, symbol); setDraft(''); setError('')
      }}>
        <p className="symbol-selection-hint">Click to highlight the inputs allowed on this transition. Click again to deselect.</p>
        <label htmlFor={`${listId}-new`}>Add a character</label>
        <div><input id={`${listId}-new`} value={draft} placeholder="e.g. a"
          aria-invalid={!!error} onChange={event => { setDraft(event.target.value); setError('') }} />
        <button type="submit">Add</button></div>
        {error && <p role="alert">{error}</p>}
      </form>
      <small>Deleting a character removes it from all transitions. No highlighted inputs (∅) means this path is inactive.</small>
    </div>
  </section>
}

type RoutedEdgeData = { symbols?: string[]; editingDisabled?: boolean; obstacles?: Circle[]; curved?: boolean; color?: string; dimmed?: boolean; emphasized?: boolean; focused?: boolean }
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
  // Evaluate the rendered line / quadratic / cubic at t=0.5, without routing's label offset.
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
      style={{ ...style, stroke: color, opacity, strokeWidth: emphasized ? 3 : 1.8 }} interactionWidth={24} />
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
    <span className="drag-grip" aria-hidden="true">⋮⋮</span>
  </button>
}

function ConnectionPreview({ sourcePoint, pointer, color }: { color: string; sourcePoint: { x: number; y: number }; pointer: { x: number; y: number } }) {
  const [path] = getBezierPath({ sourceX: sourcePoint.x, sourceY: sourcePoint.y, sourcePosition: Position.Right, targetX: pointer.x, targetY: pointer.y, targetPosition: Position.Left, curvature: 0.25 })
  return <svg style={{ '--state-color': color } as CSSProperties} className="connection-preview" aria-hidden="true"><defs><marker id="preview-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill={color} /></marker></defs><path d={path} markerEnd="url(#preview-arrow)" /></svg>
}

function AutomataLab() {
  const [testPanelOpen, setTestPanelOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [testString, setTestString] = useState('')
  const testInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (testPanelOpen) testInputRef.current?.focus() }, [testPanelOpen])
  const [categories, setCategories] = useState<StateCategory[]>(builtInCategories)
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const nextIndices = useRef(new Map([['start', 1], ['q', 1], ['accept', 1]]))
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
  const [nodes, setNodes, onNodesChange] = useNodesState<AutomataNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const simulationStates = nodes.map(node => ({ id: node.id, label: node.data.label, start: node.data.kind === 'start', accepting: node.data.kind === 'accept' }))
  const simulationTransitions = edges.map(edge => ({ source: edge.source, target: edge.target, symbols: transitionSymbols(edge) }))
  // Ignore layout/selection changes, but never display a result for an outdated graph or input.
  const simulationKey = JSON.stringify([simulationStates, simulationTransitions, testString])
  const [lastTest, setLastTest] = useState<{ key: string; result: SimulationResult } | null>(null)
  useEffect(() => { setLastTest(null) }, [simulationKey])
  const testResult = lastTest?.key === simulationKey ? lastTest.result : null
  const runTest = () => setLastTest({ key: simulationKey, result: simulateAutomaton(simulationStates, simulationTransitions, testString) })
  const [symbols, setSymbols] = useState<string[]>([])
  const assignSymbol = useCallback((edgeId: string, symbol: string) => {
    setEdges(current => current.map(edge => {
      if (edge.id !== edgeId) return edge
      const selected = transitionSymbols(edge)
      return withTransitionSymbols(edge, selected.includes(symbol) ? selected.filter(item => item !== symbol) : [...selected, symbol])
    }))
  }, [setEdges])
  const removeEdge = useCallback((edgeId: string) => {
    setEdges(current => current.filter(edge => edge.id !== edgeId))
  }, [setEdges])
  const addSymbol = useCallback((symbol: string) => {
    if (Array.from(symbol).length !== 1 || !symbol.trim()) return 'Enter exactly one character.'
    if (symbol === 'ε') return 'ε is already available and cannot be changed.'
    if (symbols.includes(symbol)) return 'This character already exists.'
    setSymbols(current => current.includes(symbol) ? current : [...current, symbol])
    return null
  }, [symbols])
  const removeSymbol = useCallback((symbol: string) => {
    if (symbol === 'ε') return
    setSymbols(current => current.filter(item => item !== symbol))
    setEdges(current => current.map(edge => {
      const selected = transitionSymbols(edge)
      return selected.includes(symbol) ? withTransitionSymbols(edge, selected.filter(item => item !== symbol)) : edge
    }))
  }, [setEdges])
  const transitionActions = useMemo(() => ({ symbols, assign: assignSymbol, removeEdge, addSymbol, removeSymbol }),
    [symbols, assignSymbol, removeEdge, addSymbol, removeSymbol])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [draggingState, setDraggingState] = useState(false)
  const [overDeleteArea, setOverDeleteArea] = useState(false)
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow()
  const nodeCounts = useMemo(() => ({ start: nodes.filter((node) => node.data.kind === 'start').length, state: nodes.filter((node) => node.data.kind === 'state').length, accept: nodes.filter((node) => node.data.kind === 'accept').length }), [nodes])
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
      }), curved: reversePair, color: sourceColor(nodes.find(node => node.id === edge.source)),
        focused, emphasized, dimmed } }
  }), [edges, nodes, focusedEdge, focusedNodeId, connectingId])

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, label: 'ε', type: 'routed', style: edgeStyle, markerEnd: edgeMarker }, current)), [setEdges])
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
    const color = sourceColors.reduce((best, candidate) =>
      nodes.filter(node => sourceColor(node) === candidate).length < nodes.filter(node => sourceColor(node) === best).length ? candidate : best, sourceColors[0])
    const newNode: AutomataNode = { id: crypto.randomUUID(), type: category.kind,
      position: { x: position.x - 37, y: position.y - 37 },
      data: { label: indexedLabel(category.name, index), kind: category.kind, color } }
    setNodes(current => current.concat(newNode))
  }, [categories, nodes, screenToFlowPosition, setNodes])

  const cancelConnection = useCallback(() => setConnectingId(null), [])
  const finishConnection = useCallback((targetId: string) => {
    if (!connectingId) return
    setEdges((current) => addEdge({ id: `e-${connectingId}-${targetId}-${Date.now()}`, source: connectingId, target: targetId, label: 'ε', type: 'routed', style: edgeStyle, markerEnd: edgeMarker }, current))
    setConnectingId(null)
    setSelectedId(targetId)
  }, [connectingId, setEdges])
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
    // Decide from the release position, not the last hover or the node's bounds.
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
  useEffect(() => { const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancelConnection(); setEdges(current => current.map(edge => ({ ...edge, selected: false }))) } }; window.addEventListener('keydown', onEscape); return () => window.removeEventListener('keydown', onEscape) }, [cancelConnection, setEdges])
  const onKeyDown = useCallback((event: React.KeyboardEvent) => { if (event.key === 'Escape' && connectingId) cancelConnection() }, [cancelConnection, connectingId])
  const deleteSelected = useCallback(() => { if (!selectedId) return; cancelConnection(); setNodes((current) => current.filter((node) => node.id !== selectedId)); setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)); setSelectedId(null) }, [selectedId, setNodes, setEdges, cancelConnection])
  const onNodesDelete = useCallback((deleted: AutomataNode[]) => {
    const ids = new Set(deleted.map(node => node.id))
    setConnectingId(current => current && ids.has(current) ? null : current)
    setSelectedId(current => current && ids.has(current) ? null : current)
  }, [])
  const renameSelected = useCallback(() => { if (!selectedId) return; const node = nodes.find((item) => item.id === selectedId); if (!node) return; const label = window.prompt('Rename state', node.data.label); if (label?.trim()) setNodes((current) => current.map((item) => item.id === selectedId ? { ...item, data: { ...item.data, label: label.trim() } } : item)) }, [nodes, selectedId, setNodes])

  return <TransitionContext.Provider value={transitionActions}><main className="app-shell" onKeyDown={onKeyDown} tabIndex={-1}>
    <header className="topbar"><div className="brand"><span className="brand-mark">⌁</span><span>Automata Lab</span><span className="version-pill">v1.0</span></div><div className="top-actions"><button className="run-button" type="button" aria-controls="string-test-content" aria-expanded={testPanelOpen} onClick={() => { cancelConnection(); setTestPanelOpen(true); testInputRef.current?.focus() }}><span>▶</span> Run</button></div></header>
    <section className="workspace"><aside ref={sidebarRef} className={`sidebar ${sidebarOpen ? '' : 'is-collapsed'} ${draggingState ? 'is-state-dragging' : ''} ${overDeleteArea ? 'is-delete-target' : ''}`}>
      <button className="sidebar-toggle" type="button" aria-label={sidebarOpen ? 'Collapse components panel' : 'Expand components panel'} aria-expanded={sidebarOpen}
        onClick={() => { cancelConnection(); setSidebarOpen(open => !open) }}><span aria-hidden="true">{sidebarOpen ? '‹' : '›'}</span><span className="sidebar-toggle-label">Components</span></button>
      {draggingState && <div className="sidebar-delete-hint" role="status">{overDeleteArea ? 'Release to delete state and its transitions' : 'Drop a state here to delete'}</div>}<div className="sidebar-heading"><div><p className="eyebrow">BUILD</p><h1>Finite Automaton</h1></div></div><p className="sidebar-description">Design and test your deterministic finite automata.</p><div className="sidebar-section"><div className="section-label"><span>COMPONENTS</span><span className="count">{nodes.length}</span></div><div className="palette-list">
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
        <div><button type="submit">Add</button><button type="button" onClick={() => { setAddingCategory(false); setCategoryName(''); setCategoryError('') }}>Cancel</button></div>
      </form>}
      </div></div><div className="sidebar-section graph-summary"><div className="section-label"><span>GRAPH SUMMARY</span></div><div className="summary-row"><span>States</span><strong>{nodes.length}</strong></div><div className="summary-row"><span>Transitions</span><strong>{edges.length}</strong></div><div className="summary-row"><span>Accepting</span><strong>{nodeCounts.accept}</strong></div></div></aside>
      <section className="canvas-area"><div className="canvas-toolbar"><div className="toolbar-label"><span className="live-dot" />CANVAS <span className="slash">/</span> Untitled automaton</div><div className="toolbar-actions"><button className="tool-button" type="button" onClick={renameSelected}>✎ <span>Rename</span></button><button className="tool-button danger" type="button" onClick={deleteSelected}>⌫ <span>Delete</span></button></div></div><div className="flow-wrap" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onMouseMove={onPaneMouseMove}>{connectingNode && previewSourcePoint && <ConnectionPreview sourcePoint={previewSourcePoint} pointer={pointer} color={sourceColor(connectingNode)} />}<ReactFlow nodes={nodes.map((node) => ({ ...node, data: { ...node.data, related: node.id === focusedEdge?.source || node.id === focusedEdge?.target }, selected: node.id === selectedId || node.id === connectingId, draggable: true }))} edges={routedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)} onNodeMouseLeave={() => setHoveredNodeId(null)} onEdgeClick={onEdgeClick} onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)} onEdgeMouseLeave={() => setHoveredEdgeId(null)} onNodeClick={onNodeClick} onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} autoPanOnNodeDrag={false} nodeDragThreshold={5} nodeClickDistance={5} onNodesDelete={onNodesDelete} deleteKeyCode={['Backspace', 'Delete']} onPaneClick={onPaneClick} onMove={(_, viewport) => setZoom(viewport.zoom)} zoomOnDoubleClick={false} fitView fitViewOptions={{ padding: 0.35 }} minZoom={0.35} maxZoom={2}><Background color="#303039" gap={24} size={1} /><Controls showInteractive={false} position="bottom-right" /><MiniMap nodeColor={(node) => node.data.kind === 'accept' ? '#a78bfa' : node.data.kind === 'start' ? '#67e8f9' : '#71717a'} maskColor="rgba(17,17,22,.75)" position="bottom-left" /></ReactFlow>{connectingNode ? <div className="connection-hint">Click a target (or source for a loop) · Drag to move · Esc to cancel</div> : <div className="canvas-hint">Click a state to connect · Drag a state to move</div>}</div>
        <section className="string-test-panel" aria-label="String test" onKeyDown={event => event.stopPropagation()}>
          <button className="string-test-toggle" type="button" aria-expanded={testPanelOpen} aria-controls="string-test-content"
            onClick={() => { cancelConnection(); setTestPanelOpen(open => !open) }}>
            <span>Test string{testResult && <span className={`test-result-badge is-${testResult.status}`}>{testResult.status === 'accepted' ? 'Accepted' : testResult.status === 'rejected' ? 'Rejected' : 'Cannot run'}</span>}</span><span className="string-test-summary">{testPanelOpen ? 'Collapse' : 'Expand'} <span aria-hidden="true">{testPanelOpen ? '▾' : '▴'}</span></span>
          </button>
          <div id="string-test-content" className="string-test-content" hidden={!testPanelOpen}>
            <label htmlFor="test-string">Input string</label>
            <div className="string-test-row">
              <input ref={testInputRef} id="test-string" value={testString} onChange={event => setTestString(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); runTest() } }} placeholder="e.g. abba" autoComplete="off" spellCheck={false} aria-describedby="string-test-help string-test-status" />
              <button className="string-test-run" type="button" onClick={runTest} aria-describedby="string-test-status">Run test</button>
            </div>
            <div className="string-test-footer"><span id="string-test-help">{testString.length === 0 ? 'Empty string (ε)' : `${Array.from(testString).length} characters`}</span><span id="string-test-status" role="status" className={testResult ? `test-result is-${testResult.status}` : ''}>{testResult ? <><strong>{testResult.status === 'accepted' ? 'Accepted' : testResult.status === 'rejected' ? 'Rejected' : 'Cannot run'}</strong> · {testResult.message}</> : 'Run a test or press Enter. Leave blank to test ε.'}</span></div>
          </div>
        </section>
      </section>
    </section>
  </main></TransitionContext.Provider>
}
export default function Page() { return <ReactFlowProvider><AutomataLab /></ReactFlowProvider> }
