// 두 역 사이 열차 소요 시간(분)을 사이버스테이션 시간표의 열차번호로 맞춰 잰다 → src/data/runtimes.json
// 같은 요일·열차번호·방향(inouttag)인 열차가 두 역에서 출발하는 시각 차이의 중앙값.
// (도착역이 종착인 열차는 도착역 출발 기록이 없어 빠진다. 중앙값은 지나가는 열차 기준)
// 실행: npm run build:runtimes
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// from/to: 사이버스테이션 역코드, inout: 방향. boarding/alight: 앱의 타는 곳·내리는 곳 id
const LINKS = [
  { id: 'gunja-dobongsan', from: 2727, to: 2712, inout: '1', boarding: 'board7_e', alight: 'board7_jangam' }, // 7호선 상행(장암 방면)
  { id: 'dobongsan-gunja', from: 2712, to: 2727, inout: '2', boarding: 'board7_suraksan', alight: 'board7_w' }, // 7호선 하행
]

const re = /time="(\d+)"\s+week="(\d)"\s+train-no="([^"]+)"[^>]*?inouttag="(\d)"\s*>\s*(\d+)분/g
const cache = new Map()
async function table(code) {
  if (cache.has(code)) return cache.get(code)
  const res = await fetch(`http://www.seoulmetro.co.kr/kr/getStationInfo.do?action=time&stationId=${code}`)
  if (!res.ok) throw new Error(`timetable ${code}: ${res.status}`)
  const m = new Map()
  for (const [, h, week, no, io, min] of (await res.text()).matchAll(re)) m.set(`${week}|${no}|${io}`, (+h < 4 ? +h + 24 : +h) * 60 + +min)
  cache.set(code, m)
  return m
}

const out = { source: '서울교통공사 사이버스테이션 열차시간표, 열차번호로 두 역 출발 시각 비교', fetchedAt: new Date().toISOString(), links: {} }
for (const l of LINKS) {
  const a = await table(l.from)
  const b = await table(l.to)
  const diffs = []
  for (const [k, t] of a) {
    if (!k.endsWith(`|${l.inout}`)) continue
    const u = b.get(k)
    if (u != null && u > t) diffs.push(u - t)
  }
  diffs.sort((x, y) => x - y)
  if (diffs.length === 0) throw new Error(`no matching trains for ${l.id}`)
  out.links[l.id] = { boarding: l.boarding, alight: l.alight, minutes: diffs[diffs.length >> 1], min: diffs[0], max: diffs.at(-1), trains: diffs.length }
  console.log(l.id, out.links[l.id])
}
writeFileSync(fileURLToPath(new URL('../src/data/runtimes.json', import.meta.url)), JSON.stringify(out, null, 1) + '\n')
