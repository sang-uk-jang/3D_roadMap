// 서울교통공사 사이버스테이션의 군자역 열차시간표를 src/data/timetable.json으로 저장한다.
// 실시간 도착정보 키가 없을 때 "다음 열차(시간표 기준)"를 보여주기 위한 데이터.
// 실행: npm run build:timetable
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 역 코드 → 방향(inouttag 1=상행, 2=하행)별 탑승 지점
const STATIONS = {
  2545: { 1: 'board5_w', 2: 'board5_e' }, // 5호선: 상행=방화(장한평 방면), 하행=하남·마천(아차산 방면)
  2727: { 1: 'board7_e', 2: 'board7_w' }, // 7호선: 상행=장암(중곡 방면), 하행=석남(어린이대공원 방면)
}
const DAYS = { 1: 'weekday', 2: 'saturday', 3: 'holiday' }

const out = { source: '서울교통공사 사이버스테이션 열차시간표 (출발 기준)', fetchedAt: new Date().toISOString(), days: {} }
for (const [code, dirs] of Object.entries(STATIONS)) {
  const res = await fetch(`http://www.seoulmetro.co.kr/kr/getStationInfo.do?action=time&stationId=${code}`)
  if (!res.ok) throw new Error(`timetable ${code}: ${res.status}`)
  const html = await res.text()
  // 예: time="05" week="1" train-no="5008" line="05호선" inouttag="1" >32분 (군자 &gt; 방화)
  const re = /time="(\d+)"\s+week="(\d)"[^>]*?inouttag="(\d)"\s*>\s*(\d+)분\s*\(([^&<]+?)\s*&gt;\s*([^)<]+?)\)/g
  let n = 0
  for (const m of html.matchAll(re)) {
    const [, hour, week, inout, min, , dest] = m
    const day = DAYS[week]
    const boarding = dirs[inout]
    if (!day || !boarding) continue
    const list = ((out.days[day] ??= {})[boarding] ??= [])
    list.push(`${hour.padStart(2, '0')}:${min.padStart(2, '0')}|${dest.trim()}`)
    n++
  }
  console.log(`station ${code}: ${n} departures`)
}
// 새벽(00~03시)은 하루의 끝으로 정렬
const key = (s) => {
  const [h, m] = s.split('|')[0].split(':').map(Number)
  return (h < 4 ? h + 24 : h) * 60 + m
}
for (const day of Object.values(out.days)) for (const list of Object.values(day)) list.sort((a, b) => key(a) - key(b))

const file = fileURLToPath(new URL('../src/data/timetable.json', import.meta.url))
writeFileSync(file, JSON.stringify(out) + '\n')
for (const [d, v] of Object.entries(out.days)) console.log(d, Object.fromEntries(Object.entries(v).map(([b, l]) => [b, l.length])))
