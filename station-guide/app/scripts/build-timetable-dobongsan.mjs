// 서울교통공사 사이버스테이션의 도봉산역(7호선, 역코드 2712) 열차시간표를 src/data/timetable-dobongsan.json으로 저장한다.
// 1호선(코레일)은 사이버스테이션 시간표가 없어 넣지 않는다(화면에는 "시간표 없음").
// 실행: npm run build:timetable:dobongsan   (build-timetable.mjs와 같은 방식)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// inouttag 1=상행(장암 방면), 2=하행(석남·온수 방면 = 수락산 방면)
const STATIONS = { 2712: { 1: 'board7_jangam', 2: 'board7_suraksan' } }
const DAYS = { 1: 'weekday', 2: 'saturday', 3: 'holiday' }

const out = { source: '서울교통공사 사이버스테이션 열차시간표 (출발 기준, 도봉산 7호선)', fetchedAt: new Date().toISOString(), days: {} }
for (const [code, dirs] of Object.entries(STATIONS)) {
  const res = await fetch(`http://www.seoulmetro.co.kr/kr/getStationInfo.do?action=time&stationId=${code}`)
  if (!res.ok) throw new Error(`timetable ${code}: ${res.status}`)
  const html = await res.text()
  const re = /time="(\d+)"\s+week="(\d)"[^>]*?inouttag="(\d)"\s*>\s*(\d+)분\s*\(([^&<]+?)\s*&gt;\s*([^)<]+?)\)/g
  let n = 0
  for (const m of html.matchAll(re)) {
    const [, hour, week, inout, min, , dest] = m
    const day = DAYS[week]
    const boarding = dirs[inout]
    if (!day || !boarding) continue
    ;((out.days[day] ??= {})[boarding] ??= []).push(`${hour.padStart(2, '0')}:${min.padStart(2, '0')}|${dest.trim()}`)
    n++
  }
  console.log(`station ${code}: ${n} departures`)
}
const key = (s) => {
  const [h, m] = s.split('|')[0].split(':').map(Number)
  return (h < 4 ? h + 24 : h) * 60 + m
}
for (const day of Object.values(out.days)) for (const list of Object.values(day)) list.sort((a, b) => key(a) - key(b))

const file = fileURLToPath(new URL('../src/data/timetable-dobongsan.json', import.meta.url))
writeFileSync(file, JSON.stringify(out) + '\n')
for (const [d, v] of Object.entries(out.days)) console.log(d, Object.fromEntries(Object.entries(v).map(([b, l]) => [b, l.length])))
