// 군자역 엘리베이터·에스컬레이터 실시간 가동 상태 (공공데이터포털 서울교통공사_편의시설위치정보).
// 원본 데이터는 5분마다 갱신되므로 서버에서 5분 캐시한다 → 사용자 수와 상관없이 5분에 2회 호출.

export type FacilityStatus = {
  /** 쓸 수 없는 시설(fcltNo) */
  unavailable: string[]
  /** 시설별 원본 가동현황 코드 */
  status: Record<string, string>
  updatedAt: string
}

const BASE = 'https://apis.data.go.kr/B553766/facility'
const TTL_MS = 5 * 60 * 1000

// 가동현황(oprtngSitu) 코드: 군자역 18대 중 17대가 'M', 1대가 'S'.
// 명세에 코드 설명이 없어 'M'만 정상 운행으로 보고 나머지는 쓸 수 없다고 본다(안전한 쪽). 확인 필요.
export const NORMAL_CODES = new Set(['M'])

type Item = { fcltNo?: string; stnNm?: string; oprtngSitu?: string }

export function parseFacilityItems(items: Item[], stnNm = '군자'): Omit<FacilityStatus, 'updatedAt'> {
  const status: Record<string, string> = {}
  for (const it of items) {
    if (!it.fcltNo || !String(it.stnNm ?? '').startsWith(stnNm)) continue
    status[String(it.fcltNo)] = String(it.oprtngSitu ?? '')
  }
  const unavailable = Object.entries(status)
    .filter(([, code]) => !NORMAL_CODES.has(code))
    .map(([no]) => no)
  return { unavailable, status }
}

async function fetchItems(op: string, key: string, fetcher: typeof fetch, stnNm: string): Promise<Item[]> {
  const q = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '100', dataType: 'JSON', stnNm })
  const res = await fetcher(`${BASE}/${op}?${q}`)
  if (!res.ok) throw new Error(`facility API ${op} ${res.status}`)
  const body = (await res.json()) as { response?: { body?: { items?: { item?: Item | Item[] } } } }
  const item = body.response?.body?.items?.item
  return Array.isArray(item) ? item : item ? [item] : []
}

// 역마다 따로 5분 캐시
const cache = new Map<string, { at: number; data: FacilityStatus }>()

export async function getFacilityStatus(key: string, fetcher: typeof fetch = fetch, now = Date.now(), stnNm = '군자'): Promise<FacilityStatus> {
  const hit = cache.get(stnNm)
  if (hit && now - hit.at < TTL_MS) return hit.data
  const [el, es] = await Promise.all([fetchItems('getFcElvtr', key, fetcher, stnNm), fetchItems('getFcEsctr', key, fetcher, stnNm)])
  const data = { ...parseFacilityItems([...el, ...es], stnNm), updatedAt: new Date(now).toISOString() }
  cache.set(stnNm, { at: now, data })
  return data
}

export function clearFacilityCache() {
  cache.clear()
}
