export type Point = { x: number; y: number }
export type Circle = Point & { radius: number }
export type Route = {
  path: string
  start: Point
  end: Point
  label: Point
  controls: Point[]
  side?: number
  blocked?: boolean
}
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (p: Point, s: number): Point => ({ x: p.x * s, y: p.y * s })
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const xy = (p: Point) => `${p.x} ${p.y}`
const quadratic = (a: Point, c: Point, b: Point, t: number): Point =>
  add(add(scale(a, (1 - t) ** 2), scale(c, 2 * t * (1 - t))), scale(b, t * t))

// All coordinates are flow coordinates, never screen or handle coordinates.
function makeRoute(source: Circle, target: Circle, self: boolean, offset: number): Route | null {
  if (self) {
    const r = source.radius
    const start = add(source, { x: -(r + 9) * 0.6, y: -(r + 9) * 0.8 })
    const end = add(source, { x: (r + 10) * 0.6, y: -(r + 10) * 0.8 })
    const c1 = add(source, { x: -r * 1.8, y: -r * 3.4 })
    const c2 = add(source, { x: r * 1.8, y: -r * 3.4 })
    const mid = add(scale(add(start, end), 1 / 8), scale(add(c1, c2), 3 / 8))
    return { path: `M ${xy(start)} C ${xy(c1)} ${xy(c2)} ${xy(end)}`, start, end,
      controls: [c1, c2], label: add(mid, { x: 0, y: -12 }) }
  }
  const length = distance(source, target)
  // Overlapping circles have no unambiguous visible connecting segment.
  if (length <= source.radius + target.radius + 10) return null
  const unit = scale(sub(target, source), 1 / length)
  const normal = { x: -unit.y, y: unit.x }
  if (!offset) {
    const start = add(source, scale(unit, source.radius + 2))
    const end = add(target, scale(unit, -(target.radius + 4)))
    return { path: `M ${xy(start)} L ${xy(end)}`, start, end, controls: [],
      label: add(scale(add(start, end), 0.5), scale(normal, 12)) }
  }
  const control = add(scale(add(source, target), 0.5), scale(normal, offset))
  const point = (t: number) => quadratic(source, control, target, t)
  // Trim the original curve at each circle, rather than moving its endpoints
  // along approximate tangents (which changes both shape and arrow direction).
  let lo = 0, hi = 1
  for (let i = 0; i < 48; i++) {
    const t = (lo + hi) / 2
    if (distance(point(t), source) < source.radius + 2) lo = t
    else hi = t
  }
  const t0 = (lo + hi) / 2
  lo = 0; hi = 1
  for (let i = 0; i < 48; i++) {
    const t = (lo + hi) / 2
    if (distance(point(t), target) > target.radius + 4) lo = t
    else hi = t
  }
  const t1 = (lo + hi) / 2
  if (t1 <= t0) return null
  const start = point(t0), end = point(t1)
  const halfDerivative = add(scale(sub(control, source), 1 - t0), scale(sub(target, control), t0))
  const trimmedControl = add(start, scale(halfDerivative, t1 - t0))
  return { path: `M ${xy(start)} Q ${xy(trimmedControl)} ${xy(end)}`, start, end,
    controls: [trimmedControl], label: add(point((t0 + t1) / 2), scale(normal, Math.sign(offset) * 12)) }
}

// Evaluate the actual trimmed curve, including self-loops.
export function routePoint(route: Route, t: number): Point {
  if (!route.controls.length) return add(scale(route.start, 1-t), scale(route.end, t))
  if (route.controls.length === 1) return quadratic(route.start, route.controls[0], route.end, t)
  return add(add(scale(route.start, (1-t)**3), scale(route.controls[0], 3*t*(1-t)**2)),
    add(scale(route.controls[1], 3*t*t*(1-t)), scale(route.end, t**3)))
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const v = sub(b,a), w = sub(p,a)
  const t = Math.max(0, Math.min(1, (w.x*v.x+w.y*v.y)/(v.x*v.x+v.y*v.y || 1)))
  return distance(p, add(a, scale(v,t)))
}
// A conservative polyline check; the extra margin covers curve approximation,
// stroke width and node selection rings. No DOM or viewport coordinates used.
function obstruction(route: Route, obstacles: Circle[]) {
  const polygon = [route.start, ...route.controls, route.end]
  const bound = polygon.slice(1).reduce((sum,p,i)=>sum+distance(p,polygon[i]),0)
  const steps = Math.max(24, Math.min(1024, Math.ceil(bound/4)))
  let score = 0, previous = route.start
  for (let i=1; i<=steps; i++) {
    const next = routePoint(route, i/steps)
    for (const obstacle of obstacles) {
      const overlap = obstacle.radius + 16 - segmentDistance(obstacle,previous,next)
      if (overlap > 0) score += overlap
    }
    previous = next
  }
  return score
}

export function routeEdge(source: Circle, target: Circle, self: boolean, paired: boolean,
  obstacles: Circle[] = [], preferredSide = 1): Route | null {
  const length = distance(source,target)
  const base = paired ? Math.min(220,Math.max(44,length*length/1600)) : 0
  const initial = makeRoute(source,target,self,base)
  if (!initial) return null
  // Self-loop endpoints already sit outside the entire node decoration.
  if (self) return { ...initial, blocked: obstruction(initial,obstacles)>0 }
  if (!paired && obstruction(initial,obstacles) === 0) return { ...initial, side: preferredSide }
  // Opposite edges retain their own half-plane. A one-way edge prefers its
  // previous side while dragging, instead of flipping on each pointer move.
  const sides = paired ? [1] : [preferredSide < 0 ? -1 : 1, preferredSide < 0 ? 1 : -1]
  let best = initial, bestScore = obstruction(initial,obstacles), bestSide = sides[0]
  for (const side of sides) {
    for (let offset=Math.max(base,44); offset<=Math.max(600,base); offset+=28) {
      const candidate = makeRoute(source,target,false,offset*side)
      if (!candidate) continue
      const score = obstruction(candidate,obstacles)
      if (score === 0) return { ...candidate, side }
      if (score < bestScore) { best=candidate; bestScore=score; bestSide=side }
    }
  }
  // Dense/overlapping layouts may have no safe single-bend route. Keep the
  // transition present and expose this condition instead of claiming success.
  return { ...best, side: bestSide, blocked: true }
}
