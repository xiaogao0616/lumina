import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { routeEdge, routePoint } = loadTs('edge-geometry.ts')

const circle = (x, y, radius = 10) => ({ x, y, radius })

test('a clear straight shot between two far-apart circles is a plain line, trimmed to each circle', () => {
  const source = circle(0, 0), target = circle(300, 0)
  const route = routeEdge(source, target, false, false)
  assert.ok(route)
  assert.match(route.path, /^M .* L /)
  assert.equal(route.controls.length, 0)
  // Trimmed outward from the circle surfaces, not starting/ending at the centers.
  assert.ok(route.start.x > source.x)
  assert.ok(route.end.x < target.x)
  assert.equal(route.side, 1)
})

test('overlapping circles have no unambiguous connecting segment', () => {
  const route = routeEdge(circle(0, 0, 40), circle(20, 0, 40), false, false)
  assert.equal(route, null)
})

test('a self-loop always returns a cubic path with two control points', () => {
  const route = routeEdge(circle(0, 0), circle(0, 0), true, false)
  assert.ok(route)
  assert.match(route.path, /^M .* C /)
  assert.equal(route.controls.length, 2)
  assert.equal(typeof route.blocked, 'boolean')
})

test('an obstacle sitting on the straight line forces a curved detour', () => {
  const source = circle(0, 0), target = circle(300, 0)
  const obstacle = circle(150, 0, 50)
  const route = routeEdge(source, target, false, false, [obstacle])
  assert.ok(route)
  // No longer the plain straight "L" segment — it bent to try to clear the obstacle.
  assert.match(route.path, / Q /)
})

test('routePoint reproduces the endpoints at t=0 and t=1, and the midpoint for a straight line', () => {
  const route = routeEdge(circle(0, 0), circle(300, 0), false, false)
  const atStart = routePoint(route, 0), atEnd = routePoint(route, 1)
  assert.ok(Math.hypot(atStart.x - route.start.x, atStart.y - route.start.y) < 1e-6)
  assert.ok(Math.hypot(atEnd.x - route.end.x, atEnd.y - route.end.y) < 1e-6)
  const mid = routePoint(route, 0.5)
  assert.ok(Math.abs(mid.x - (route.start.x + route.end.x) / 2) < 1e-6)
})

test('a paired (two-way) edge keeps a consistent bulge even with no obstacles', () => {
  const route = routeEdge(circle(0, 0), circle(300, 0), false, true)
  assert.ok(route)
  // Paired edges always bulge (base offset > 0), so they curve even when nothing is in the way.
  assert.match(route.path, / Q /)
})
