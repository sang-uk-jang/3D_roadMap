// 군자역 실시간 열차 도착정보 (서울 열린데이터광장 '지하철 실시간 도착정보').
// 서울 열린데이터광장 인증키(SEOUL_API_KEY)가 있어야 동작한다. 30초 캐시.
// 확인 필요: 응답 필드는 공개 명세 기준으로 작성했고, 키가 없어 실제 응답으로는 아직 검증하지 못했다.

export type Arrival = { destination: string; message: string; seconds: number | null }
export type ArrivalBoard = { byBoarding: Record<string, Arrival[]>; updatedAt: string }

type Row = { subwayId?: string; trainLineNm?: string; arvlMsg2?: string; barvlDt?: string; bstatnNm?: string }

const TTL_MS = 30 * 1000

/** 노선·방면 → 군자역 탑승 지점 */
export function boardingFor(row: Row): string | null {
  const line = row.subwayId
  const dir = row.trainLineNm ?? ''
  if (line === '1005') {
    if (dir.includes('장한평')) return 'board5_w'
    if (dir.includes('아차산')) return 'board5_e'
  }
  if (line === '1007') {
    if (dir.includes('어린이대공원')) return 'board7_w'
    if (dir.includes('중곡')) return 'board7_e'
  }
  return null
}

export function parseArrivals(rows: Row[]): Record<string, Arrival[]> {
  const out: Record<string, Arrival[]> = {}
  for (const r of rows) {
    const b = boardingFor(r)
    if (!b) continue
    const sec = Number(r.barvlDt)
    const destination = (r.trainLineNm ?? '').split(' - ')[0] || (r.bstatnNm ? `${r.bstatnNm}행` : '')
    ;(out[b] ??= []).push({ destination, message: r.arvlMsg2 ?? '', seconds: Number.isFinite(sec) && sec > 0 ? sec : null })
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.seconds ?? 9e9) - (b.seconds ?? 9e9)).splice(2)
  return out
}

let cache: { at: number; data: ArrivalBoard } | null = null

export async function getArrivals(key: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<ArrivalBoard> {
  if (cache && now - cache.at < TTL_MS) return cache.data
  const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/20/${encodeURIComponent('군자')}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`arrival API ${res.status}`)
  const body = (await res.json()) as { realtimeArrivalList?: Row[] }
  const data = { byBoarding: parseArrivals(body.realtimeArrivalList ?? []), updatedAt: new Date(now).toISOString() }
  cache = { at: now, data }
  return data
}

export function clearArrivalCache() {
  cache = null
}
