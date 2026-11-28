// 도봉산역 데이터 자동 검사 (docs/PROMPT_new_station.md 4절). 군자역 테스트와 같은 기준을 도봉산역 데이터로 돌린다.
import { describe, expect, it } from 'vitest'
import data from '../data/dobongsan.json'
import api from '../../../data/raw/dobongsan/facilities_api.json'
import { findDestinationIn } from '../data/lines'
import { DOBONGSAN_DESTINATIONS } from '../data/lines-dobongsan'
import { buildSteps, crossesPaidArea, isInsideGates } from '../guide/steps'
import { nextDepartures, reaches } from '../guide/timetable'
import { doorsOf, nearestDoor, sideOf } from '../station/doors'
import { DOBONGSAN_SIDES } from '../station/doors-dobongsan'
import { validateStation } from '../station/graph'
import { findRoute, findRouteVia } from '../station/route'
import type { Station } from '../station/types'
import { currentProfile, PROFILES } from './profile'

const station = data as Station
const byId = new Map(station.nodes.map((n) => [n.id, n]))
const floorOf = (id: string) => byId.get(id)!.floor
const OPEN = new Set(['concourse', 'paid', 'passage', 'platform'])
type Rect = { x0: number; x1: number; z0: number; z1: number }
const rectOf = (poly: [number, number][]): Rect => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  z0: Math.min(...poly.map((p) => p[1])),
  z1: Math.max(...poly.map((p) => p[1])),
})
const overlaps = (p: Rect, q: Rect) => p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1
function footprint(a: [number, number], b: [number, number], width: number): Rect {
  const h = width / 2
  return a[1] === b[1]
    ? { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: a[1] - h, z1: a[1] + h }
    : { x0: a[0] - h, x1: a[0] + h, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
}

const exits = station.nodes.filter((n) => n.type === 'exit').map((n) => n.id)
const platforms = DOBONGSAN_SIDES.map((s) => s.boarding)
const tickets = station.nodes.filter((n) => n.type === 'ticket').map((n) => n.id)
const ELEVATOR_EXITS = new Set(PROFILES.dobongsan.elevatorExits)
// 주요 지점: 길 잃음 버튼 위치와 출구 안쪽 위치, 화장실
const located = [...PROFILES.dobongsan.manualPlaces.map((m) => m.id), ...PROFILES.dobongsan.exitSpots.map((e) => e.node), 'toilet_7e', 'toilet_7w']

describe('dobongsan: data integrity', () => {
  it('has no broken references, floor-changing walks, unrealistic slopes or loose nodes', () => {
    expect(validateStation(station)).toEqual([])
  })

  it('uses only stairs/escalator slopes between 1.1 and 2.2 and same-floor walks', () => {
    const fy = new Map(station.floors.map((f) => [f.id, f.y]))
    for (const e of station.edges) {
      const a = byId.get(e.from)!
      const b = byId.get(e.to)!
      if (e.kind === 'walk') expect(a.floor, `${e.from}->${e.to}`).toBe(b.floor)
      if (e.kind === 'stairs' || e.kind === 'escalator') {
        const ratio = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) / Math.abs(fy.get(a.floor)! - fy.get(b.floor)!)
        expect(ratio).toBeGreaterThanOrEqual(1.1)
        expect(ratio).toBeLessThanOrEqual(2.2)
      }
    }
  })

  it('facility numbers match the facility API list; no escalator that the API does not list', () => {
    const known = new Set([...api.getFcElvtr, ...api.getFcEsctr].map((x) => String(x.fcltNo)))
    const used = new Set<string>()
    for (const e of station.edges) for (const r of e.facilityRefs ?? []) used.add(r)
    for (const n of station.nodes) if (n.facilityRef) used.add(n.facilityRef)
    for (const r of used) expect(known.has(r), r).toBe(true)
    // API에 있는 엘리베이터는 모두 데이터에 있다
    for (const el of api.getFcElvtr) expect(used.has(String(el.fcltNo)), el.fcltNm).toBe(true)
    // API에 에스컬레이터가 없으므로 에스컬레이터 간선도 없다
    expect(api.getFcEsctr.length).toBe(0)
    expect(station.edges.filter((e) => e.kind === 'escalator')).toEqual([])
  })

  it('has no walking shortcut across a paid/unpaid boundary other than a gate', () => {
    // 개찰구 노드를 빼면 개찰구 밖에서 승강장에 닿을 수 없어야 한다
    for (const ex of exits) expect(isInsideGates(station, ex), ex).toBe(false)
    for (const p of platforms) expect(isInsideGates(station, p), p).toBe(true)
  })
})

describe('dobongsan: platform layout', () => {
  const plats = station.areas.filter((a) => a.kind === 'platform')
  const items: { id: string; floor: string; rect: Rect }[] = []
  for (const e of station.edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    const a = byId.get(e.from)!
    const b = byId.get(e.to)!
    for (const floor of new Set([a.floor, b.floor])) items.push({ id: `${e.from}->${e.to}`, floor, rect: footprint(a.pos, b.pos, e.width ?? 3) })
  }
  for (const n of station.nodes)
    if (n.type === 'elevator') items.push({ id: n.id, floor: n.floor, rect: { x0: n.pos[0] - 1.2, x1: n.pos[0] + 1.2, z0: n.pos[1] - 1.2, z1: n.pos[1] + 1.2 } })

  it('keeps structures at least 1 m inside the long (screen-door) edges', () => {
    const bad: string[] = []
    for (const it of items)
      for (const area of plats.filter((p) => p.floor === it.floor)) {
        const pr = rectOf(area.polygon)
        if (!overlaps(it.rect, pr)) continue
        const alongX = pr.x1 - pr.x0 > pr.z1 - pr.z0
        const ok = alongX ? it.rect.z0 >= pr.z0 + 1 && it.rect.z1 <= pr.z1 - 1 : it.rect.x0 >= pr.x0 + 1 && it.rect.x1 <= pr.x1 - 1
        if (!ok) bad.push(`${it.id} on ${area.id}`)
      }
    expect(bad).toEqual([])
  })

  it('does not stack two structures on a platform', () => {
    const on = items.filter((it) => plats.some((p) => p.floor === it.floor && overlaps(it.rect, rectOf(p.polygon))))
    const bad: string[] = []
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) if (on[i].floor === on[j].floor && on[i].id !== on[j].id && overlaps(on[i].rect, on[j].rect)) bad.push(`${on[i].id} × ${on[j].id}`)
    expect(bad).toEqual([])
  })

  it('places every door of every side on its platform', () => {
    for (const side of DOBONGSAN_SIDES) {
      const node = byId.get(side.boarding)!
      const ps = plats.filter((a) => a.floor === node.floor).map((a) => rectOf(a.polygon))
      const doors = doorsOf(side)
      expect(doors.length).toBe((side.cars ?? 8) * 4)
      for (const d of doors) expect(ps.some((r) => d.pos[0] >= r.x0 - 0.01 && d.pos[0] <= r.x1 + 0.01 && d.pos[1] >= r.z0 - 0.01 && d.pos[1] <= r.z1 + 0.01), `${side.boarding} ${d.id}`).toBe(true)
    }
  })
})

describe('dobongsan: walking lines', () => {
  it('never crosses a stair opening or an elevator on the same floor', () => {
    const obs: { floor: string; rect: Rect; owner: Set<string> }[] = []
    for (const e of station.edges) {
      if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
      const a = byId.get(e.from)!
      const b = byId.get(e.to)!
      for (const floor of new Set([a.floor, b.floor])) obs.push({ floor, rect: footprint(a.pos, b.pos, e.width ?? 3), owner: new Set([a.id, b.id]) })
    }
    for (const n of station.nodes) if (n.type === 'elevator') obs.push({ floor: n.floor, rect: { x0: n.pos[0] - 1.2, x1: n.pos[0] + 1.2, z0: n.pos[1] - 1.2, z1: n.pos[1] + 1.2 }, owner: new Set([n.id]) })
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
      const a = byId.get(e.from)!
      const b = byId.get(e.to)!
      for (const o of obs) if (o.floor === a.floor && !o.owner.has(a.id) && !o.owner.has(b.id) && crosses(a.pos, b.pos, o.rect)) bad.push(`${e.from}→${e.to}`)
    }
    expect(bad).toEqual([])
  })
})

describe('dobongsan: no needless detours', () => {
  it('walks almost straight between two points of the same open area (≤ straight × 1.5 + 8 m)', () => {
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

  it('goes straight from the gates to the next stairs/elevator (≤ straight × 1.2 + 3 m)', () => {
    const bad: string[] = []
    for (const from of exits)
      for (const to of platforms) {
        const route = findRoute(station, from, to, {})!
        const steps = buildSteps(station, route)
        const gi = steps.findIndex((s) => s.kind === 'gate')
        const next = steps[gi + 1]
        // 개찰구 다음 단계가 계단·엘리베이터 입구까지 걷는 단계일 때만(그 뒤가 층 이동)
        if (!next || next.kind === 'move' || steps[gi + 2]?.kind !== 'move') continue
        const a = byId.get(route.nodeIds[next.from])!
        const b = byId.get(route.nodeIds[next.to])!
        const straight = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])
        if (next.distance > straight * 1.2 + 3) bad.push(`${from}->${to}: ${Math.round(next.distance)}m vs ${Math.round(straight)}m`)
      }
    expect(bad).toEqual([])
  })
})

describe('dobongsan: all origin × destination combinations', () => {
  const origins = [...exits, ...platforms, ...located]
  const targets = [...platforms, ...exits]
  const cases: { from: string; to: string; stepFree: boolean }[] = []
  for (const from of origins) for (const to of targets) if (from !== to) for (const stepFree of [false, true]) cases.push({ from, to, stepFree })
  const gatesIn = (ids: string[]) => ids.filter((id) => byId.get(id)!.type === 'gate').length

  it(`finds a route for all ${cases.length} cases (every exit has an elevator)`, () => {
    expect(exits.every((e) => ELEVATOR_EXITS.has(e))).toBe(true)
    const missing = cases.filter((c) => !findRoute(station, c.from, c.to, { stepFree: c.stepFree })).map((c) => `${c.from}->${c.to}${c.stepFree ? ' (sf)' : ''}`)
    expect(missing).toEqual([])
  })

  // 1-1번 출구 앞 대합실은 다른 개찰구 밖 구역과 역 안에서 이어지지 않는다(안내도). 그 사이 경로는 개찰구를 두 번 넘으므로
  // 앱이 안내하지 않고 "역 밖 길로 가세요"를 보인다(crossesPaidArea). 이 경우만 아래 검사에서 뺀다.
  const zone11 = new Set(['exit1-1', 'x11_bot'])
  const shown = (c: { from: string; to: string; stepFree: boolean }) => !crossesPaidArea(station, findRoute(station, c.from, c.to, { stepFree: c.stepFree })!)

  it('refuses only the exit 1-1 ↔ other unpaid-area trips (they would pay twice)', () => {
    const refused = cases.filter((c) => !shown(c))
    const unexpected = refused.filter((c) => {
      const out = (id: string) => byId.get(id)!.type !== 'gate' && !isInsideGates(station, id)
      const oneSide11 = zone11.has(c.from) !== zone11.has(c.to)
      return !(oneSide11 && (out(c.from) || byId.get(c.from)!.type === 'gate') && out(c.to))
    })
    expect(unexpected.map((c) => `${c.from}->${c.to}`)).toEqual([])
    expect(refused.length).toBeGreaterThan(0)
  })

  it('passes the right number of gates (enter 1, leave 1, transfer 0)', () => {
    const wrong: string[] = []
    for (const c of cases.filter(shown)) {
      if (byId.get(c.from)!.type === 'gate') continue
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })!
      const expected = isInsideGates(station, c.from) === isInsideGates(station, c.to) ? 0 : 1
      const got = gatesIn(r.nodeIds.slice(1))
      if (got !== expected) wrong.push(`${c.from}->${c.to}${c.stepFree ? ' (sf)' : ''}: ${got}`)
    }
    expect(wrong).toEqual([])
  })

  it('makes contiguous steps: one floor each, ≤150 m walking, ≤10 steps, no stairs when step-free', () => {
    const problems: string[] = []
    for (const c of cases.filter(shown)) {
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })!
      const steps = buildSteps(station, r)
      const tag = `${c.from}->${c.to}${c.stepFree ? ' (sf)' : ''}`
      if (steps[0].from !== 0 || steps.at(-1)!.to !== r.nodeIds.length - 1) problems.push(`${tag}: does not cover route`)
      steps.forEach((s, i) => {
        if (i > 0 && s.from !== steps[i - 1].to) problems.push(`${tag}: gap at ${i}`)
        if (s.distance > 150) problems.push(`${tag}: step ${i} walks ${Math.round(s.distance)}m`)
        const ids = r.nodeIds.slice(s.from, s.to + 1)
        if (s.kind !== 'move' && new Set(ids.map(floorOf)).size > 1) problems.push(`${tag}: step ${i} spans floors`)
        if (s.kind === 'move' && s.distance >= 8) problems.push(`${tag}: step ${i} walks before changing floor`)
      })
      if (steps.length > 10) problems.push(`${tag}: ${steps.length} steps`)
      if (c.stepFree && r.edges.some((e) => e.kind === 'stairs' || e.kind === 'escalator')) problems.push(`${tag}: stairs in step-free`)
    }
    expect(problems).toEqual([])
  })

  it('visits a ticket machine before the gates on every exit → platform trip', () => {
    for (const from of exits)
      for (const to of platforms)
        for (const stepFree of [false, true]) {
          const r = findRouteVia(station, from, tickets, to, { stepFree })!
          const t = r.nodeIds.findIndex((id) => byId.get(id)!.type === 'ticket')
          const g = r.nodeIds.findIndex((id) => byId.get(id)!.type === 'gate')
          expect(t, `${from}->${to}`).toBeGreaterThan(-1)
          expect(t, `${from}->${to}`).toBeLessThan(g)
        }
  })
})

describe('dobongsan: elevator positions match the API car-door text', () => {
  // dtlPstn 원문(UTF-8로 다시 받음): 외부1 "장암 방면7-2", 외부2 "수락산 방면1-4", 내부3 "장암 방면3-4", 내부4 "수락산 방면4-2"
  const dir: Record<string, string> = { 장암: 'board7_jangam', 수락산: 'board7_suraksan' }
  const withDoor = api.getFcElvtr.filter((e) => /방면\s*\d-\d/.test(e.dtlPstn))
  it('has 4 elevators with a car-door position', () => expect(withDoor.length).toBe(4))
  for (const el of withDoor)
    it(`${el.fcltNm} (${el.dtlPstn}) is within 8 m of that door`, () => {
      const [, name, door] = /(\S+)\s*방면\s*(\d-\d)/.exec(el.dtlPstn)!
      const side = sideOf(dir[name])!
      const d = doorsOf(side).find((x) => x.id === door)!
      const lift = station.nodes.find((n) => n.facilityRef === String(el.fcltNo) && n.floor === byId.get(side.boarding)!.floor)!
      expect(Math.hypot(d.pos[0] - lift.pos[0], d.pos[1] - lift.pos[1])).toBeLessThan(8)
    })
})

describe('dobongsan: transfer doors', () => {
  // 환승정보: 도봉산 7→1 빠른 문 1-1, 8-4
  const stairTops = station.edges.filter((e) => e.kind === 'stairs' && /^st7/.test(e.from)).map((e) => byId.get(e.from)!)
  for (const b of ['board7_jangam', 'board7_suraksan'])
    it(`${b}: transfer doors 1-1 and 8-4 are within 5 m of a platform stair`, () => {
      const side = sideOf(b)!
      expect(side.transfer.doors).toEqual(['1-1', '8-4'])
      for (const id of side.transfer.doors) {
        const d = doorsOf(side).find((x) => x.id === id)!
        const near = stairTops.filter((s) => s.floor === byId.get(b)!.floor).map((s) => Math.hypot(s.pos[0] - d.pos[0], s.pos[1] - d.pos[1]))
        expect(Math.min(...near), `${b} ${id}`).toBeLessThan(5)
      }
    })

  it('transfers between Line 7 and Line 1 without passing a gate, via the platform-end stairs', () => {
    for (const [a, b] of [['board7_jangam', 'board1_dobong'], ['board7_suraksan', 'board1_mangwolsa'], ['board1_dobong', 'board7_suraksan'], ['board1_mangwolsa', 'board7_jangam']]) {
      const r = findRoute(station, a, b, {})!
      expect(r.nodeIds.some((id) => byId.get(id)!.type === 'gate'), `${a}->${b}`).toBe(false)
      expect(r.nodeIds.some((id) => id.startsWith('st7') && id.endsWith('w_top')), `${a}->${b}`).toBe(true)
    }
  })
})

describe('dobongsan: guidance helpers', () => {
  const steps = (from: string, to: string, stepFree = false) => buildSteps(station, findRoute(station, from, to, { stepFree })!)
  it('says which way to go after stairs and gates', () => {
    const all = exits.flatMap((e) => platforms.map((p) => steps(e, p))).flat()
    expect(all.some((x) => x.turn?.label.ko.startsWith('개찰구를 지나면 '))).toBe(true)
    expect(all.some((x) => x.turn?.label.ko.startsWith('계단을 올라오면 '))).toBe(true)
    const back = platforms.flatMap((p) => exits.map((e) => steps(p, e))).flat()
    expect(back.some((x) => x.turn?.label.ko.startsWith('계단을 내려오면 '))).toBe(true)
  })
  it('never tells to turn around right after arriving on a platform from the stairs', () => {
    for (const e of exits)
      for (const p of platforms) {
        const last = steps(e, p).at(-1)!
        expect(last.turn?.arrow, `${e}->${p}`).not.toBe('⬇️')
      }
  })
  it('starting at a gate, says "enter" at the next gate when heading into a paid area', () => {
    const s = steps('gate_7e', 'board1_mangwolsa')
    const g = s.filter((x) => x.kind === 'gate')
    for (const x of g) expect(x.title.ko).toContain('들어가세요')
  })
  it('names landmarks at step ends', () => {
    const s = steps('exit2', 'board7_jangam')
    expect(s.some((x) => (x.landmarks?.length ?? 0) > 0)).toBe(true)
  })
  it('says which elevator button to press, using the API floor names', () => {
    const up = steps('exit2', 'board7_suraksan', true).filter((x) => x.via === 'elevator')
    expect(up.map((x) => x.press)).toContain('2')
    const out = steps('board7_jangam', 'exit1-1', true).filter((x) => x.via === 'elevator')
    expect(out.map((x) => x.press)).toContain('1') // 외부5: B1 → 1
  })
  it('tells which door to wait at, with the right number of cars per line', () => {
    expect(nearestDoor('board1_dobong', byId.get('board1_dobong')!.pos)!.id).toMatch(/^(10|[1-9])-[1-4]$/)
    expect(steps('exit2', 'board7_jangam').at(-1)!.door).toMatch(/^[1-8]-[1-4]$/)
  })
})

describe('dobongsan: destinations, timetable and profile', () => {
  it('finds Line 1 and Line 7 stations on the right platform', () => {
    expect(findDestinationIn(DOBONGSAN_DESTINATIONS, '장암')!.boarding).toBe('board7_jangam')
    expect(findDestinationIn(DOBONGSAN_DESTINATIONS, '노원')!.boarding).toBe('board7_suraksan')
    expect(findDestinationIn(DOBONGSAN_DESTINATIONS, '의정부')!.boarding).toBe('board1_mangwolsa')
    expect(findDestinationIn(DOBONGSAN_DESTINATIONS, '서울역')!.boarding).toBe('board1_dobong')
    expect(findDestinationIn(DOBONGSAN_DESTINATIONS, '군자')!.stops).toBe(15)
  })
  it('uses the Line 7 timetable and skips trains that end too early', () => {
    const r = nextDepartures('board7_suraksan', undefined, new Date(2026, 10, 25, 8, 0))
    expect(r.length).toBe(2)
    expect(reaches('건대입구', findDestinationIn(DOBONGSAN_DESTINATIONS, '석남'))).toBe(false)
    expect(reaches('온수', findDestinationIn(DOBONGSAN_DESTINATIONS, '노원'))).toBe(true)
    expect(nextDepartures('board1_dobong', undefined, new Date(2026, 10, 25, 8, 0))).toEqual([])
  })
  it('selects the station from ?station=', () => {
    expect(currentProfile('?station=dobongsan').station.id).toBe('dobongsan')
    expect(currentProfile('').station.id).toBe('gunja')
    expect(currentProfile('?station=zzz').station.id).toBe('gunja')
  })
})
