// 브라우저 OCR. 사용자가 지정한 표지판 영역을 전처리한 뒤 Tesseract.js(한국어+영어)로 읽는다.
// 휴대폰 안에서 돌기 때문에 API 비용이 없다. 처음 한 번 인식 데이터(약 7MB)를 내려받는다.
import type { Worker } from 'tesseract.js'
import { preprocessVariants, toRGBA, type Gray, type Rect } from './preprocess'

let workerPromise: Promise<Worker> | null = null

async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker(['kor', 'eng'], 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status.startsWith('loading') || m.status.startsWith('recognizing')) onProgress?.(m.progress)
        },
      })
      // 11 = 흩어진 글자 찾기(표지판처럼 여기저기 짧은 글자)
      await w.setParameters({ tessedit_pageseg_mode: '11' as never })
      return w
    })()
  }
  return workerPromise
}

export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

/** 이미지의 crop 영역(원본 픽셀 좌표)을 읽어 글자를 돌려준다 */
export async function readSign(img: HTMLImageElement, crop: Rect, onProgress?: (p: number) => void): Promise<string> {
  const src = document.createElement('canvas')
  src.width = img.naturalWidth
  src.height = img.naturalHeight
  const ctx = src.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, src.width, src.height)
  const worker = await getWorker(onProgress)
  // 흑백 원본과 반전본을 둘 다 읽어 합친다
  const texts: string[] = []
  for (const g of preprocessVariants(data, src.width, crop)) {
    const { data: result } = await worker.recognize(toCanvas(g))
    texts.push(result.text)
  }
  return texts.join('\n')
}

function toCanvas(g: Gray): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = g.width
  out.height = g.height
  out.getContext('2d')!.putImageData(new ImageData(toRGBA(g), g.width, g.height), 0, 0)
  return out
}
