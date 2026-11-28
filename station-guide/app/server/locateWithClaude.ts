// 표지판 사진 → 역 안 위치 (LLM 마지막 수단). 서버(서버리스 함수)에서만 실행해 API 키를 숨긴다.
// 브라우저 OCR과 버튼으로도 못 찾았을 때만 호출되므로 호출량이 작다.
import Anthropic from '@anthropic-ai/sdk'
import type { CatalogEntry } from '../src/locate/catalog'

export type LocateRequest = { image: string; mediaType: 'image/jpeg' | 'image/png' }
export type LocateAnswer = { nodeId: string; confidence: number; reason: string }

export const MODEL = 'claude-opus-5-5'

export function buildPrompt(catalog: CatalogEntry[]): string {
  const list = catalog.map((c) => `- ${c.id}: ${c.ko} / ${c.en} — 보이는 것: ${c.signs}`).join('\n')
  return [
    '이 사진은 서울 지하철 군자역(5·7호선) 안에서 길을 잃은 사람이 주변 표지판을 찍은 것입니다.',
    '사진 속 표지판 글자·숫자·노선 색을 보고, 이 사람이 지금 있는 곳을 아래 목록에서 하나만 고르세요.',
    '목록에 없는 위치는 답하지 마세요. 판단할 단서가 없으면 nodeId를 "unknown"으로 하세요.',
    '',
    '위치 목록:',
    list,
    '',
    '다음 JSON 한 개만 출력하세요. 다른 글은 쓰지 마세요.',
    '{"nodeId": "<목록의 id 또는 unknown>", "confidence": <0~1>, "reason": "<읽은 표지판 문구를 근거로 한 짧은 설명>"}',
  ].join('\n')
}

/** 모델 응답 글에서 JSON을 꺼내 검증한다. 목록 밖 id·형식 오류·unknown이면 null */
export function parseAnswer(text: string, catalog: CatalogEntry[]): LocateAnswer | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0]) as Partial<LocateAnswer>
    if (typeof obj.nodeId !== 'string' || !catalog.some((c) => c.id === obj.nodeId)) return null
    const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0
    return { nodeId: obj.nodeId, confidence, reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : '' }
  } catch {
    return null
  }
}

export async function locateWithClaude(req: LocateRequest, catalog: CatalogEntry[], client = new Anthropic()): Promise<LocateAnswer | null> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // 표지판 하나를 목록에서 고르는 단순 분류라 낮은 effort로 비용을 줄인다
    output_config: { effort: 'low' },
    // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.mediaType, data: req.image } },
          { type: 'text', text: buildPrompt(catalog) },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal') return null
  let text = ''
  for (const block of response.content as Anthropic.Beta.BetaContentBlock[]) {
    if (block.type === 'text') text += block.text
  }
  return parseAnswer(text, catalog)
}
