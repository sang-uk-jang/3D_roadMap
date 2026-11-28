// 브라우저 → /api/locate. 사진(또는 지정한 표지판 영역)을 줄여서 보낸다.
import type { Rect } from './preprocess'

export type AIResult = { nodeId: string; confidence: number; reason: string }

/** 긴 변 기준 최대 크기. 이미지 토큰(=비용)을 줄인다 */
const MAX_SIDE = 1024

async function toJpegBase64(file: Blob, crop?: Rect): Promise<string> {
  const bmp = await createImageBitmap(file)
  const sx = crop?.x ?? 0
  const sy = crop?.y ?? 0
  const sw = crop?.w ?? bmp.width
  const sh = crop?.h ?? bmp.height
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

/** 실패하거나 서버에 키가 없으면 null */
export async function askAI(file: Blob, crop?: Rect): Promise<AIResult | null> {
  try {
    // 영역을 너무 작게 잡았으면 사진 전체를 보낸다(주변 맥락이 단서가 됨)
    const useCrop = crop && crop.w > 80 && crop.h > 40 ? crop : undefined
    const image = await toJpegBase64(file, useCrop)
    const res = await fetch(`${import.meta.env.BASE_URL}api/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
    })
    if (!res.ok) return null
    return (await res.json()) as AIResult
  } catch {
    return null
  }
}
