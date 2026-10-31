import { inkColor, isAcceptingState, type AutomatonGraph } from './automaton-graph'
import { routeEdge, type Circle } from './edge-geometry'

const RADIUS = 37
const PADDING = 60

function circleFor(state: { position: { x: number; y: number } }): Circle {
  return { x: state.position.x + RADIUS, y: state.position.y + RADIUS, radius: RADIUS }
}

function escapeXml(value: string): string {
  const table: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
  return value.replace(/[&<>"']/g, char => table[char])
}

const LINE_HEIGHT = 16

/**
 * A boxed edge caption; a caption with line breaks (one PDA rule per line) stacks its lines. On a
 * self-loop a tall caption grows upward from the loop's top so it doesn't cover the state.
 */
function labelBox(point: { x: number; y: number }, text: string, growUp: boolean) {
  const lines = text.split('\n')
  const width = Math.max(18, Math.max(...lines.map(line => Array.from(line).length)) * 8 + 10)
  const height = 4 + lines.length * LINE_HEIGHT
  const top = growUp && lines.length > 1 ? point.y + 10 - height : point.y - height / 2
  return { lines, width, height, top, left: point.x - width / 2 }
}

function svgLabel(point: { x: number; y: number }, text: string, color: string, growUp = false, fill = '#17171c'): string {
  const { lines, width, height, top } = labelBox(point, text, growUp)
  return `<g transform="translate(${point.x - width / 2} ${top})">` +
    `<rect width="${width}" height="${height}" rx="4" fill="${fill}" stroke="${color}" stroke-width="1"/>` +
    lines.map((line, index) => `<text x="${width / 2}" y="${2 + LINE_HEIGHT * (index + 0.5)}" fill="${color}" font-size="12" text-anchor="middle" dominant-baseline="central">${escapeXml(line)}</text>`).join('') +
    `</g>`
}

/**
 * How a state is drawn on a page that replays an algorithm: `current` for where a run is now,
 * `marked` for a state an algorithm has marked, `faded` for one it never reaches.
 */
export type StateHighlight = 'current' | 'marked' | 'faded'
export type SvgOptions = {
  /** Draw with the page's CSS colour tokens (so it follows the light and dark themes) instead of the fixed dark export palette. */
  themed?: boolean
  highlight?: Record<string, StateHighlight>
  activeEdges?: string[]
}

/** A static, self-contained SVG rendering of the graph. Edge routing reuses the same geometry as the on-canvas editor. */
export function graphToSvg(graph: AutomatonGraph, background = '#111116',
  caption: (symbols: string[]) => string = symbols => symbols.length ? symbols.join(', ') : '∅', options: SvgOptions = {}): string {
  const themed = !!options.themed
  const ink = (color: string) => themed ? inkColor(color) : color
  const nodeFill = (id: string) => {
    const mark = options.highlight?.[id]
    if (mark === 'current') return themed ? 'var(--accent)' : '#e5d36f'
    if (mark === 'marked') return themed ? 'var(--success-fill)' : '#2f6b4f'
    return themed ? 'var(--raised)' : '#202027'
  }
  const textFill = (id: string) => {
    const mark = options.highlight?.[id]
    if (themed && (mark === 'current' || mark === 'marked')) return '#121212'
    return themed ? 'var(--text)' : '#e4e4e7'
  }
  const active = new Set(options.activeEdges ?? [])
  const labelExtents: { x1: number; y1: number; x2: number; y2: number }[] = []
  if (graph.states.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120"><rect width="220" height="120" fill="${background}"/>` +
      `<text x="110" y="60" fill="#8a8a96" font-family="monospace" font-size="12" text-anchor="middle">Empty graph</text></svg>`
  }
  const circles = new Map(graph.states.map(state => [state.id, circleFor(state)]))
  const parts: string[] = []
  const defs: string[] = []
  const markerIds = new Map<string, string>()
  const markerFor = (color: string) => {
    const existing = markerIds.get(color)
    if (existing) return existing
    const id = `arrow-${markerIds.size}`
    markerIds.set(color, id)
    defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">` +
      `<path d="M0,0 L10,5 L0,10 Z" fill="${color}"/></marker>`)
    return id
  }

  for (const transition of graph.transitions) {
    const source = circles.get(transition.source)
    const target = circles.get(transition.target)
    if (!source || !target) continue
    const self = transition.source === transition.target
    const reversePair = graph.transitions.some(other => other.id !== transition.id && other.source === transition.target && other.target === transition.source)
    const obstacles = [...circles.entries()].filter(([id]) => id !== transition.source && id !== transition.target).map(([, circle]) => circle)
    const route = routeEdge(source, target, self, reversePair, obstacles, 1)
    if (!route) continue
    const color = ink(graph.states.find(state => state.id === transition.source)?.color ?? '#9292a0')
    const faded = options.highlight?.[transition.source] === 'faded'
    parts.push(`<g${faded ? ' opacity="0.35"' : ''}><path d="${route.path}" fill="none" stroke="${color}" stroke-width="${active.has(transition.id) ? 4 : 1.8}" marker-end="url(#${markerFor(color)})"/>`)
    parts.push(svgLabel(route.label, caption(transition.symbols), color, self, themed ? 'var(--surface)' : undefined) + '</g>')
    const box = labelBox(route.label, caption(transition.symbols), self)
    labelExtents.push({ x1: box.left, y1: box.top, x2: box.left + box.width, y2: box.top + box.height })
  }

  for (const state of graph.states) {
    const circle = circles.get(state.id)!
    const color = ink(state.color)
    const faded = options.highlight?.[state.id] === 'faded'
    if (faded) parts.push('<g opacity="0.35">')
    if (state.kind === 'start') {
      const tipX = circle.x - circle.radius - 2
      parts.push(`<line x1="${tipX - 28}" y1="${circle.y}" x2="${tipX}" y2="${circle.y}" stroke="${color}" stroke-width="1.5"/>` +
        `<path d="M ${tipX - 8} ${circle.y - 5} L ${tipX} ${circle.y} L ${tipX - 8} ${circle.y + 5} Z" fill="${color}"/>`)
    }
    const lineWidth = options.highlight?.[state.id] === 'current' ? 3 : 1.5
    parts.push(`<circle cx="${circle.x}" cy="${circle.y}" r="${circle.radius}" fill="${nodeFill(state.id)}" stroke="${color}" stroke-width="${lineWidth}"/>`)
    if (isAcceptingState(state)) parts.push(`<circle cx="${circle.x}" cy="${circle.y}" r="${circle.radius - 6.5}" fill="none" stroke="${color}" stroke-width="1.5"/>`)
    const fontSize = Array.from(state.label).length > 7 ? 10 : 13
    parts.push(`<text x="${circle.x}" y="${circle.y}" fill="${textFill(state.id)}" font-family="monospace" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(state.label)}</text>`)
    if (faded) parts.push('</g>')
  }

  // Edge captions (a self-loop's sits above its state) can stick out past the states, so they count toward the bounds too.
  const xs = [...[...circles.values()].flatMap(c => [c.x - c.radius, c.x + c.radius]), ...labelExtents.flatMap(box => [box.x1 + PADDING - 16, box.x2 - PADDING + 16])]
  const ys = [...[...circles.values()].flatMap(c => [c.y - c.radius, c.y + c.radius]), ...labelExtents.flatMap(box => [box.y1 + PADDING - 16, box.y2 - PADDING + 16])]
  const minX = Math.min(...xs) - PADDING, minY = Math.min(...ys) - PADDING
  const width = Math.max(...xs) - minX + PADDING, height = Math.max(...ys) - minY + PADDING

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" font-family="monospace">` +
    `<defs>${defs.join('')}</defs>${themed ? '' : `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}"/>`}${parts.join('')}</svg>`
}
