// /api/locate 요청 처리(배포용 서버리스 함수와 개발 서버가 같이 쓴다).
import data from '../src/data/gunja.json'
import { locationCatalog } from '../src/locate/catalog'
import type { Station } from '../src/station/types'
import { locateWithClaude, type LocateAnswer, type LocateRequest } from './locateWithClaude'

const catalog = locationCatalog(data as Station)
const MAX_BASE64 = 4_000_000 // 약 3MB 이미지

export type HandlerResult = { status: number; body: LocateAnswer | { error: string } }

export async function handleLocate(
  body: unknown,
  env: Record<string, string | undefined>,
  locate: typeof locateWithClaude = locateWithClaude,
): Promise<HandlerResult> {
  // 키가 없으면 LLM 단계를 끈다(비용이 드는 호출을 실수로 하지 않도록)
  if (!env.ANTHROPIC_API_KEY) return { status: 501, body: { error: 'AI locate is not configured' } }
  const req = body as Partial<LocateRequest>
  if (typeof req?.image !== 'string' || req.image.length === 0 || req.image.length > MAX_BASE64) {
    return { status: 400, body: { error: 'image (base64) required, max ~3MB' } }
  }
  if (req.mediaType !== 'image/jpeg' && req.mediaType !== 'image/png') {
    return { status: 400, body: { error: 'mediaType must be image/jpeg or image/png' } }
  }
  try {
    const answer = await locate({ image: req.image, mediaType: req.mediaType }, catalog)
    return answer ? { status: 200, body: answer } : { status: 422, body: { error: 'no confident location' } }
  } catch {
    return { status: 502, body: { error: 'AI request failed' } }
  }
}
