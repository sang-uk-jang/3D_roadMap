// 두 역 여정 검사: 군자 → (7호선) → 도봉산, 도봉산 → 군자. 내린 문 앞에서 시작하는 안내와 빠른 하차 문.
import { describe, expect, it } from 'vitest'
import runtimes from '../data/runtimes.json'
import { findDestination } from '../data/lines'
import { findDestinationIn } from '../data/lines'
import { DOBONGSAN_DESTINATIONS } from '../data/lines-dobongsan'
import { buildSteps, isInsideGates } from '../guide/steps'
import { doorsOf, nearestDoor, sideOf } from '../station/doors'
import { findRoute } from '../station/route'
import { PROFILES } from '../stations/profile'
import { alightHeading, bestDoor, doorSide, etaFrom, LINKS, linkFor, onwardTargets, withDoorNode } from './journey'

const toDob = LINKS.find((l) => l.id === 'gunja-dobongsan')!
const toGunja = LINKS.find((l) => l.id === 'dobongsan-gunja')!
const gates = (st: { nodes: { id: string; type: string }[] }, ids: string[]) => ids.filter((id) => st.nodes.find((n) => n.id === id)!.type === 'gate').length
const OFF = { ko: '열차에서 내리면', en: 'Off the train' }

describe('links between stations', () => {
  it('connects Gunja Line 7 (to Jangam) with the Jangam-bound platform at Dobongsan, and back', () => {
    expect(linkFor('gunja', findDestination('도봉산'))).toBe(toDob)
    expect(linkFor('dobongsan', findDestinationIn(DOBONGSAN_DESTINATIONS, '군자'))).toBe(toGunja)
    expect(linkFor('gunja', findDestination('노원'))).toBeNull()
    expect(toDob.stops.length).toBe(15)
    expect(toDob.stops.at(-1)!.ko).toBe('도봉산')
    expect(toGunja.stops.at(-1)!.ko).toBe('군자')
  })

  it('uses the travel time measured from the timetable train numbers', () => {
    expect(toDob.minutes).toBe(runtimes.links['gunja-dobongsan'].minutes)
    expect(toDob.minutes).toBeGreaterThanOrEqual(25)
    expect(toDob.minutes).toBeLessThanOrEqual(35)
    expect(etaFrom(new Date(2026, 10, 30, 9, 0), toDob).getMinutes()).toBe(toDob.minutes)
  })

  it('both ends have the same door numbering (same 8-car train)', () => {
    expect(doorsOf(sideOf(toDob.boarding)!).map((d) => d.id)).toEqual(doorsOf(sideOf(toDob.alight)!).map((d) => d.id))
  })

  it('knows which side the doors open at the arrival platform', () => {
    // 도봉산 장암 방면 승강장(z<0)은 서쪽(-x)으로 가는 열차의 오른쪽
    expect(doorSide('board7_jangam')).toBe('right')
    expect(doorSide('board7_suraksan')).toBe('right')
  })
})

describe('starting from the door you got off at', () => {
  for (const link of [toDob, toGunja]) {
    const dest = PROFILES[link.to].station
    const targets = onwardTargets(link)
    it(`${link.id}: every door × every exit/transfer has a route with the right gates and sane steps`, () => {
      const problems: string[] = []
      for (const d of doorsOf(sideOf(link.alight)!)) {
        const at = withDoorNode(dest, link.alight, d.id)
        if (!at) {
          problems.push(`door ${d.id}: not on the platform`)
          continue
        }
        expect(isInsideGates(at.station, at.nodeId)).toBe(true)
        for (const t of targets) {
          const r = findRoute(at.station, at.nodeId, t.id, {})
          if (!r) {
            problems.push(`${d.id}->${t.id}: no route`)
            continue
          }
          const expected = t.id.startsWith('exit') ? 1 : 0
          if (gates(at.station, r.nodeIds.slice(1)) !== expected) problems.push(`${d.id}->${t.id}: gates`)
          const steps = buildSteps(at.station, r, { startHeading: alightHeading(link.alight)!, startContext: OFF })
          if (steps.length > 10) problems.push(`${d.id}->${t.id}: ${steps.length} steps`)
          for (const s of steps) if (s.distance > 150) problems.push(`${d.id}->${t.id}: ${Math.round(s.distance)}m step`)
        }
      }
      expect(problems).toEqual([])
    })
  }

  it('the door node sits on the platform, just inside the screen door', () => {
    const at = withDoorNode(PROFILES.dobongsan.station, 'board7_jangam', '4-4')!
    const n = at.station.nodes.find((x) => x.id === at.nodeId)!
    expect(n.floor).toBe('F2')
    expect(n.pos[1]).toBeCloseTo(-4.6, 1)
    expect(nearestDoor(n.id, n.pos)!.id).toBe('4-4')
    // 원래 데이터는 바꾸지 않는다
    expect(PROFILES.dobongsan.station.nodes.some((x) => x.id === at.nodeId)).toBe(false)
  })

  it('the first step says which way to turn after getting off', () => {
    const at = withDoorNode(PROFILES.dobongsan.station, 'board7_jangam', '7-4')!
    const r = findRoute(at.station, at.nodeId, 'exit2', {})!
    const first = buildSteps(at.station, r, { startHeading: alightHeading('board7_jangam')!, startContext: OFF })[0]
    expect(first.turn?.label.ko.startsWith('열차에서 내리면 ')).toBe(true)
  })
})

describe('fast-exit door', () => {
  it('picks the door with the shortest total walk (origin + destination), not just the nearest one', () => {
    const pick = bestDoor(toDob, 'exit1', 'exit2')!
    for (const d of doorsOf(sideOf(toDob.boarding)!)) {
      const a = withDoorNode(PROFILES.gunja.station, toDob.boarding, d.id)!
      const b = withDoorNode(PROFILES.dobongsan.station, toDob.alight, d.id)!
      const total = findRoute(a.station, 'exit1', a.nodeId)!.length + findRoute(b.station, b.nodeId, 'exit2')!.length
      expect(pick.total).toBeLessThanOrEqual(total + 0.5)
    }
  })

  it('for a transfer to Line 1 it lands near the official fast-transfer doors (1-1 or 8-4)', () => {
    const pick = bestDoor(toDob, 'exit1', 'board1_dobong')!
    const side = sideOf(toDob.alight)!
    const pos = (id: string) => doorsOf(side).find((d) => d.id === id)!.pos[0]
    const nearestOfficial = Math.min(...['1-1', '8-4'].map((id) => Math.abs(pos(id) - pos(pick.door))))
    expect(nearestOfficial).toBeLessThan(15)
  })

  it('respects step-free: no stairs on either leg', () => {
    for (const t of onwardTargets(toDob)) {
      const pick = bestDoor(toDob, 'exit4', t.id, { stepFree: true })
      expect(pick, t.id).not.toBeNull()
      for (const r of [pick!.leg1, pick!.leg2]) expect(r.edges.some((e) => e.kind === 'stairs' || e.kind === 'escalator')).toBe(false)
    }
  })

  it('the origin leg ends at that door and the guidance says to wait there', () => {
    const pick = bestDoor(toDob, 'exit1', 'exit2')!
    const a = withDoorNode(PROFILES.gunja.station, toDob.boarding, pick.door)!
    const last = buildSteps(a.station, pick.leg1).at(-1)!
    expect(last.kind).toBe('arrive')
    expect(last.door).toBe(pick.door)
    expect(gates(a.station, pick.leg1.nodeIds)).toBe(1)
  })
})
