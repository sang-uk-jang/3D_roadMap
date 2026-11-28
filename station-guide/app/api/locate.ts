// 배포용 서버리스 함수: POST /api/locate  (웹 표준 Request/Response 형식)
// 호스팅의 환경변수에 ANTHROPIC_API_KEY를 넣어야 동작한다. 없으면 501을 돌려주고 앱은 버튼 선택만 보여준다.
import { handleLocate } from '../server/handler'

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const { status, body: out } = await handleLocate(body, process.env)
  return Response.json(out, { status })
}
