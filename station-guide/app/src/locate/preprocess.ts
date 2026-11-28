// OCR 전 이미지 전처리(브라우저·Node 공용 순수 함수).
// 자르기 → 흑백 → 어두운 바탕(지하철 표지판 대부분)이면 반전 → 글자 높이가 충분하도록 확대.

export type Rect = { x: number; y: number; w: number; h: number }
export type Gray = { data: Uint8ClampedArray; width: number; height: number }

/** RGBA 이미지를 잘라 흑백으로 */
export function cropGray(rgba: Uint8ClampedArray | Uint8Array, width: number, crop: Rect): Gray {
  const x0 = Math.max(0, Math.round(crop.x))
  const y0 = Math.max(0, Math.round(crop.y))
  const w = Math.max(1, Math.round(crop.w))
  const h = Math.max(1, Math.round(crop.h))
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * width + (x0 + x)) * 4
      out[y * w + x] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    }
  }
  return { data: out, width: w, height: h }
}

export function mean(g: Gray): number {
  let s = 0
  for (const v of g.data) s += v
  return s / g.data.length
}

/** 어두운 바탕에 밝은 글자면 반전해서 "흰 바탕 검은 글자"로 */
export function normalizePolarity(g: Gray): Gray {
  if (mean(g) >= 110) return g
  const out = new Uint8ClampedArray(g.data.length)
  for (let i = 0; i < out.length; i++) out[i] = 255 - g.data[i]
  return { ...g, data: out }
}

/** 양선형 확대. 짧은 변이 target 이상이 되도록(최대 4배). 멀리서 찍은 작은 글씨 대응 */
export function upscale(g: Gray, targetShort = 240, maxScale = 4): Gray {
  const scale = Math.min(maxScale, Math.max(1, targetShort / Math.min(g.width, g.height)))
  if (scale === 1) return g
  const W = Math.round(g.width * scale)
  const H = Math.round(g.height * scale)
  const out = new Uint8ClampedArray(W * H)
  for (let y = 0; y < H; y++) {
    const sy = Math.min(g.height - 1, y / scale)
    const y1 = Math.floor(sy)
    const y2 = Math.min(g.height - 1, y1 + 1)
    const fy = sy - y1
    for (let x = 0; x < W; x++) {
      const sx = Math.min(g.width - 1, x / scale)
      const x1 = Math.floor(sx)
      const x2 = Math.min(g.width - 1, x1 + 1)
      const fx = sx - x1
      const a = g.data[y1 * g.width + x1]
      const b = g.data[y1 * g.width + x2]
      const c = g.data[y2 * g.width + x1]
      const d = g.data[y2 * g.width + x2]
      out[y * W + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    }
  }
  return { data: out, width: W, height: H }
}

export function preprocess(rgba: Uint8ClampedArray | Uint8Array, width: number, crop: Rect): Gray {
  return upscale(normalizePolarity(cropGray(rgba, width, crop)))
}

export function invert(g: Gray): Gray {
  const out = new Uint8ClampedArray(g.data.length)
  for (let i = 0; i < out.length; i++) out[i] = 255 - g.data[i]
  return { ...g, data: out }
}

/**
 * OCR에 넣을 두 가지 버전: 확대한 흑백 원본과 그 반전본.
 * 표지판마다 글자색·바탕색이 달라(검정 바탕 흰 글자, 노랑 바탕 검정 글자) 둘 다 읽고 합치는 편이 더 많이 읽힌다.
 */
export function preprocessVariants(rgba: Uint8ClampedArray | Uint8Array, width: number, crop: Rect): Gray[] {
  const g = upscale(cropGray(rgba, width, crop))
  return [g, invert(g)]
}

/** 흑백 → RGBA (캔버스·인코더용) */
export function toRGBA(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4)
  for (let i = 0; i < g.data.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g.data[i]
    out[i * 4 + 3] = 255
  }
  return out
}
