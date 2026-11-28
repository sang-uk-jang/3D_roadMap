// 배포용 서버리스 함수: GET /api/facilities (엘리베이터·에스컬레이터 실시간 가동 상태)
import { handleApi } from '../server/routes'

export async function GET(request?: Request): Promise<Response> {
  const search = request ? new URL(request.url).search : ''
  const r = await handleApi('/api/facilities' + search, 'GET', null, process.env)
  return Response.json(r.body, { status: r.status, headers: r.cacheSeconds ? { 'Cache-Control': `public, max-age=${r.cacheSeconds}` } : {} })
}
