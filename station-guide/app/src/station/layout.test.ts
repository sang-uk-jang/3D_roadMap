// 승강장 위 구조물(계단·에스컬레이터·엘리베이터)이 선로로 튀어나오거나 안전문 앞 통로를 막지 않는지 점검한다.
import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import type { Station } from './types'

const station = data as Station
const byId = new Map(station.nodes.map((n) => [n.id, n]))
/** 안전문 앞 최소 통로 폭(m) */
const MARGIN = 1

type Rect = { x0: number; x1: number; z0: number; z1: number }
const platforms = station.areas.filter((a) => a.kind === 'platform')
const rectOf = (poly: [number, number][]): Rect => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  z0: Math.min(...poly.map((p) => p[1])),
  z1: Math.max(...poly.map((p) => p[1])),
})

/** 계단·에스컬레이터의 평면 발자국 */
function footprint(a: [number, number], b: [number, number], width: number): Rect {
  const h = width / 2
  return a[1] === b[1]
    ? { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: a[1] - h, z1: a[1] + h }
    : { x0: a[0] - h, x1: a[0] + h, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
}
const overlaps = (p: Rect, q: Rect) => p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1

/** 승강장 긴 변(안전문 쪽)에서 안쪽으로 MARGIN 이상 떨어져 있는지 */
function clearOfEdges(r: Rect, plat: Rect) {
  const alongX = plat.x1 - plat.x0 > plat.z1 - plat.z0
  return alongX ? r.z0 >= plat.z0 + MARGIN && r.z1 <= plat.z1 - MARGIN : r.x0 >= plat.x0 + MARGIN && r.x1 <= plat.x1 - MARGIN
}

describe('platform layout', () => {
  const items: { id: string; floor: string; rect: Rect }[] = []
  for (const e of station.edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    const a = byId.get(e.from)!
    const b = byId.get(e.to)!
    const rect = footprint(a.pos, b.pos, e.width ?? 3)
    // 계단은 위층 바닥을 뚫고 아래층 바닥 위에 놓이므로 두 층 모두 차지한다
    for (const floor of new Set([a.floor, b.floor])) items.push({ id: `${e.from}->${e.to}`, floor, rect })
  }
  for (const n of station.nodes)
    if (n.type === 'elevator') items.push({ id: n.id, floor: n.floor, rect: { x0: n.pos[0] - 1.2, x1: n.pos[0] + 1.2, z0: n.pos[1] - 1.2, z1: n.pos[1] + 1.2 } })

  it('keeps stairs, escalators and elevators off the tracks and away from the screen doors', () => {
    const bad: string[] = []
    for (const it of items) {
      for (const area of platforms.filter((p) => p.floor === it.floor)) {
        const plat = rectOf(area.polygon)
        if (!overlaps(it.rect, plat)) continue
        if (!clearOfEdges(it.rect, plat)) bad.push(`${it.id} on ${area.id}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('does not stack two structures on the same platform floor', () => {
    const bad: string[] = []
    const onPlatform = items.filter((it) => platforms.some((p) => p.floor === it.floor && overlaps(it.rect, rectOf(p.polygon))))
    for (let i = 0; i < onPlatform.length; i++)
      for (let j = i + 1; j < onPlatform.length; j++) {
        const [p, q] = [onPlatform[i], onPlatform[j]]
        if (p.floor === q.floor && p.id !== q.id && overlaps(p.rect, q.rect)) bad.push(`${p.id} × ${q.id}`)
      }
    expect(bad).toEqual([])
  })
})

describe('walking lines', () => {
  it('never walk across a stair or escalator opening/structure on the same floor', () => {
    const byId2 = new Map(station.nodes.map((n) => [n.id, n]))
    const fps: { floor: string; rect: Rect; ends: Set<string> }[] = []
    for (const e of station.edges) {
      if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
      const a = byId2.get(e.from)!
      const b = byId2.get(e.to)!
      const rect = footprint(a.pos, b.pos, e.width ?? 3)
      for (const floor of new Set([a.floor, b.floor])) fps.push({ floor, rect, ends: new Set([a.id, b.id]) })
    }
    // 선분이 사각형 안쪽(가장자리 0.2m 안)을 지나가는지 표본점으로 확인
    const crosses = (p: [number, number], q: [number, number], r: Rect) => {
      for (let t = 0.02; t < 1; t += 0.02) {
        const x = p[0] + (q[0] - p[0]) * t
        const z = p[1] + (q[1] - p[1]) * t
        if (x > r.x0 + 0.2 && x < r.x1 - 0.2 && z > r.z0 + 0.2 && z < r.z1 - 0.2) return true
      }
      return false
    }
    const bad: string[] = []
    for (const e of station.edges) {
      if (e.kind !== 'walk') continue
      const a = byId2.get(e.from)!
      const b = byId2.get(e.to)!
      for (const f of fps) if (f.floor === a.floor && crosses(a.pos, b.pos, f.rect)) bad.push(`${e.from}→${e.to}`)
    }
    expect(bad).toEqual([])
  })
})
