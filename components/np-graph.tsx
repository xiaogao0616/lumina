'use client'

import type { NpGraph } from '../lib/np'
import './np.css'

export type EdgeLook = 'plain' | 'on' | 'bad' | 'faded'

/**
 * Draws a graph from the 3SAT reductions. Selected nodes are filled; `edgeLook` styles each edge
 * (for a clique, the edges among the chosen nodes; for a cover, the edges still uncovered).
 * With `onToggle`, nodes are buttons the learner can click.
 */
export function NpGraphView({ graph, selected, edgeLook, onToggle, label, groupOf }: {
  graph: NpGraph
  selected: Set<string>
  edgeLook: (a: string, b: string) => EdgeLook
  onToggle?: (id: string) => void
  label: string
  /** Optional caption per group, drawn near the group (like "C1"). */
  groupOf?: (group: string) => string | null
}) {
  const R = 19
  const xs = graph.nodes.map(node => node.x), ys = graph.nodes.map(node => node.y)
  const pad = groupOf ? 62 : 34
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const at = new Map(graph.nodes.map(node => [node.id, node]))
  const groups = [...new Set(graph.nodes.map(node => node.group))]
  return <svg className="np-graph" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="group" aria-label={label}>
    {graph.edges.map(([a, b]) => {
      const from = at.get(a)!, to = at.get(b)!
      return <line key={`${a}|${b}`} className={`np-edge is-${edgeLook(a, b)}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
    })}
    {groupOf && groups.map(group => {
      const caption = groupOf(group)
      if (!caption) return null
      const members = graph.nodes.filter(node => node.group === group)
      const cx = members.reduce((sum, node) => sum + node.x, 0) / members.length
      const cy = members.reduce((sum, node) => sum + node.y, 0) / members.length
      // Push the caption away from the middle of the drawing (the origin), out past the nodes.
      const length = Math.hypot(cx, cy) || 1
      return <text key={group} className="np-group" x={cx + cx / length * 40} y={cy + cy / length * 40} textAnchor="middle" dominantBaseline="middle">{caption}</text>
    })}
    {graph.nodes.map(node => {
      const on = selected.has(node.id)
      const body = <>
        <circle r={R} className={`np-node ${on ? 'is-on' : ''}`} />
        <text textAnchor="middle" dominantBaseline="central" className="np-label">{node.label}</text>
      </>
      return onToggle
        ? <g key={node.id} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-pressed={on} className="np-pick"
          aria-label={`${node.label}${node.group.startsWith('c') ? ` in clause ${Number(node.group.slice(1)) + 1}` : ''}`}
          onClick={() => onToggle(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(node.id) } }}>{body}</g>
        : <g key={node.id} transform={`translate(${node.x} ${node.y})`}>{body}</g>
    })}
  </svg>
}
