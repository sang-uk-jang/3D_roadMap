// 합성 표지판으로 브라우저 OCR + 위치 매칭 정확도를 잰다(개발용 페이지 eval.html).
// 실제 사진이 없어서, 서울교통공사 표지판 형식(어두운 바탕·노란 출구 번호·노선 동그라미)을 흉내 내 그린다.
// 같은 표지판을 깨끗함/흐림/작은 글씨/기울어짐/저대비/잡음 조건으로 바꿔 앱과 같은 readSign()으로 읽는다.
import { matchSignText } from '../locate/match'
import { loadImage, readSign } from '../locate/ocr'

type Sign = { id: string; expect: string[]; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number }
type Variant = { id: string; ko: string; apply: (src: HTMLCanvasElement) => HTMLCanvasElement }

const DARK = '#2b2f36'
const LINE = { '5': '#996CAC', '7': '#747F00' } as const

function panel(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = '#d9dde2'
  c.fillRect(0, 0, w, h)
  c.fillStyle = DARK
  c.fillRect(10, 10, w - 20, h - 20)
}
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', weight = 700) {
  c.font = `${weight} ${size}px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`
  c.fillStyle = color
  c.textBaseline = 'middle'
  c.fillText(s, x, y)
}
function lineCircle(c: CanvasRenderingContext2D, line: '5' | '7', x: number, y: number, r: number) {
  c.fillStyle = LINE[line]
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()
  text(c, line, x - r * 0.35, y + 2, r * 1.3)
}
function exitBox(c: CanvasRenderingContext2D, n: number, x: number, y: number, s: number) {
  c.fillStyle = '#f2c200'
  c.fillRect(x, y, s, s)
  text(c, String(n), x + s * 0.27, y + s * 0.5, s * 0.8, '#111')
}

const SIGNS: Sign[] = [
  ...[1, 3, 4, 6, 8].map<Sign>((n) => ({
    id: `exit${n}`,
    expect: [`x${n}_bot`],
    width: 900,
    height: 200,
    draw: (c, w, h) => {
      panel(c, w, h)
      exitBox(c, n, 40, 35, 130)
      text(c, '나가는 곳', 200, 80, 56)
      text(c, 'Exit', 200, 145, 40, '#e5e7eb', 500)
    },
  })),
  {
    id: 'station4',
    expect: ['x4_bot'],
    width: 1100,
    height: 180,
    draw: (c, w, h) => {
      panel(c, w, h)
      text(c, '군 자', 60, 80, 80)
      text(c, 'Gunja', 330, 70, 36, '#e5e7eb', 500)
      exitBox(c, 4, 860, 40, 100)
      text(c, '출입구', 975, 70, 30)
      text(c, 'Entrance', 975, 115, 24, '#e5e7eb', 500)
    },
  },
  ...(['5', '7'] as const).map<Sign>((l) => ({
    id: `board${l}`,
    expect: l === '5' ? ['gate_w', 'gate_e'] : ['gate_7'],
    width: 900,
    height: 180,
    draw: (c, w, h) => {
      panel(c, w, h)
      text(c, '타는 곳', 50, 75, 64)
      text(c, 'Platform', 50, 135, 32, '#e5e7eb', 500)
      lineCircle(c, l, 420, 90, 55)
      text(c, `${l}호선`, 500, 90, 56)
    },
  })),
  {
    id: 'transfer7',
    expect: ['p5_c'],
    width: 900,
    height: 180,
    draw: (c, w, h) => {
      panel(c, w, h)
      text(c, '갈아타는 곳', 50, 75, 60)
      text(c, 'Transfer', 50, 135, 32, '#e5e7eb', 500)
      lineCircle(c, '7', 520, 90, 55)
      text(c, '7호선', 600, 90, 56)
    },
  },
  ...([['중곡', 'Junggok', 'board7_e'], ['아차산', 'Achasan', 'board5_e'], ['장한평', 'Janghanpyeong', 'board5_w']] as const).map<Sign>(([ko, en, node]) => ({
    id: `dir_${en}`,
    expect: [node],
    width: 900,
    height: 180,
    draw: (c, w, h) => {
      panel(c, w, h)
      text(c, `${ko} 방면`, 50, 75, 64)
      text(c, en, 50, 135, 34, '#e5e7eb', 500)
    },
  })),
  {
    id: 'toilet',
    expect: ['toilet_w'],
    width: 700,
    height: 180,
    draw: (c, w, h) => {
      panel(c, w, h)
      text(c, '화장실', 50, 75, 64)
      text(c, 'Toilet', 50, 135, 34, '#e5e7eb', 500)
    },
  },
]

function copy(src: HTMLCanvasElement, w = src.width, h = src.height) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const VARIANTS: Variant[] = [
  { id: 'clean', ko: '깨끗함', apply: (s) => s },
  {
    id: 'blur',
    ko: '흐림(초점 2px)',
    apply: (s) => {
      const c = copy(s)
      const x = c.getContext('2d')!
      x.filter = 'blur(2px)'
      x.drawImage(s, 0, 0)
      return c
    },
  },
  {
    id: 'small',
    ko: '멀리서 찍음(35% 크기)',
    apply: (s) => {
      const c = copy(s, Math.round(s.width * 0.35), Math.round(s.height * 0.35))
      c.getContext('2d')!.drawImage(s, 0, 0, c.width, c.height)
      return c
    },
  },
  {
    id: 'tilt',
    ko: '기울어짐(7°)',
    apply: (s) => {
      const c = copy(s, s.width + 60, s.height + 120)
      const x = c.getContext('2d')!
      x.fillStyle = '#c7ccd3'
      x.fillRect(0, 0, c.width, c.height)
      x.translate(c.width / 2, c.height / 2)
      x.rotate((7 * Math.PI) / 180)
      x.drawImage(s, -s.width / 2, -s.height / 2)
      return c
    },
  },
  {
    id: 'lowlight',
    ko: '어두움·저대비',
    apply: (s) => {
      const c = copy(s)
      const x = c.getContext('2d')!
      x.filter = 'brightness(0.55) contrast(0.6)'
      x.drawImage(s, 0, 0)
      return c
    },
  },
  {
    id: 'noise',
    ko: '잡음+흐림(손떨림)',
    apply: (s) => {
      const c = copy(s)
      const x = c.getContext('2d')!
      x.filter = 'blur(1.2px)'
      x.drawImage(s, 0, 0)
      const img = x.getImageData(0, 0, c.width, c.height)
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
      for (let i = 0; i < img.data.length; i += 4) {
        const n = rnd() * 40
        img.data[i] += n
        img.data[i + 1] += n
        img.data[i + 2] += n
      }
      x.putImageData(img, 0, 0)
      return c
    },
  },
]

type Row = { sign: string; variant: string; text: string; top: string | null; confident: boolean; ask: string | null; outcome: 'auto' | 'confirm' | 'askNumber' | 'wrong' | 'none'; ms: number }

async function run() {
  const status = document.getElementById('status')!
  const table = document.getElementById('out') as HTMLTableElement
  table.innerHTML = '<tr><th>표지판</th><th>조건</th><th>이미지</th><th>읽은 글자</th><th>1순위</th><th>결과</th></tr>'
  const rows: Row[] = []
  let i = 0
  const total = SIGNS.length * VARIANTS.length
  for (const sign of SIGNS) {
    const base = document.createElement('canvas')
    base.width = sign.width
    base.height = sign.height
    sign.draw(base.getContext('2d')!, sign.width, sign.height)
    for (const v of VARIANTS) {
      status.textContent = `읽는 중 ${++i}/${total}`
      const canvas = v.apply(base)
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.85))
      const img = await loadImage(blob)
      const t0 = performance.now()
      // 사용자가 표지판만 감싸 지정한 상황 = 이미지 전체
      const textRead = await readSign(img, { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight })
      const ms = Math.round(performance.now() - t0)
      const m = matchSignText(textRead)
      const top = m.candidates[0]?.nodeId ?? null
      const inCands = m.candidates.some((c) => sign.expect.includes(c.nodeId))
      const isExit = sign.expect.some((e) => /^x\d_bot$/.test(e))
      let outcome: Row['outcome']
      if (m.confident && top && sign.expect.includes(top)) outcome = 'auto'
      else if (m.confident && top) outcome = 'wrong'
      else if (inCands) outcome = 'confirm'
      else if (m.ask === 'exitNumber' && isExit) outcome = 'askNumber'
      else outcome = 'none'
      rows.push({ sign: sign.id, variant: v.id, text: textRead.replace(/\s+/g, ' ').trim(), top, confident: m.confident, ask: m.ask ?? null, outcome, ms })
      const cls = { auto: 'ok', confirm: 'ok', askNumber: 'ask', wrong: 'bad', none: 'none' }[outcome]
      const tr = table.insertRow()
      tr.className = cls
      tr.innerHTML = `<td>${sign.id}</td><td>${v.ko}</td><td><img src="${canvas.toDataURL('image/jpeg', 0.6)}"></td><td>${rows.at(-1)!.text.slice(0, 80)}</td><td>${top ?? '—'}${m.confident ? ' ✔' : ''}</td><td>${outcome}</td>`
    }
  }
  const count = (o: Row['outcome']) => rows.filter((r) => r.outcome === o).length
  const byVariant = Object.fromEntries(
    VARIANTS.map((v) => {
      const rs = rows.filter((r) => r.variant === v.id)
      return [v.id, { useful: rs.filter((r) => r.outcome === 'auto' || r.outcome === 'confirm' || r.outcome === 'askNumber').length, total: rs.length, wrong: rs.filter((r) => r.outcome === 'wrong').length }]
    }),
  )
  const summary = {
    total: rows.length,
    auto: count('auto'),
    confirmInCandidates: count('confirm'),
    askNumber: count('askNumber'),
    wrongConfident: count('wrong'),
    nothing: count('none'),
    avgMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
    byVariant,
  }
  document.getElementById('summary')!.textContent = JSON.stringify(summary, null, 2)
  status.textContent = '완료'
  ;(window as unknown as { __evalResult: unknown }).__evalResult = { summary, rows }
}

run()
