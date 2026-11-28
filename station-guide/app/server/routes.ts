// /api/* 공용 라우터: 개발 서버(vite.config.ts)와 배포용 서버리스 함수(api/*.ts)가 같이 쓴다.
// API 키는 서버에서만 읽고 브라우저로는 결과만 보낸다.
import { getArrivals } from './arrivals'
import { getFacilityStatus } from './facilities'
import { handleLocate } from './handler'

export type ApiResult = { status: number; body: unknown; cacheSeconds?: number }
type Env = Record<string, string | undefined>

/** 편의시설 API에 넘길 역명(쿼리 ?station=...). 모르는 값은 군자 */
const FACILITY_STATIONS: Record<string, string> = { gunja: '군자', dobongsan: '도봉산' }

export async function handleApi(rawPath: string, method: string, body: unknown, env: Env): Promise<ApiResult> {
  const [path, query = ''] = rawPath.split('?')
  const stnNm = FACILITY_STATIONS[new URLSearchParams(query).get('station') ?? ''] ?? '군자'
  try {
    if (path === '/api/locate' && method === 'POST') return await handleLocate(body, env)
    if (path === '/api/facilities' && method === 'GET') {
      if (!env.STATION_API_KEY) return { status: 501, body: { error: 'facility status is not configured' } }
      return { status: 200, body: await getFacilityStatus(env.STATION_API_KEY, fetch, Date.now(), stnNm), cacheSeconds: 60 }
    }
    if (path === '/api/arrivals' && method === 'GET') {
      if (!env.SEOUL_API_KEY) return { status: 501, body: { error: 'arrival info is not configured' } }
      return { status: 200, body: await getArrivals(env.SEOUL_API_KEY), cacheSeconds: 15 }
    }
    return { status: 404, body: { error: 'not found' } }
  } catch {
    return { status: 502, body: { error: 'upstream request failed' } }
  }
}
