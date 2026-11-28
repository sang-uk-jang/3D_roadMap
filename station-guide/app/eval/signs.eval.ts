// 표지판 인식 정확도 측정: 군자역 영상 장면 8장(test-data/signs/cases.json)을
// 앱과 같은 전처리 + Tesseract로 읽고, 위치 매칭 결과를 정답과 비교한다.
// 실행: npm run eval:signs  → 결과는 test-data/signs/eval-result.json
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { createWorker } from 'tesseract.js'
import { it } from 'vitest'
import { matchSignText } from '../src/locate/match'
import { preprocessVariants, toRGBA } from '../src/locate/preprocess'

const dir = fileURLToPath(new URL('../test-data/signs/', import.meta.url))
const cachePath = fileURLToPath(new URL('../node_modules/.cache/tesseract/', import.meta.url))

type Case = { file: string; crop: [number, number, number, number]; sees: string; expect: string[] }

it('evaluates sign recognition', async () => {
  const { cases } = JSON.parse(readFileSync(dir + 'cases.json', 'utf8')) as { cases: Case[] }
  const worker = await createWorker(['kor', 'eng'], 1, { cachePath })
  await worker.setParameters({ tessedit_pageseg_mode: '11' as never })

  const rows = []
  for (const c of cases) {
    const img = jpeg.decode(readFileSync(dir + c.file), { useTArray: true })
    const [x, y, w, h] = c.crop
    const t0 = Date.now()
    const texts: string[] = []
    for (const g of preprocessVariants(img.data, img.width, { x, y, w, h })) {
      const buf = jpeg.encode({ data: Buffer.from(toRGBA(g)), width: g.width, height: g.height }, 95).data
      texts.push((await worker.recognize(buf)).data.text)
    }
    const ms = Date.now() - t0
    const data = { text: texts.join('\n') }
    const m = matchSignText(data.text)
    const top = m.candidates[0]?.nodeId ?? null
    // 정답 판정: 정답이 있는 장면은 1순위 후보가 정답 목록에 있고 확신(confident)일 때만 '바로 맞힘'
    const auto = c.expect.length > 0 && !!top && m.confident && c.expect.includes(top)
    const inTop = c.expect.length > 0 && m.candidates.some((k) => c.expect.includes(k.nodeId))
    // 틀린 위치를 확신하는 경우(가장 나쁜 실패)
    const wrongConfident = m.confident && !!top && !c.expect.includes(top)
    // 출구 표지판인 건 알아냈지만 번호를 못 읽어 번호만 물어보는 경우
    const askedExitNumber = m.ask === 'exitNumber' && c.expect.some((e) => /^x\d_bot$|^exit\d$/.test(e))
    rows.push({ file: c.file, sees: c.sees, ocr: data.text.replace(/\s+/g, ' ').trim(), ms, top, confident: m.confident, ask: m.ask ?? null, auto, inTop, wrongConfident, askedExitNumber })
  }
  await worker.terminate()

  const n = rows.length
  const summary = {
    cases: n,
    autoCorrect: rows.filter((r) => r.auto).length,
    correctInCandidates: rows.filter((r) => r.inTop).length,
    exitSignButNumberAsked: rows.filter((r) => r.askedExitNumber).length,
    wrongButConfident: rows.filter((r) => r.wrongConfident).length,
    fellBackToButtons: rows.filter((r) => !r.confident).length,
    avgMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / n),
  }
  writeFileSync(dir + 'eval-result.json', JSON.stringify({ summary, rows }, null, 1))
  console.log(summary)
}, 300_000)
