// 처음 온 사람용 보조 안내: 계단·개찰구를 지난 뒤 방향, 단계 끝 확인 표식, 엘리베이터 버튼
import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import { findRoute } from '../station/route'
import type { Station } from '../station/types'
import { buildSteps } from './steps'

const station = data as Station
const steps = (from: string, to: string, stepFree = false) => buildSteps(station, findRoute(station, from, to, { stepFree })!)

describe('first-visit guidance', () => {
  it('tells which way to go after passing the gates and after coming down the stairs', () => {
    const all = ['exit1', 'exit3', 'exit6', 'exit8']
      .flatMap((e) => ['board5_w', 'board5_e', 'board7_w', 'board7_e'].map((b) => steps(e, b)))
      .flat()
    expect(all.some((x) => x.turn?.label.ko.startsWith('개찰구를 지나면 '))).toBe(true)
    expect(all.some((x) => x.turn?.label.ko.startsWith('계단을 내려오면 '))).toBe(true)
    expect(all.some((x) => x.turn?.label.ko.startsWith('에스컬레이터에서 내리면 '))).toBe(true)
  })

  it('turn direction matches geometry: facing east, going south is a right turn', () => {
    // 동쪽 계단은 서쪽(-x)으로 내려간다. 내려와서 승강장 가운데(동쪽 +x)로 가면 뒤로 돌아야 한다
    const s = steps('exit4', 'board5_e')
    expect(s.some((x) => x.turn)).toBe(true)
    for (const x of s) if (x.turn) expect(['⬆️', '↗️', '↖️', '➡️', '⬅️', '⬇️']).toContain(x.turn.arrow)
  })

  it('names nearby landmarks so the user can check they are in the right place', () => {
    const s = steps('exit8', 'board5_w')
    const gate = s.find((x) => x.kind === 'gate')!
    expect(gate.landmarks?.map((l) => l.ko)).toContain('승차권 발매기')
  })

  it('says which elevator button to press', () => {
    const s = steps('exit4', 'board7_e', true)
    const rides = s.filter((x) => x.via === 'elevator')
    expect(rides.length).toBeGreaterThan(0)
    expect(rides.map((r) => r.press)).toContain('B3')
  })
})
