import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { buildSteps } from '../guide/steps'
import { doorsOf, nearestDoor, PLATFORM_SIDES } from './doors'
import { findRoute } from './route'
import type { Station } from './types'

const station = data as Station

describe('platform doors', () => {
  it('places 32 doors per side, all on the platform area', () => {
    for (const side of PLATFORM_SIDES) {
      const doors = doorsOf(side)
      expect(new Set(doors.map((d) => d.id)).size).toBe(32)
      const node = station.nodes.find((n) => n.id === side.boarding)!
      const platform = station.areas.filter((a) => a.floor === node.floor && a.kind === 'platform')
      const inside = (x: number, z: number) =>
        platform.some((a) => {
          const xs = a.polygon.map((p) => p[0])
          const zs = a.polygon.map((p) => p[1])
          return x >= Math.min(...xs) - 0.01 && x <= Math.max(...xs) + 0.01 && z >= Math.min(...zs) - 0.01 && z <= Math.max(...zs) + 0.01
        })
      for (const d of doors) expect(inside(d.pos[0], d.pos[1]), `${side.boarding} ${d.id}`).toBe(true)
    }
  })

  it('line 5 transfer doors (1-1, 8-4 from the open data) sit at the platform-end transfer stairs', () => {
    const stairs = ['tw_top', 'te_top'].map((id) => station.nodes.find((n) => n.id === id)!.pos)
    for (const b of ['board5_w', 'board5_e']) {
      const side = PLATFORM_SIDES.find((s) => s.boarding === b)!
      for (const id of side.transfer.doors) {
        const d = doorsOf(side).find((x) => x.id === id)!
        const nearest = Math.min(...stairs.map((p) => Math.abs(p[0] - d.pos[0])))
        expect(nearest, `${b} ${id}`).toBeLessThan(5)
      }
    }
  })

  it('tells where to wait at the end of a trip to a platform', () => {
    const r = findRoute(station, 'exit8', 'board5_w', {})!
    const last = buildSteps(station, r).at(-1)!
    expect(last.kind).toBe('arrive')
    expect(last.door).toBe(nearestDoor('board5_w', station.nodes.find((n) => n.id === 'board5_w')!.pos)!.id)
    expect(last.door).toMatch(/^[1-8]-[1-4]$/)
  })
})

describe('internal elevators match the facility API door positions', () => {
  // 편의시설 API(getFcElvtr) dtlPstn: 내부1 "장한평 방면5-3, 아차산 방면4-1", 내부2 "장한평 방면4-3, 아차산 방면5-1"
  const cases: [string, [string, string][]][] = [
    ['el1_B2_5', [['board5_w', '5-3'], ['board5_e', '4-1']]],
    ['el2_B2_5', [['board5_w', '4-3'], ['board5_e', '5-1']]],
  ]
  for (const [lift, refs] of cases)
    it(`${lift} stands within 8 m (along the platform) of the listed doors`, () => {
      const n = station.nodes.find((x) => x.id === lift)!
      for (const [board, door] of refs) {
        const side = PLATFORM_SIDES.find((s) => s.boarding === board)!
        const d = doorsOf(side).find((x) => x.id === door)!
        expect(Math.abs(d.pos[0] - n.pos[0]), `${lift} vs ${board} ${door}`).toBeLessThan(8)
      }
    })
})
