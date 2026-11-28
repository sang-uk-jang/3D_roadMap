// 경로가 쓸데없이 돌아가지 않는지 점검한다.
// 같은 트인 구역(대합실·통로·승강장) 안의 두 지점 사이는 거의 곧장 가야 한다(계단 구멍·구조물을 비켜 가는 정도만 허용).
// 구역이 다르면 벽·개찰구 때문에 돌아가는 게 맞으므로 비교하지 않는다.
import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { findRoute } from '../station/route'
import type { Station } from '../station/types'
import { buildSteps } from './steps'

const station = data as Station
const OPEN = new Set(['concourse', 'paid', 'passage', 'platform'])
const rectOf = (poly: [number, number][]) => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  z0: Math.min(...poly.map((p) => p[1])),
  z1: Math.max(...poly.map((p) => p[1])),
})

describe('no needless detours', () => {
  it('walks almost straight between two points of the same open area', () => {
    const bad: string[] = []
    for (const area of station.areas.filter((a) => OPEN.has(a.kind))) {
      const r = rectOf(area.polygon)
      const pts = station.nodes.filter((n) => n.floor === area.floor && n.pos[0] >= r.x0 && n.pos[0] <= r.x1 && n.pos[1] >= r.z0 && n.pos[1] <= r.z1 && n.type !== 'elevator')
      for (const a of pts)
        for (const b of pts) {
          if (a.id >= b.id) continue
          const route = findRoute(station, a.id, b.id, {})
          if (!route || route.edges.some((e) => e.kind !== 'walk')) continue
          const straight = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])
          if (route.length > straight * 1.5 + 8) bad.push(`${area.id}: ${a.id}→${b.id} ${Math.round(route.length)}m vs ${Math.round(straight)}m`)
        }
    }
    expect(bad).toEqual([])
  })

  it('goes straight from the gates to the platform stairs (no loop through the middle)', () => {
    const route = findRoute(station, 'exit8', 'board5_w', {})!
    const steps = buildSteps(station, route)
    const gate = steps.findIndex((s) => s.kind === 'gate')
    const next = steps[gate + 1]
    const a = station.nodes.find((n) => n.id === route.nodeIds[next.from])!
    const b = station.nodes.find((n) => n.id === route.nodeIds[next.to])!
    const straight = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])
    expect(next.distance).toBeLessThan(straight * 1.2 + 3)
  })
})
