import { buildAdjacency, type Neighbor } from './graph'
import type { Station, StationEdge } from './types'

export type RouteOptions = {
  /** 계단·에스컬레이터 없이 엘리베이터와 평지로만 */
  stepFree?: boolean
  /** 가동 중단 등으로 쓸 수 없는 시설(facilityRef) */
  unavailableFacilities?: string[]
}

export type Route = {
  nodeIds: string[]
  /** nodeIds[i] → nodeIds[i+1] 구간의 간선 */
  edges: StationEdge[]
  /** 실제 이동 거리(m) */
  length: number
  cost: number
}

const ELEVATOR_PENALTY = 150
const GATE_PENALTY = 200

function usable(n: Neighbor, opts: RouteOptions, blocked: Set<string>): boolean {
  if (opts.stepFree && (n.edge.kind === 'stairs' || n.edge.kind === 'escalator')) return false
  const refs = n.edge.facilityRefs
  if (refs && refs.length > 0 && refs.every((r) => blocked.has(r))) return false
  return true
}

/** 출발 노드에서 목표 노드 집합 중 가장 가까운 곳까지의 최단 경로 (Dijkstra) */
export function findRouteToAny(
  station: Station,
  fromId: string,
  targetIds: string[],
  opts: RouteOptions = {},
): Route | null {
  const adj = buildAdjacency(station)
  const blocked = new Set(opts.unavailableFacilities ?? [])
  const targets = new Set(targetIds)
  const gates = new Set(station.nodes.filter((n) => n.type === 'gate').map((n) => n.id))
  const dist = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, { node: string; via: Neighbor }>()
  const done = new Set<string>()

  // 노드 수가 수백 개 수준이라 단순 선형 탐색 우선순위로 충분
  while (true) {
    let current: string | null = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d
        current = id
      }
    }
    if (current === null) return null
    if (targets.has(current)) return buildRoute(fromId, current, prev, best)
    done.add(current)
    for (const n of adj.get(current) ?? []) {
      if (!usable(n, opts, blocked)) continue
      // 계단 없는 경로를 고르지 않았으면 엘리베이터는 교통약자 우선이므로 크게 불리하게
      const nd =
        best +
        n.cost +
        (!opts.stepFree && n.edge.kind === 'elevator' ? ELEVATOR_PENALTY : 0) +
        // 개찰구는 꼭 필요할 때만 지나도록(들어갔다 다시 나오는 지름길 방지)
        (gates.has(n.to) ? GATE_PENALTY : 0)
      if (nd < (dist.get(n.to) ?? Infinity)) {
        dist.set(n.to, nd)
        prev.set(n.to, { node: current, via: n })
      }
    }
  }
}

function buildRoute(
  fromId: string,
  toId: string,
  prev: Map<string, { node: string; via: Neighbor }>,
  cost: number,
): Route {
  const nodeIds = [toId]
  const edges: StationEdge[] = []
  let length = 0
  let cur = toId
  while (cur !== fromId) {
    const p = prev.get(cur)!
    edges.unshift(p.via.edge)
    length += p.via.length
    cur = p.node
    nodeIds.unshift(cur)
  }
  return { nodeIds, edges, length, cost }
}

export function findRoute(station: Station, fromId: string, toId: string, opts: RouteOptions = {}) {
  return findRouteToAny(station, fromId, [toId], opts)
}

/** 중간에 반드시 들를 지점 후보(예: 승차권 발매기 여러 대 중 하나)를 거치는 경로 */
export function findRouteVia(
  station: Station,
  fromId: string,
  viaCandidates: string[],
  toId: string,
  opts: RouteOptions = {},
): Route | null {
  let best: Route | null = null
  for (const via of viaCandidates) {
    const a = findRoute(station, fromId, via, opts)
    const b = a && findRoute(station, via, toId, opts)
    if (!a || !b) continue
    const joined: Route = {
      nodeIds: [...a.nodeIds, ...b.nodeIds.slice(1)],
      edges: [...a.edges, ...b.edges],
      length: a.length + b.length,
      cost: a.cost + b.cost,
    }
    if (!best || joined.cost < best.cost) best = joined
  }
  return best
}
