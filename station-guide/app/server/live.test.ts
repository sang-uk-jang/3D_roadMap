import { beforeEach, describe, expect, it, vi } from 'vitest'
import data from '../src/data/gunja.json'
import type { Station } from '../src/station/types'
import { boardingFor, clearArrivalCache, getArrivals, parseArrivals } from './arrivals'
import { clearFacilityCache, getFacilityStatus, parseFacilityItems } from './facilities'
import { handleApi } from './routes'

const station = data as Station
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('facility status', () => {
  beforeEach(() => clearFacilityCache())

  it('treats only "M" as running and keeps Gunja rows only', () => {
    const r = parseFacilityItems([
      { fcltNo: '1310689', stnNm: '군자', oprtngSitu: 'M' },
      { fcltNo: '1310690', stnNm: '군자', oprtngSitu: 'S' },
      { fcltNo: '999', stnNm: '청량리', oprtngSitu: 'S' },
    ])
    expect(r.unavailable).toEqual(['1310690'])
    expect(Object.keys(r.status)).toHaveLength(2)
  })

  it('every facility number in the station data is one the API knows (from the saved snapshot)', async () => {
    const snap = (await import('../../data/raw/gunja_facilities_api.json')).default as unknown as Record<string, { fcltNo: string }[]>
    const known = new Set([...snap.Elvtr, ...snap.Esctr].map((x) => String(x.fcltNo)))
    for (const e of station.edges) for (const ref of e.facilityRefs ?? []) expect(known.has(ref), ref).toBe(true)
  })

  it('calls the API twice, then serves from the 5-minute cache', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ response: { body: { items: { item: [{ fcltNo: '1', stnNm: '군자', oprtngSitu: 'M' }] } } } }))
    await getFacilityStatus('k', fetcher, 0)
    await getFacilityStatus('k', fetcher, 60_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await getFacilityStatus('k', fetcher, 6 * 60_000)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})

describe('train arrivals', () => {
  beforeEach(() => clearArrivalCache())

  it('maps line and direction to the boarding point', () => {
    expect(boardingFor({ subwayId: '1005', trainLineNm: '방화행 - 장한평방면' })).toBe('board5_w')
    expect(boardingFor({ subwayId: '1005', trainLineNm: '마천행 - 아차산방면' })).toBe('board5_e')
    expect(boardingFor({ subwayId: '1007', trainLineNm: '장암행 - 중곡방면' })).toBe('board7_e')
    expect(boardingFor({ subwayId: '1007', trainLineNm: '석남행 - 어린이대공원방면' })).toBe('board7_w')
    expect(boardingFor({ subwayId: '1002', trainLineNm: '성수행' })).toBeNull()
  })

  it('keeps the two soonest trains per platform', () => {
    const r = parseArrivals([
      { subwayId: '1005', trainLineNm: '방화행 - 장한평방면', arvlMsg2: '5분 후', barvlDt: '300' },
      { subwayId: '1005', trainLineNm: '방화행 - 장한평방면', arvlMsg2: '전역 출발', barvlDt: '90' },
      { subwayId: '1005', trainLineNm: '방화행 - 장한평방면', arvlMsg2: '10분 후', barvlDt: '600' },
    ])
    expect(r.board5_w.map((a) => a.seconds)).toEqual([90, 300])
    expect(r.board5_w[0].destination).toBe('방화행')
  })

  it('serves from a 30-second cache', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ realtimeArrivalList: [] }))
    await getArrivals('k', fetcher, 0)
    await getArrivals('k', fetcher, 10_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('api router', () => {
  it('is off (501) without keys and 404 for unknown paths', async () => {
    expect((await handleApi('/api/facilities', 'GET', null, {})).status).toBe(501)
    expect((await handleApi('/api/arrivals', 'GET', null, {})).status).toBe(501)
    expect((await handleApi('/api/nope', 'GET', null, {})).status).toBe(404)
  })
})
