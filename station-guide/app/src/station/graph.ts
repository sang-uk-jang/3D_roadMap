import type { EdgeKind, Station, StationEdge, StationNode } from './types'

export type Vec3 = [number, number, number]

/** 노드의 3D 좌표 [x, y, z] */
export function nodePosition(station: Station, node: StationNode): Vec3 {
  const floor = station.floors.find((f) => f.id === node.floor)
  if (!floor) throw new Error(`Unknown floor ${node.floor} for node ${node.id}`)
  return [node.pos[0], floor.y, node.pos[1]]
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** 엘리베이터 대기 시간 등을 미터 단위로 환산한 고정 비용 */
// 엘리베이터는 대기·혼잡을 감안해 크게 잡아, 계단 없는 경로를 고르지 않은 경우엔 계단·에스컬레이터를 우선한다
const FIXED_COST: Record<EdgeKind, number> = { walk: 0, stairs: 0, escalator: 0, elevator: 60 }
/** 이동 수단별 거리 가중치 */
const WEIGHT: Record<EdgeKind, number> = { walk: 1, stairs: 1.6, escalator: 1.1, elevator: 1 }

export function edgeCost(length: number, kind: EdgeKind): number {
  return length * WEIGHT[kind] + FIXED_COST[kind]
}

export type ValidationIssue = { message: string }

/** 데이터 무결성 검사: 중복 ID, 없는 층/노드 참조, 끊긴 노드 */
export function validateStation(station: Station): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const floorIds = new Set(station.floors.map((f) => f.id))
  const nodeIds = new Set<string>()

  for (const n of station.nodes) {
    if (nodeIds.has(n.id)) issues.push({ message: `Duplicate node id: ${n.id}` })
    nodeIds.add(n.id)
    if (!floorIds.has(n.floor)) issues.push({ message: `Node ${n.id} has unknown floor ${n.floor}` })
  }
  for (const a of station.areas) {
    if (!floorIds.has(a.floor)) issues.push({ message: `Area ${a.id} has unknown floor ${a.floor}` })
  }
  for (const e of station.edges) {
    if (!nodeIds.has(e.from)) issues.push({ message: `Edge references unknown node ${e.from}` })
    if (!nodeIds.has(e.to)) issues.push({ message: `Edge references unknown node ${e.to}` })
    const a = station.nodes.find((n) => n.id === e.from)
    const b = station.nodes.find((n) => n.id === e.to)
    if (a && b && e.kind === 'elevator' && (a.pos[0] !== b.pos[0] || a.pos[1] !== b.pos[1])) {
      issues.push({ message: `Elevator edge ${e.from}->${e.to} is not vertical` })
    }
    if (a && b && e.kind !== 'walk' && a.floor === b.floor) {
      issues.push({ message: `${e.kind} edge ${e.from}->${e.to} does not change floor` })
    }
    if (a && b && e.kind === 'walk' && a.floor !== b.floor) {
      issues.push({ message: `walk edge ${e.from}->${e.to} changes floor` })
    }
    if (a && b && (e.kind === 'stairs' || e.kind === 'escalator')) {
      // 실제 경사(약 25~40°)에 맞는지: 수평거리 / 높이차
      const fy = (id: string) => station.floors.find((f) => f.id === id)?.y ?? 0
      const drop = Math.abs(fy(a.floor) - fy(b.floor))
      const run = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])
      const ratio = run / drop
      if (ratio < 1.1 || ratio > 2.2) {
        issues.push({ message: `${e.kind} edge ${e.from}->${e.to} has unrealistic slope (run/drop ${ratio.toFixed(2)})` })
      }
    }
  }

  // 방향 무시하고 모든 노드가 하나로 이어져 있는지
  if (station.nodes.length > 0 && issues.length === 0) {
    const adj = new Map<string, string[]>()
    for (const e of station.edges) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from])
    }
    const seen = new Set([station.nodes[0].id])
    const stack = [station.nodes[0].id]
    while (stack.length) {
      for (const next of adj.get(stack.pop()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    for (const n of station.nodes) {
      if (!seen.has(n.id)) issues.push({ message: `Node ${n.id} is disconnected` })
    }
  }
  return issues
}

export type Neighbor = { to: string; edge: StationEdge; cost: number; length: number }

export function buildAdjacency(station: Station): Map<string, Neighbor[]> {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const adj = new Map<string, Neighbor[]>()
  const add = (from: string, to: string, edge: StationEdge) => {
    const length = distance(nodePosition(station, byId.get(from)!), nodePosition(station, byId.get(to)!))
    const list = adj.get(from) ?? []
    list.push({ to, edge, length, cost: edgeCost(length, edge.kind) })
    adj.set(from, list)
  }
  for (const e of station.edges) {
    add(e.from, e.to, e)
    if (!e.oneway) add(e.to, e.from, e)
  }
  return adj
}
