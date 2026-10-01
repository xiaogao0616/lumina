import { isAcceptingState, type AutomatonGraph } from './automaton-graph'
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

function svgLabel(point: { x: number; y: number }, text: string, color: string): string {
  const width = Math.max(18, Array.from(text).length * 8 + 10)
  return `<g transform="translate(${point.x - width / 2} ${point.y - 10})">` +
    `<rect width="${width}" height="20" rx="4" fill="#17171c" stroke="${color}" stroke-width="1"/>` +
    `<text x="${width / 2}" y="10" fill="${color}" font-size="12" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text></g>`
}

/** A static, self-contained SVG rendering of the graph. Edge routing reuses the same geometry as the on-canvas editor. */
export function graphToSvg(graph: AutomatonGraph, background = '#111116'): string {
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
    const color = graph.states.find(state => state.id === transition.source)?.color ?? '#9292a0'
    parts.push(`<path d="${route.path}" fill="none" stroke="${color}" stroke-width="1.8" marker-end="url(#${markerFor(color)})"/>`)
    parts.push(svgLabel(route.label, transition.symbols.length ? transition.symbols.join(', ') : '∅', color))
  }

  for (const state of graph.states) {
    const circle = circles.get(state.id)!
    if (state.kind === 'start') {
      const tipX = circle.x - circle.radius - 2
      parts.push(`<line x1="${tipX - 28}" y1="${circle.y}" x2="${tipX}" y2="${circle.y}" stroke="${state.color}" stroke-width="1.5"/>` +
        `<path d="M ${tipX - 8} ${circle.y - 5} L ${tipX} ${circle.y} L ${tipX - 8} ${circle.y + 5} Z" fill="${state.color}"/>`)
    }
    parts.push(`<circle cx="${circle.x}" cy="${circle.y}" r="${circle.radius}" fill="#202027" stroke="${state.color}" stroke-width="1.5"/>`)
    if (isAcceptingState(state)) parts.push(`<circle cx="${circle.x}" cy="${circle.y}" r="${circle.radius - 6.5}" fill="none" stroke="${state.color}" stroke-width="1.5"/>`)
    parts.push(`<text x="${circle.x}" y="${circle.y}" fill="#e4e4e7" font-family="monospace" font-size="13" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(state.label)}</text>`)
  }

  const xs = [...circles.values()].flatMap(c => [c.x - c.radius, c.x + c.radius])
  const ys = [...circles.values()].flatMap(c => [c.y - c.radius, c.y + c.radius])
  const minX = Math.min(...xs) - PADDING, minY = Math.min(...ys) - PADDING
  const width = Math.max(...xs) - minX + PADDING, height = Math.max(...ys) - minY + PADDING

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" font-family="monospace">` +
    `<defs>${defs.join('')}</defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}"/>${parts.join('')}</svg>`
}
