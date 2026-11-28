import { describe, expect, it } from 'vitest'
import data from '../data/gunja.json'
import type { Station } from '../station/types'
import { matchSignText } from './match'

const station = data as Station
const ids = new Set(station.nodes.map((n) => n.id))

describe('matchSignText — clean sign text', () => {
  it('finds the exit from an exit sign', () => {
    const r = matchSignText('4 출입구 Entrance')
    expect(r.candidates[0].nodeId).toBe('x4_bot')
    expect(r.confident).toBe(true)
  })

  it('reads the exit number from a station name sign, ignoring station codes', () => {
    const r = matchSignText('544 725 5호선, 7호선 군 자 Gunja 4 출입구')
    expect(r.candidates[0].nodeId).toBe('x4_bot')
    expect(r.stationSeen).toBe(true)
  })

  it('maps transfer and boarding signs', () => {
    expect(matchSignText('갈아타는 곳 7호선 Transfer').candidates[0].nodeId).toBe('p5_c')
    expect(matchSignText('타는 곳 7호선').candidates[0].nodeId).toBe('gate_7')
    expect(matchSignText('중곡 방면 Junggok').candidates[0].nodeId).toBe('board7_e')
  })

  it('asks for the exit number when only the station name is readable', () => {
    const r = matchSignText('군 자 Gunja')
    expect(r.candidates).toEqual([])
    expect(r.ask).toBe('exitNumber')
  })

  it('asks where the user is when nothing useful is read', () => {
    const r = matchSignText('TYTTETETYY')
    expect(r.ask).toBe('where')
    expect(r.confident).toBe(false)
  })

  it('only suggests nodes that exist in the station data', () => {
    const texts = ['1 나가는 곳', '8 Exit', '갈아타는 곳 5호선', '타는 곳 5호선 장한평', '화장실 Toilet', '어린이대공원']
    for (const t of texts) for (const c of matchSignText(t).candidates) expect(ids.has(c.nodeId), `${t} → ${c.nodeId}`).toBe(true)
  })
})

describe('matchSignText — real OCR output from the Gunja video frames', () => {
  // 실제 Tesseract 출력(test-data/signs, 표지판 부분을 자른 사진)
  it('t1: exit 4 entrance sign', () => {
    const r = matchSignText('4 pig Ls 15 BS [ahs [7 4] 호 wd od 14 i ja fv 출입구 an a 기 AA Entrance')
    expect(r.candidates[0].nodeId).toBe('x4_bot')
  })

  it('t2: station sign without a readable exit number → ask the number', () => {
    const r = matchSignText('군 자 Sop — 544 0 7호선 07')
    expect(r.stationSeen).toBe(true)
    expect(r.confident).toBe(false)
  })
})

describe('matchSignText — partial reads', () => {
  it('asks only the exit number when an exit sign has noisy digits', () => {
    const r = matchSignText('227 00102 ye “Hh 9 2h 1 ja AH LS ® a Entrance 출입구')
    expect(r.ask).toBe('exitNumber')
  })

  it('offers all gates when "타는 곳" is read without a line number', () => {
    const r = matchSignText('- ————— 에 타는 곳 중소. a a ~~')
    expect(r.candidates.map((c) => c.nodeId).sort()).toEqual(['gate_7', 'gate_e', 'gate_w'])
    expect(r.confident).toBe(false)
  })

  it('reads a circled line number like "(7)"', () => {
    expect(matchSignText('타는 곳 (7)').candidates[0].nodeId).toBe('gate_7')
  })
})

describe('matchSignText — never confidently wrong on noisy digits', () => {
  it('real browser read where "4" came out as "8": asks the number instead of claiming exit 8', () => {
    const r = matchSignText('*8 ISNT , 20888 Is a 출입구 Entrance so RN RINT , 20880 1787 a 출입구 Entrance oo')
    expect(r.confident).toBe(false)
    expect(r.ask).toBe('exitNumber')
  })

  it('still trusts a clean single-number exit sign', () => {
    expect(matchSignText('나가는 곳 6 Exit').confident).toBe(true)
  })
})

describe('matchSignText — line number fallback', () => {
  it('reads a transfer sign whose "7호선" came out garbled (synthetic test read)', () => {
    expect(matchSignText('갈아타는 곳 7 73M Transfer').candidates[0].nodeId).toBe('p5_c')
  })
  it('does not treat a lone 5 or 7 as a line on non-platform signs', () => {
    expect(matchSignText('나가는 곳 7 Exit').candidates[0].nodeId).toBe('x7_bot')
  })
})
