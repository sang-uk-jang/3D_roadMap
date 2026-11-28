// 출발·도착 모든 조합을 자동 점검한다: 경로가 있는지, 개찰구를 맞게 지나는지, 안내 단계가 말이 되는지.
import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { findRoute, findRouteVia } from '../station/route'
import type { Station } from '../station/types'
import { buildSteps, isInsideGates } from './steps'

const station = data as Station
const exits = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `exit${n}`)
const platforms = ['board5_w', 'board5_e', 'board7_w', 'board7_e']
// 사진으로 찾을 수 있는 위치(출구 계단 아래, 개찰구, 승강장 가운데 등)
const located = [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `x${n}_bot`), 'gate_w', 'gate_e', 'gate_7', 'p5_c', 'hall_e', 'toilet_w']
const origins = [...exits, ...platforms, ...located]
const targets = [...platforms, ...exits]
const ELEVATOR_EXITS = new Set(['exit4', 'exit7'])
const floorOf = (id: string) => station.nodes.find((n) => n.id === id)!.floor
const gatesIn = (ids: string[]) => ids.filter((id) => id.startsWith('gate')).length

type Case = { from: string; to: string; stepFree: boolean }
const cases: Case[] = []
for (const from of origins) for (const to of targets) if (from !== to) for (const stepFree of [false, true]) cases.push({ from, to, stepFree })

describe(`all origin × destination combinations (${cases.length})`, () => {
  it('finds a route for every combination, except step-free via an exit without an elevator', () => {
    const missing: string[] = []
    for (const c of cases) {
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })
      const exitWithoutLift = [c.from, c.to].some((id) => id.startsWith('exit') && !ELEVATOR_EXITS.has(id)) || /^x[123568]_bot$/.test(c.from)
      if (!r && !(c.stepFree && exitWithoutLift)) missing.push(`${c.from}->${c.to}${c.stepFree ? ' (step-free)' : ''}`)
    }
    expect(missing).toEqual([])
  })

  it('passes the right number of gates (enter once, leave once, none for transfers)', () => {
    const wrong: string[] = []
    for (const c of cases) {
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })
      if (!r) continue
      const startInside = c.from.startsWith('gate') ? null : isInsideGates(station, c.from)
      const endInside = isInsideGates(station, c.to)
      if (startInside === null) continue // 개찰구 자체에서 출발: 어느 쪽인지 정하지 않음
      const expected = startInside === endInside ? 0 : 1
      const got = gatesIn(r.nodeIds.slice(1))
      if (got !== expected) wrong.push(`${c.from}->${c.to}: ${got} gates, expected ${expected}`)
    }
    expect(wrong).toEqual([])
  })

  it('produces contiguous, sensible guidance steps', () => {
    const problems: string[] = []
    for (const c of cases) {
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })
      if (!r) continue
      const steps = buildSteps(station, r)
      const tag = `${c.from}->${c.to}`
      if (steps[0].from !== 0 || steps.at(-1)!.to !== r.nodeIds.length - 1) problems.push(`${tag}: does not cover route`)
      steps.forEach((s, i) => {
        if (i > 0 && s.from !== steps[i - 1].to) problems.push(`${tag}: gap at step ${i}`)
        if (!s.title.ko || !s.title.en) problems.push(`${tag}: empty text at step ${i}`)
        if (s.distance > 150) problems.push(`${tag}: step ${i} walks ${Math.round(s.distance)}m without a checkpoint`)
      })
      if (steps.length > 10) problems.push(`${tag}: ${steps.length} steps`)
      r.edges.forEach((e, i) => {
        const same = floorOf(r.nodeIds[i]) === floorOf(r.nodeIds[i + 1])
        if ((e.kind === 'walk') !== same) problems.push(`${tag}: ${e.kind} edge with wrong floor change`)
      })
      if (c.stepFree && r.edges.some((e) => e.kind === 'stairs' || e.kind === 'escalator')) problems.push(`${tag}: step-free uses stairs`)
    }
    expect(problems).toEqual([])
  })

  it('keeps each step on one floor: walking steps never change floor, floor-change steps start at the stairs/elevator', () => {
    const problems: string[] = []
    for (const c of cases) {
      const r = findRoute(station, c.from, c.to, { stepFree: c.stepFree })
      if (!r) continue
      for (const [i, s] of buildSteps(station, r).entries()) {
        const ids = r.nodeIds.slice(s.from, s.to + 1)
        if (s.kind !== 'move') {
          if (new Set(ids.map(floorOf)).size > 1) problems.push(`${c.from}->${c.to}: step ${i} (${s.kind}) spans floors`)
        } else if (s.distance >= 8) problems.push(`${c.from}->${c.to}: step ${i} walks ${Math.round(s.distance)}m before changing floor`)
      }
    }
    expect(problems).toEqual([])
  })

  it('stops at a ticket machine before entering the gates for every exit → platform trip', () => {
    for (const from of exits) {
      for (const to of platforms) {
        const r = findRouteVia(station, from, ['ticket_w', 'ticket_e'], to)!
        const t = r.nodeIds.findIndex((id) => id.startsWith('ticket'))
        const g = r.nodeIds.findIndex((id) => id.startsWith('gate'))
        expect(t, `${from}->${to}`).toBeGreaterThan(-1)
        expect(t, `${from}->${to}`).toBeLessThan(g)
      }
    }
  })
})
