import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { findDestination } from '../data/lines'
import { findRoute, findRouteVia } from '../station/route'
import type { Station } from '../station/types'
import { buildSteps } from './steps'

const station = data as Station

function stepsFor(from: string, to: string, ticket = false, stepFree = false) {
  const route = ticket
    ? findRouteVia(station, from, ['ticket_w', 'ticket_e'], to, { stepFree })!
    : findRoute(station, from, to, { stepFree })!
  return { route, steps: buildSteps(station, route) }
}

describe('buildSteps', () => {
  it('covers the whole route with contiguous steps', () => {
    for (const [a, b] of [['exit1', 'board7_e'], ['board5_e', 'board7_w'], ['board7_e', 'exit6'], ['exit4', 'board5_w']]) {
      const { route, steps } = stepsFor(a, b)
      expect(steps[0].from).toBe(0)
      expect(steps.at(-1)!.to).toBe(route.nodeIds.length - 1)
      for (let i = 1; i < steps.length; i++) expect(steps[i].from).toBe(steps[i - 1].to)
    }
  })

  it('describes a street-to-platform trip: escalator down, gates, then down to the platform', () => {
    const { steps } = stepsFor('exit1', 'board5_w')
    expect(steps.map((s) => s.kind)).toEqual(['move', 'gate', 'walk', 'move', 'arrive'])
    expect(steps[0].title.ko).toContain('에스컬레이터로')
    expect(steps[0].title.ko).toContain('내려가세요')
    expect(steps[1].title.ko).toContain('찍고 들어가세요')
    expect(steps[0].sign?.ko).toBe('타는 곳 5호선')
  })

  it('adds a ticket step before the gates when buying a ticket', () => {
    const { steps } = stepsFor('exit8', 'board5_w', true)
    const kinds = steps.map((s) => s.kind)
    expect(kinds.indexOf('ticket')).toBeGreaterThan(-1)
    expect(kinds.indexOf('ticket')).toBeLessThan(kinds.indexOf('gate'))
  })

  it('shows transfer signs and no gate when changing lines', () => {
    const { steps } = stepsFor('board5_e', 'board7_w')
    expect(steps.some((s) => s.kind === 'gate')).toBe(false)
    expect(steps[0].sign?.ko).toBe('갈아타는 곳 7호선')
  })

  it('says "leave" at the gates and "up" to the exit when leaving the station', () => {
    const { steps } = stepsFor('board7_e', 'exit6')
    expect(steps.find((s) => s.kind === 'gate')!.title.ko).toContain('나가세요')
    const last = steps.at(-1)!
    expect(last.title.ko).toContain('6번 출구까지 올라가세요')
  })

  it('merges a multi-floor elevator ride into one step', () => {
    const { steps } = stepsFor('exit4', 'board7_e', false, true)
    const rides = steps.filter((s) => s.via === 'elevator')
    expect(rides.some((s) => s.title.ko.includes('지하3층'))).toBe(true)
    expect(rides.every((s) => s.title.en.startsWith('Take') || s.title.en.startsWith('Walk'))).toBe(true)
  })
})

describe('findDestination', () => {
  it('maps stations to the right platform', () => {
    expect(findDestination('광화문')!.boarding).toBe('board5_w')
    expect(findDestination('olympic park')!.boarding).toBe('board5_e')
    expect(findDestination('olympic park')!.branch).toBe('macheon')
    expect(findDestination('건대입구역')!.boarding).toBe('board7_w')
    expect(findDestination('Nowon')!.boarding).toBe('board7_e')
    expect(findDestination('없는역')).toBeUndefined()
  })
})

describe('starting from a located point', () => {
  it('knows the Line 5 platform is inside the gates and the east hall is outside', async () => {
    const { isInsideGates } = await import('./steps')
    expect(isInsideGates(station, 'p5_c')).toBe(true)
    expect(isInsideGates(station, 'paid_5')).toBe(true)
    expect(isInsideGates(station, 'hall_e')).toBe(false)
    expect(isInsideGates(station, 'x4_bot')).toBe(false)
  })

  it('says "leave" when going from the platform middle to an exit', () => {
    const { steps } = stepsFor('p5_c', 'exit3')
    expect(steps.find((s) => s.kind === 'gate')!.title.ko).toContain('나가세요')
  })
})
