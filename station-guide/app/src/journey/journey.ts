// 두 역을 잇는 여정: 출발역 안내 → 열차 안 → 내린 문 앞에서 도착역 안내.
// 열차 위치는 알 수 없어(실시간 키 없음) 사용자가 "내렸어요"를 누른다. 예상 도착 시각은 시간표 열차번호로 잰 소요 시간(runtimes.json).
import runtimes from '../data/runtimes.json'
import { DESTINATIONS, type Destination } from '../data/lines'
import { DOBONGSAN_DESTINATIONS } from '../data/lines-dobongsan'
import { doorsOf, sideOf } from '../station/doors'
import { findRoute, findRouteVia, type Route, type RouteOptions } from '../station/route'
import type { Label, Station, StationEdge, StationNode } from '../station/types'
import { PROFILES, type StationProfile } from '../stations/profile'

export type StationId = StationProfile['id']

export type Link = {
  id: string
  from: StationId
  to: StationId
  /** 출발역 타는 곳 / 도착역 내리는 곳(승강장 쪽 id) */
  boarding: string
  alight: string
  line: string
  /** 시간표 열차번호로 잰 소요 시간(분, 중앙값) */
  minutes: number
  /** 지나는 역(내릴 역 포함, 가까운 순) */
  stops: Label[]
}

const RT = runtimes.links as Record<string, { boarding: string; alight: string; minutes: number }>

/** 목적지 목록에서 board 방향으로 to 역까지의 정거장 */
function stopsTo(list: Destination[], boarding: string, toKo: string): Label[] {
  const dir = list.filter((d) => d.boarding === boarding).sort((a, b) => a.stops - b.stops)
  const end = dir.findIndex((d) => d.name.ko === toKo)
  return end < 0 ? [] : dir.slice(0, end + 1).map((d) => d.name)
}

export const LINKS: Link[] = [
  { id: 'gunja-dobongsan', from: 'gunja', to: 'dobongsan', line: '7', ...RT['gunja-dobongsan'], stops: stopsTo(DESTINATIONS, 'board7_e', '도봉산') },
  { id: 'dobongsan-gunja', from: 'dobongsan', to: 'gunja', line: '7', ...RT['dobongsan-gunja'], stops: stopsTo(DOBONGSAN_DESTINATIONS, 'board7_suraksan', '군자') },
]

/** 고른 목적지가 데이터가 있는 역이면 그 여정 */
export function linkFor(from: StationId, dest?: Destination): Link | null {
  if (!dest) return null
  return LINKS.find((l) => l.from === from && l.boarding === dest.boarding && l.stops.at(-1)?.ko === dest.name.ko) ?? null
}

/** 도착역에서 갈 수 있는 곳: 출구와 다른 노선 타는 곳 */
export function onwardTargets(link: Link): { id: string; label: Label }[] {
  const p = PROFILES[link.to]
  const exits = p.station.nodes
    .filter((n) => n.type === 'exit')
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((n) => ({ id: n.id, label: n.label }))
  const transfers = p.platformOrigins
    .filter((o) => sideOf(o.id)?.line !== link.line)
    .map((o) => ({ id: o.id, label: { ko: `${o.label.ko}으로 갈아타기`, en: `Transfer: ${o.label.en}` } }))
  return [...exits, ...transfers]
}

// ───────── 문 앞 임시 지점 ─────────
type Rect = { x0: number; x1: number; z0: number; z1: number }
const rectOf = (poly: [number, number][]): Rect => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  z0: Math.min(...poly.map((p) => p[1])),
  z1: Math.max(...poly.map((p) => p[1])),
})
const inRect = (r: Rect, [x, z]: [number, number]) => x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01

/** 선분이 사각형 안쪽을 0.2m 넘게 지나가는지(빌드 스크립트와 같은 판정) */
function crosses([ax, az]: [number, number], [bx, bz]: [number, number], r: Rect): boolean {
  const s = { x0: r.x0 + 0.05, x1: r.x1 - 0.05, z0: r.z0 + 0.05, z1: r.z1 - 0.05 }
  const dx = bx - ax
  const dz = bz - az
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [[-dx, ax - s.x0], [dx, s.x1 - ax], [-dz, az - s.z0], [dz, s.z1 - az]]) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
    }
  }
  return t1 > t0 && (t1 - t0) * Math.hypot(dx, dz) > 0.2
}

/** 같은 층의 계단·에스컬레이터 발자국과 엘리베이터 */
function obstaclesOn(station: Station, floor: string): { rect: Rect; owner: string | null }[] {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const out: { rect: Rect; owner: string | null }[] = []
  for (const e of station.edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    const a = byId.get(e.from)!
    const b = byId.get(e.to)!
    if (a.floor !== floor && b.floor !== floor) continue
    const h = (e.width ?? 3) / 2 + 0.3
    const alongX = Math.abs(b.pos[0] - a.pos[0]) >= Math.abs(b.pos[1] - a.pos[1])
    out.push({
      rect: alongX
        ? { x0: Math.min(a.pos[0], b.pos[0]), x1: Math.max(a.pos[0], b.pos[0]), z0: a.pos[1] - h, z1: a.pos[1] + h }
        : { x0: a.pos[0] - h, x1: a.pos[0] + h, z0: Math.min(a.pos[1], b.pos[1]), z1: Math.max(a.pos[1], b.pos[1]) },
      owner: null,
    })
  }
  for (const n of station.nodes)
    if (n.type === 'elevator' && n.floor === floor) out.push({ rect: { x0: n.pos[0] - 1.4, x1: n.pos[0] + 1.4, z0: n.pos[1] - 1.4, z1: n.pos[1] + 1.4 }, owner: n.id })
  return out
}

/**
 * 승강장 문(칸-문 번호) 앞에 임시 타는 곳을 넣은 역 데이터를 돌려준다.
 * 같은 승강장 안에서 구조물을 가로지르지 않는 지점들과 곧장 잇는다. 원래 데이터는 바꾸지 않는다.
 */
export function withDoorNode(station: Station, boardingId: string, doorId: string): { station: Station; nodeId: string } | null {
  const side = sideOf(boardingId)
  const board = station.nodes.find((n) => n.id === boardingId)
  const door = side && doorsOf(side).find((d) => d.id === doorId)
  if (!side || !board || !door) return null
  // 안전문에서 0.6m 승강장 안쪽
  const pos: [number, number] = [door.pos[0] - side.trackSide[0] * 0.6, door.pos[1] - side.trackSide[1] * 0.6]
  const area = station.areas.find((a) => a.floor === board.floor && a.kind === 'platform' && inRect(rectOf(a.polygon), pos))
  if (!area) return null
  const r = rectOf(area.polygon)
  const id = `${boardingId}@${doorId}`
  const node: StationNode = {
    id,
    type: 'boarding',
    floor: board.floor,
    pos,
    label: { ko: `${board.label.ko} ${doorId}번 문`, en: `${board.label.en}, door ${doorId}` },
    line: board.line,
    direction: board.direction,
  }
  const obs = obstaclesOn(station, board.floor)
  const edges: StationEdge[] = []
  for (const n of station.nodes) {
    if (n.floor !== board.floor || !inRect(r, n.pos) || n.id === id) continue
    // 빌드 스크립트와 같이 100m 넘는 곧은 연결은 만들지 않는다(긴 승강장은 가운데 확인 지점을 거치게)
    if (Math.hypot(n.pos[0] - pos[0], n.pos[1] - pos[1]) > 100) continue
    if (obs.some((o) => o.owner !== n.id && crosses(pos, n.pos, o.rect))) continue
    edges.push({ from: id, to: n.id, kind: 'walk', open: true })
  }
  if (edges.length === 0) return null
  return { station: { ...station, nodes: [...station.nodes, node], edges: [...station.edges, ...edges] }, nodeId: id }
}

/** 열차에서 내려 승강장 안쪽을 바라보는 방향 */
export function alightHeading(boardingId: string): [number, number] | null {
  const side = sideOf(boardingId)
  return side ? [-side.trackSide[0], -side.trackSide[1]] : null
}

/** 내리는 문이 진행 방향의 오른쪽인지 왼쪽인지(x = 동, z = 남 좌표계) */
export function doorSide(boardingId: string): 'left' | 'right' | null {
  const side = sideOf(boardingId)
  if (!side) return null
  const [hx, hz] = side.dir
  const [vx, vz] = [-side.trackSide[0], -side.trackSide[1]]
  return hx * vz - hz * vx > 0 ? 'right' : 'left'
}

export type DoorPick = { door: string; leg1: Route; leg2: Route; total: number }

/**
 * 빠른 하차 칸: 출발역에서 그 문까지 + 도착역에서 그 문부터 목적지까지 걷는 거리의 합이 가장 짧은 문.
 * 칸-문 번호는 열차 기준이라 두 역에서 같다.
 */
export function bestDoor(
  link: Link,
  originFrom: string,
  target: string,
  opts: RouteOptions & { ticketMachines?: string[] } = {},
): DoorPick | null {
  const origin = PROFILES[link.from].station
  const dest = PROFILES[link.to].station
  const side = sideOf(link.boarding)
  if (!side) return null
  let best: DoorPick | null = null
  for (const d of doorsOf(side)) {
    const a = withDoorNode(origin, link.boarding, d.id)
    const b = withDoorNode(dest, link.alight, d.id)
    if (!a || !b) continue
    const leg1 = opts.ticketMachines?.length
      ? findRouteVia(a.station, originFrom, opts.ticketMachines, a.nodeId, opts)
      : findRoute(a.station, originFrom, a.nodeId, opts)
    const leg2 = findRoute(b.station, b.nodeId, target, opts)
    if (!leg1 || !leg2) continue
    const total = leg1.length + leg2.length
    if (!best || total < best.total - 0.5) best = { door: d.id, leg1, leg2, total }
  }
  return best
}

/** 도착 예정 시각: 탄 시각 + 소요 시간 */
export function etaFrom(boardedAt: Date, link: Link): Date {
  return new Date(boardedAt.getTime() + link.minutes * 60_000)
}
