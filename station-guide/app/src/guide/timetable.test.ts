import { describe, expect, it } from 'vitest'
import { findDestination } from '../data/lines'
import { nextDepartures, reaches } from './timetable'

// 2026-11-25(수) 평일, 2026-11-29(일)
const wed = (h: number, m: number) => new Date(2026, 10, 25, h, m)

describe('timetable next departures', () => {
  it('returns upcoming weekday trains in order', () => {
    const r = nextDepartures('board5_w', undefined, wed(5, 30))
    expect(r[0]).toMatchObject({ time: '05:32', terminus: '방화', minutes: 2 })
    expect(r[1].minutes).toBeGreaterThanOrEqual(r[0].minutes)
  })

  it('skips trains that end before the destination', () => {
    const gwanghwamun = findDestination('광화문')!
    expect(reaches('왕십리', gwanghwamun)).toBe(false) // 왕십리행은 광화문까지 안 감
    expect(reaches('애오개', gwanghwamun)).toBe(true)
    expect(reaches('방화', gwanghwamun)).toBe(true)
  })

  it('keeps Line 5 branches apart after Gangdong', () => {
    const olympic = findDestination('올림픽공원')! // 마천 갈래
    expect(reaches('마천', olympic)).toBe(true)
    expect(reaches('하남검단산', olympic)).toBe(false)
    expect(reaches('상일동', findDestination('고덕')!)).toBe(true)
  })

  it('uses the Sunday (holiday) table and wraps past midnight', () => {
    const sun = nextDepartures('board7_e', undefined, new Date(2026, 10, 29, 9, 0))
    expect(sun.length).toBe(2)
    const late = nextDepartures('board5_w', undefined, new Date(2026, 10, 26, 0, 20)) // 목 00:20 → 수요일 운행의 연장
    expect(late[0].time.startsWith('00:')).toBe(true)
  })

  it('returns nothing after the last train', () => {
    expect(nextDepartures('board5_w', undefined, new Date(2026, 10, 26, 2, 0))).toEqual([])
  })
})
