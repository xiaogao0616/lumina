'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

type AutomataNodeData = { label: string; kind: 'start' | 'state' | 'accept' }
type AutomataNode = Node<AutomataNodeData>

const initialNodes: AutomataNode[] = [
  { id: 'q0', type: 'state', position: { x: 290, y: 168 }, data: { label: 'q0', kind: 'state' } },
  { id: 'q1', type: 'state', position: { x: 545, y: 168 }, data: { label: 'q1', kind: 'state' } },
  { id: 'q2', type: 'accept', position: { x: 800, y: 168 }, data: { label: 'q2', kind: 'accept' } },
]

const initialEdges: Edge[] = [
  { id: 'e-q0-q1', source: 'q0', target: 'q1', label: 'a', type: 'smoothstep', style: { stroke: '#71717a', strokeWidth: 1.5 }, labelStyle: { fill: '#d4d4d8', fontSize: 13 }, labelBgStyle: { fill: '#17171c', fillOpacity: 1 }, labelBgPadding: [5, 3], labelBgBorderRadius: 4 },
  { id: 'e-q1-q2', source: 'q1', target: 'q2', label: 'b', type: 'smoothstep', style: { stroke: '#71717a', strokeWidth: 1.5 }, labelStyle: { fill: '#d4d4d8', fontSize: 13 }, labelBgStyle: { fill: '#17171c', fillOpacity: 1 }, labelBgPadding: [5, 3], labelBgBorderRadius: 4 },
]

function StateNode({ data, selected }: NodeProps<AutomataNode>) {
  return (
    <div className={`automata-node automata-node-${data.kind} ${selected ? 'is-selected' : ''}`}>
      {data.kind !== 'start' && <Handle type="target" position={Position.Left} />}
      <span>{data.label}</span>
      {data.kind !== 'accept' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

const nodeTypes = { state: StateNode, start: StateNode, accept: StateNode }

function PaletteItem({ kind, title, subtitle, onDragStart }: { kind: AutomataNodeData['kind']; title: string; subtitle: string; onDragStart: (event: React.DragEvent, kind: AutomataNodeData['kind']) => void }) {
  return (
    <button className="palette-item" draggable onDragStart={(event) => onDragStart(event, kind)} type="button">
      <span className={`palette-icon palette-icon-${kind}`}>{kind === 'start' ? '→' : kind === 'accept' ? '◎' : '○'}</span>
      <span className="palette-copy"><strong>{title}</strong><small>{subtitle}</small></span>
      <span className="drag-grip" aria-hidden="true">⋮⋮</span>
    </button>
  )
}

function AutomataLab() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AutomataNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const nodeCounts = useMemo(() => ({ start: nodes.filter((node) => node.data.kind === 'start').length, state: nodes.filter((node) => node.data.kind === 'state').length, accept: nodes.filter((node) => node.data.kind === 'accept').length }), [nodes])

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, type: 'smoothstep', style: { stroke: '#71717a', strokeWidth: 1.5 } }, current)), [setEdges])
  const onDragStart = useCallback((event: React.DragEvent, kind: AutomataNodeData['kind']) => { event.dataTransfer.setData('application/automata-node', kind); event.dataTransfer.effectAllowed = 'move' }, [])
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/automata-node') as AutomataNodeData['kind']
    if (!kind || !reactFlowWrapper.current) return
    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    const position = { x: (event.clientX - bounds.left - 36) / zoom, y: (event.clientY - bounds.top - 36) / zoom }
    const prefix = kind === 'start' ? 'start' : kind === 'accept' ? 'accept' : 'q'
    const label = kind === 'state' ? `q${nodes.filter((node) => node.data.kind === 'state').length + 3}` : prefix
    const newNode: AutomataNode = { id: `${prefix}-${Date.now()}`, type: kind, position, data: { label, kind } }
    setNodes((current) => current.concat(newNode))
  }, [nodes, setNodes, zoom])

  const onNodeClick = useCallback((_: React.MouseEvent, node: AutomataNode) => setSelectedId(node.id), [])
  const onPaneClick = useCallback(() => setSelectedId(null), [])
  const deleteSelected = useCallback(() => { if (!selectedId) return; setNodes((current) => current.filter((node) => node.id !== selectedId)); setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)); setSelectedId(null) }, [selectedId, setNodes, setEdges])
  const renameSelected = useCallback(() => { if (!selectedId) return; const node = nodes.find((item) => item.id === selectedId); if (!node) return; const label = window.prompt('Rename state', node.data.label); if (label?.trim()) setNodes((current) => current.map((item) => item.id === selectedId ? { ...item, data: { ...item.data, label: label.trim() } } : item)) }, [nodes, selectedId, setNodes])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">⌁</span><span>Automata Lab</span><span className="version-pill">v1.0</span></div>
        <div className="top-actions"><button className="icon-button" type="button" aria-label="Undo">↶</button><button className="icon-button muted" type="button" aria-label="Redo">↷</button><span className="top-divider" /><button className="text-button" type="button">Export</button><button className="run-button" type="button"><span>▶</span> Run</button><div className="avatar">JD</div></div>
      </header>
      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><div><p className="eyebrow">BUILD</p><h1>Finite Automaton</h1></div><button className="more-button" type="button" aria-label="More options">•••</button></div>
          <p className="sidebar-description">Design and test your deterministic finite automata.</p>
          <div className="sidebar-section"><div className="section-label"><span>COMPONENTS</span><span className="count">{nodes.length}</span></div><div className="palette-list"><PaletteItem kind="start" title="Start state" subtitle="Initial entry point" onDragStart={onDragStart} /><PaletteItem kind="state" title="State" subtitle="Standard state" onDragStart={onDragStart} /><PaletteItem kind="accept" title="Accept state" subtitle="Final state" onDragStart={onDragStart} /></div></div>
          <div className="sidebar-section graph-summary"><div className="section-label"><span>GRAPH SUMMARY</span></div><div className="summary-row"><span>States</span><strong>{nodeCounts.state + nodeCounts.start + nodeCounts.accept}</strong></div><div className="summary-row"><span>Transitions</span><strong>{edges.length}</strong></div><div className="summary-row"><span>Accepting</span><strong>{nodeCounts.accept}</strong></div></div>
          <div className="sidebar-footer"><span className="status-dot" />All changes saved</div>
        </aside>
        <section className="canvas-area"><div className="canvas-toolbar"><div className="toolbar-label"><span className="live-dot" />CANVAS <span className="slash">/</span> Untitled automaton</div><div className="toolbar-actions"><button className="tool-button" type="button" onClick={renameSelected}>✎ <span>Rename</span></button><button className="tool-button danger" type="button" onClick={deleteSelected}>⌫ <span>Delete</span></button></div></div><div className="flow-wrap" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}><ReactFlow nodes={nodes.map((node) => ({ ...node, selected: node.id === selectedId }))} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick} onMove={(_, viewport) => setZoom(viewport.zoom)} fitView fitViewOptions={{ padding: 0.35 }} minZoom={0.35} maxZoom={2}><Background color="#303039" gap={24} size={1} /><Controls showInteractive={false} position="bottom-right" /><MiniMap nodeColor={(node) => node.data.kind === 'accept' ? '#a78bfa' : node.data.kind === 'start' ? '#67e8f9' : '#71717a'} maskColor="rgba(17,17,22,.75)" position="bottom-left" /></ReactFlow><div className="canvas-hint">Drag components from the sidebar onto the canvas</div></div></section>
      </section>
    </main>
  )
}

export default function Page() { return <ReactFlowProvider><AutomataLab /></ReactFlowProvider> }
