// 배포용 서버리스 함수: GET /api/arrivals (군자역 실시간 열차 도착정보)
import { handleApi } from '../server/routes'

export async function GET(): Promise<Response> {
  const r = await handleApi('/api/arrivals', 'GET', null, process.env)
  return Response.json(r.body, { status: r.status, headers: r.cacheSeconds ? { 'Cache-Control': `public, max-age=${r.cacheSeconds}` } : {} })
}
