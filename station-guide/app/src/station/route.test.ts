import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { validateStation } from './graph'
import { findRoute, findRouteVia } from './route'
import type { Station } from './types'

const station = data as Station
const floorOf = (id: string) => station.nodes.find((n) => n.id === id)!.floor

describe('gunja data', () => {
  it('passes validation (ids, floors, connectivity, slopes)', () => {
    expect(validateStation(station)).toEqual([])
  })

  it('links every elevator and escalator to a facility number from the API', () => {
    for (const e of station.edges) {
      if (e.kind === 'elevator') expect(e.facilityRefs?.length).toBeGreaterThan(0)
    }
    const escalatorRefs = station.edges.filter((e) => e.kind === 'escalator').flatMap((e) => e.facilityRefs ?? [])
    // 편의시설 API의 군자역 에스컬레이터 14대
    expect(new Set(escalatorRefs).size).toBe(14)
  })
})

describe('findRoute', () => {
  it('goes from exit 1 through the west gates to the Line 5 platform', () => {
    const r = findRoute(station, 'exit1', 'board5_w')!
    expect(r.nodeIds).toContain('gate_w')
    expect(r.edges[0].kind).toBe('escalator')
  })

  it('never jumps floors on a walk edge', () => {
    const r = findRoute(station, 'exit2', 'board7_w')!
    r.edges.forEach((e, i) => {
      const a = floorOf(r.nodeIds[i])
      const b = floorOf(r.nodeIds[i + 1])
      if (e.kind === 'walk') expect(a).toBe(b)
      else expect(a).not.toBe(b)
    })
  })

  it('transfers from Line 5 to both Line 7 platforms', () => {
    const w = findRoute(station, 'board5_e', 'board7_w')!
    const e = findRoute(station, 'board5_e', 'board7_e')!
    expect(w.nodeIds.at(-1)).toBe('board7_w')
    expect(e.nodeIds.at(-1)).toBe('board7_e')
    // 환승은 개찰구를 지나지 않는다
    expect(w.nodeIds.some((id) => id.startsWith('gate'))).toBe(false)
  })

  it('passes through exactly one set of gates from a street exit to a platform', () => {
    for (const exit of ['exit1', 'exit3', 'exit5', 'exit8']) {
      for (const target of ['board5_w', 'board5_e', 'board7_w', 'board7_e']) {
        const r = findRoute(station, exit, target)!
        expect(r.nodeIds.filter((id) => id.startsWith('gate')).length, `${exit}->${target}`).toBe(1)
      }
    }
  })

  it('prefers stairs and escalators over elevators when not step-free', () => {
    const r = findRoute(station, 'exit1', 'board7_e')!
    expect(r.edges.some((e) => e.kind === 'elevator')).toBe(false)
  })

  it('uses only walk and elevator edges when step-free', () => {
    const r = findRoute(station, 'exit4', 'board7_e', { stepFree: true })!
    expect(r).not.toBeNull()
    for (const e of r.edges) expect(['walk', 'elevator']).toContain(e.kind)
  })

  it('has no step-free route from an exit without an elevator', () => {
    expect(findRoute(station, 'exit1', 'board5_w', { stepFree: true })).toBeNull()
  })

  it('drops an elevator reported out of service', () => {
    const normal = findRoute(station, 'exit4', 'board5_w', { stepFree: true })!
    expect(normal.edges.some((e) => e.facilityRefs?.includes('1310686'))).toBe(true)
    expect(findRoute(station, 'exit4', 'board5_w', { stepFree: true, unavailableFacilities: ['1310686'] })).toBeNull()
  })

  it('keeps an escalator pair usable while one of the two units runs', () => {
    const r = findRoute(station, 'exit4', 'board5_e', { unavailableFacilities: ['1310690'] })!
    expect(r.edges[0].kind).toBe('escalator')
  })

  it('stops at the ticket machine before the gates', () => {
    const r = findRouteVia(station, 'exit8', ['ticket_w', 'ticket_e'], 'board5_w')!
    expect(r.nodeIds.indexOf('ticket_w')).toBeGreaterThan(-1)
    expect(r.nodeIds.indexOf('ticket_w')).toBeLessThan(r.nodeIds.indexOf('gate_w'))
  })
})
