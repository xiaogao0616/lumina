export type Point = { x: number; y: number; radius: number }

export function routeEdge(source: Point, target: Point, selfLoop: boolean, curved: boolean) {
  if (selfLoop) {
    const path = `M ${source.x} ${source.y} C ${source.x - 54} ${source.y - 66}, ${source.x + 54} ${source.y - 66}, ${target.x} ${target.y}`
    return { path, label: { x: source.x, y: source.y - 54 } }
  }
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const nx = -dy / length
  const ny = dx / length
  const curve = curved ? 62 : 0
  const controlX = (source.x + target.x) / 2 + nx * curve
  const controlY = (source.y + target.y) / 2 + ny * curve
  const startLength = Math.max(1, Math.hypot(controlX - source.x, controlY - source.y))
  const endLength = Math.max(1, Math.hypot(target.x - controlX, target.y - controlY))
  const sourceX = source.x + ((controlX - source.x) / startLength) * source.radius
  const sourceY = source.y + ((controlY - source.y) / startLength) * source.radius
  const targetX = target.x - ((target.x - controlX) / endLength) * target.radius
  const targetY = target.y - ((target.y - controlY) / endLength) * target.radius
  const path = curved
    ? `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  return { path, label: { x: curved ? controlX : (source.x + target.x) / 2, y: curved ? controlY : (source.y + target.y) / 2 - 12 } }
}
