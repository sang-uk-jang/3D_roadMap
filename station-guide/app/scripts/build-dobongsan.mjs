// 도봉산역(1·7호선) 역 구조 데이터(src/data/dobongsan.json) 생성 스크립트.
// 실행: npm run build:data:dobongsan
//
// 근거 자료 (data/raw/dobongsan/)
// - 서울교통공사 역 이용 및 비상대피 안내도 in_2712.jpg (7호선 역코드 2712, 역번호 710): 단면도(7호선 축) + 3D 그림
// - 서울교통공사_역사심도정보_20250814: 7호선 고가, 상대식, 정거장깊이 -6.35m(= 지면 위 6.35m)
// - 서울교통공사_역사건축정보_20251231: 7호선 승강장 165m, 상대식, 2F
// - 서울교통공사_역사면적정보: 7호선 승강장 2344.7㎡ → 한쪽 승강장 폭 약 7m
// - 편의시설위치정보 API (stnNm=도봉산): 엘리베이터 5대(외부1·2·5, 내부3·4), 에스컬레이터 0대
// - 국가철도공단_서울교통공사_환승정보_20260630: 7→1 빠른 문 1-1, 8-4 (1→7은 코레일 구간이라 없음)
//
// 1호선 구간은 한국철도공사(코레일) 운영이라 위 공공데이터(심도·건축·면적·편의시설 API·환승정보)에 없다.
// 1호선 승강장·대합실은 안내도 3D 그림만 보고 근사로 채웠다(아래 '1호선 (근사)' 주석).
//
// 좌표계: x = 장암·망월사 쪽(-) / 수락산·도봉 쪽(+) (두 노선이 나란히 달린다), z = 7호선 쪽(-) / 1호선 쪽(+).
// 단면도 축척: 7호선 승강장 165m를 단면도 2층 띠 폭(2545px)에 맞춰 약 0.065m/px. 그러나 단면도의 계단 위치는
// 3D 그림·환승정보(1-1, 8-4 = 승강장 양 끝)와 20~30m 어긋나 계단은 3D 그림·환승정보를 따랐다(결과 문서에 기록).

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FLOORS = [
  { id: 'F1', label: { ko: '지상1층 (7호선 대합실 · 1호선 승강장)', en: '1F (Line 7 concourse · Line 1 platform)' }, y: 0 },
  { id: 'F2', label: { ko: '지상2층 (7호선 승강장 · 1호선 대합실)', en: '2F (Line 7 platforms · Line 1 concourse)' }, y: 6.35 },
]
const Y = Object.fromEntries(FLOORS.map((f) => [f.id, f.y]))
/** 수평거리 / 높이차 */
const SLOPE = { stairs: 1.7, escalator: 1.75 }
const WIDTH = { stairs: 3, escalator: 2.4 }

const L = (ko, en) => ({ ko, en })
const rect = (x1, z1, x2, z2) => [[x1, z1], [x2, z1], [x2, z2], [x1, z2]]
const round = (v) => Math.round(v * 100) / 100

const areas = []
const nodes = []
const edges = []

const area = (id, floor, kind, label, polygon, line) =>
  areas.push({ id, floor, kind, label, polygon, ...(line ? { line } : {}) })
const node = (id, type, floor, pos, label, extra = {}) => {
  nodes.push({ id, type, floor, pos: pos.map(round), label, ...extra })
  return id
}
const walk = (...ids) => {
  for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1], kind: 'walk' })
}

/**
 * 층 연결 계단. 위 입구(top)에서 dir 방향으로 내려가 아래 입구 노드를 만든다.
 * top이 문자열이면 기존 노드를 위 입구로 쓴다. bottom을 주면 그 id·type으로 아래 입구를 만든다(지상 출구 등).
 */
function connector({ id, kind, top, bottomFloor, dir, label, refs, bottom }) {
  let topId, topFloor, topPos
  if (typeof top === 'string') {
    const n = nodes.find((x) => x.id === top)
    ;[topId, topFloor, topPos] = [n.id, n.floor, n.pos]
  } else {
    topId = node(`${id}_top`, 'landing', top.floor, top.pos, L(`${label.ko} (위)`, `${label.en} (top)`))
    ;[topFloor, topPos] = [top.floor, top.pos]
  }
  const run = (Y[topFloor] - Y[bottomFloor]) * SLOPE[kind]
  const bottomPos = [topPos[0] + dir[0] * run, topPos[1] + dir[1] * run]
  const bottomId = bottom
    ? node(bottom.id, bottom.type, bottomFloor, bottomPos, bottom.label)
    : node(`${id}_bot`, 'landing', bottomFloor, bottomPos, L(`${label.ko} (아래)`, `${label.en} (bottom)`))
  edges.push({ from: topId, to: bottomId, kind, width: WIDTH[kind], ...(refs ? { facilityRefs: refs } : {}) })
  return { top: topId, bottom: bottomId }
}

/** 엘리베이터. 층마다 같은 평면 좌표에 노드. press: 층별 버튼 이름(API 층 표기) */
function elevator({ id, pos, floors, label, refs = [], press }) {
  const ids = floors.map((f) =>
    node(`${id}_${f}`, 'elevator', f, pos, label, { ...(refs[0] ? { facilityRef: refs[0] } : {}), ...(press?.[f] ? { press: press[f] } : {}) }),
  )
  for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1], kind: 'elevator', ...(refs.length ? { facilityRefs: refs } : {}) })
  return Object.fromEntries(floors.map((f, i) => [f, ids[i]]))
}

// ═════════════ 7호선 (서울교통공사) ═════════════
// 고가 상대식 승강장(지상2층) 165m, 한쪽 폭 7m. 오른쪽 통행: 장암 방면(-x로 감)은 z<0 쪽 승강장, 수락산 방면은 z>0 쪽.
area('p7n', 'F2', 'platform', L('7호선 장암 방면 승강장', 'Line 7 platform to Jangam'), rect(-82.5, -11, 82.5, -4), '7')
area('t7', 'F2', 'track', L('7호선 선로', 'Line 7 tracks'), rect(-82.5, -4, 82.5, 4))
area('p7s', 'F2', 'platform', L('7호선 수락산 방면 승강장', 'Line 7 platform to Suraksan'), rect(-82.5, 4, 82.5, 11), '7')

// 지상1층(승강장 아래) 대합실: 단면도 1층 띠. 가운데(x 16~26)는 단면도에서 끊겨 있고 그 옆에 2번 출구가 있다.
// 개찰구 밖과 안: 출구(2번, 1-1번)가 닿는 곳이 개찰구 밖. 승강장 양 끝 계단이 내려오는 곳(양 끝)이 개찰구 안.
// 개찰구 위치는 안내도에 그려져 있지 않아 추정.
area('hall7', 'F1', 'concourse', L('7호선 대합실 (2번 출구 쪽)', 'Line 7 concourse (Exit 2 side)'), rect(16, -11, 66, 11))
area('paid7w', 'F1', 'paid', L('7호선 개찰구 안 (장암 쪽 · 1호선 갈아타는 곳)', 'Line 7 paid area (Jangam side · transfer to Line 1)'), rect(-96, -11, 16, 11))
area('paid7e', 'F1', 'paid', L('7호선 개찰구 안 (수락산 쪽)', 'Line 7 paid area (Suraksan side)'), rect(66, -11, 90, 11))
area('lobby11', 'F1', 'concourse', L('1-1번 출구 앞 대합실', 'Exit 1-1 hall'), rect(-114, -11, -96, 11))
area('plaza2', 'F1', 'concourse', L('2번 출구 앞 (1호선 대합실 아래)', 'Exit 2 forecourt (under Line 1 concourse)'), rect(16, 11, 66, 22))
// 1-1번 출구는 단면도에서 지상2층 높이(언덕 쪽 길)에 있다. 계단은 서쪽 위 → 동쪽 아래(지상1층 대합실)로 내려간다.
area('street11', 'F2', 'ground', L('1-1번 출구 앞 길', 'Street at Exit 1-1'), rect(-120, -12, -97, 10))

// ───── 승강장 계단: 환승정보 빠른 문 1-1·8-4(승강장 양 끝)와 3D 그림(양 끝에서 바깥쪽으로 내려감) ─────
// 편의시설 API에 7호선 에스컬레이터는 없다 → 모두 계단.
const st7nw = connector({ id: 'st7nw', kind: 'stairs', top: { floor: 'F2', pos: [-76, -7.5] }, bottomFloor: 'F1', dir: [-1, 0], label: L('장암 방면 승강장 계단 (장암 쪽 끝)', 'Stairs, Jangam-bound platform (west end)') })
const st7sw = connector({ id: 'st7sw', kind: 'stairs', top: { floor: 'F2', pos: [-76, 7.5] }, bottomFloor: 'F1', dir: [-1, 0], label: L('수락산 방면 승강장 계단 (장암 쪽 끝)', 'Stairs, Suraksan-bound platform (west end)') })
const st7ne = connector({ id: 'st7ne', kind: 'stairs', top: { floor: 'F2', pos: [76, -7.5] }, bottomFloor: 'F1', dir: [1, 0], label: L('장암 방면 승강장 계단 (수락산 쪽 끝)', 'Stairs, Jangam-bound platform (east end)') })
const st7se = connector({ id: 'st7se', kind: 'stairs', top: { floor: 'F2', pos: [76, 7.5] }, bottomFloor: 'F1', dir: [1, 0], label: L('수락산 방면 승강장 계단 (수락산 쪽 끝)', 'Stairs, Suraksan-bound platform (east end)') })

// ───── 엘리베이터: API dtlPstn 칸-문 번호를 문 위치 모델로 환산(8칸·20m·승강장 가운데 정차) ─────
// 장암 방면(앞 = x -80): 문 위치 x = -80 + s, 수락산 방면(앞 = x 80): x = 80 - s, s = (칸-1)·20 + [2.5, 7.5, 12.5, 17.5]
// 내부3 "장암 방면3-4" → x -22.5 / 내부4 "수락산 방면4-2" → x 12.5 / 외부1 "장암 방면7-2" → x 47.5 / 외부2 "수락산 방면1-4" → x 62.5
// API 층 표기: 1 → 2 (지상1층 ↔ 지상2층)
const P12 = { F1: '1', F2: '2' }
const el3 = elevator({ id: 'el3', pos: [-22.5, -7.5], floors: ['F1', 'F2'], label: L('엘리베이터 (내부3, 장암 방면 3-4)', 'Elevator 3 (Jangam-bound, door 3-4)'), refs: ['1311282'], press: P12 })
const el4 = elevator({ id: 'el4', pos: [12.5, 7.5], floors: ['F1', 'F2'], label: L('엘리베이터 (내부4, 수락산 방면 4-2)', 'Elevator 4 (Suraksan-bound, door 4-2)'), refs: ['1311283'], press: P12 })
// 외부1·2는 '외부'(2번 출구) 엘리베이터 → 대합실 개찰구 밖에 내린다. 앞에 교통약자용 개찰구를 둔다(위치 추정).
const elE1 = elevator({ id: 'elx1', pos: [47.5, -7.5], floors: ['F1', 'F2'], label: L('엘리베이터 (외부1, 장암 방면 7-2)', 'Elevator (Exit 2 side, Jangam-bound 7-2)'), refs: ['1311280'], press: P12 })
const elE2 = elevator({ id: 'elx2', pos: [62.5, 7.5], floors: ['F1', 'F2'], label: L('엘리베이터 (외부2, 수락산 방면 1-4)', 'Elevator (Exit 2 side, Suraksan-bound 1-4)'), refs: ['1311281'], press: P12 })
const gateL1 = node('gate_lift1', 'gate', 'F1', [47.5, -3], L('엘리베이터 앞 개찰구 (장암 방면)', 'Gate at elevator (Jangam-bound)'))
const gateL2 = node('gate_lift2', 'gate', 'F1', [62.5, 3], L('엘리베이터 앞 개찰구 (수락산 방면)', 'Gate at elevator (Suraksan-bound)'))
walk(gateL1, elE1.F1)
walk(gateL2, elE2.F1)

// ───── 대합실 시설과 개찰구 ─────
const gate7w = node('gate_7w', 'gate', 'F1', [16, 0], L('7호선 개찰구 (장암 쪽 · 1호선 갈아타는 곳 방향)', 'Line 7 gates (Jangam side)'))
const gate7e = node('gate_7e', 'gate', 'F1', [66, 0], L('7호선 개찰구 (수락산 쪽)', 'Line 7 gates (Suraksan side)'))
const gate11 = node('gate_11', 'gate', 'F1', [-96, -2], L('7호선 개찰구 (1-1번 출구 쪽)', 'Line 7 gates (Exit 1-1)'))
// 안내도 단면도: 표 사는 곳(카드 아이콘)은 1-1번 출구 쪽과 2번 출구 쪽, 화장실은 장암 쪽(개찰구 안)과 2번 출구 쪽, 고객안전실은 수락산 쪽 끝
node('ticket_7e', 'ticket', 'F1', [40, 6], L('승차권 발매기 · 교통카드 충전기 (2번 출구 쪽)', 'Ticket machine (Exit 2 side)'))
node('ticket_11', 'ticket', 'F1', [-102, 8], L('승차권 발매기 · 교통카드 충전기 (1-1번 출구 쪽)', 'Ticket machine (Exit 1-1 side)'))
node('toilet_7e', 'toilet', 'F1', [32, -8], L('화장실 (2번 출구 쪽)', 'Toilet (Exit 2 side)'))
node('toilet_7w', 'toilet', 'F1', [-50, 0], L('화장실 (개찰구 안, 장암 쪽)', 'Toilet (paid area, Jangam side)'))
node('info7', 'info', 'F1', [72, 0], L('7호선 고객안전실', 'Line 7 information'))

// ───── 1-1번 출구 (단면도: 지상2층 높이 출구에서 지상1층 대합실로 내려가는 계단 + 엘리베이터) ─────
// 외부5 API 층 표기 B1 → 1: 출구 쪽 길이 1층, 대합실이 B1로 표기된다. 3D 그림은 승강장에서 바로 오르는 것처럼 그려져 단면도와 다르다(추정).
const exit11 = node('exit1-1', 'exit', 'F2', [-110.8, -6], L('1-1번 출구', 'Exit 1-1'))
const x11 = connector({ id: 'x11', kind: 'stairs', top: exit11, bottomFloor: 'F1', dir: [1, 0], label: L('1-1번 출구 계단', 'Exit 1-1 stairs') })
const el11 = elevator({ id: 'el_x11', pos: [-112.5, 4], floors: ['F1', 'F2'], label: L('1-1번 출구 엘리베이터 (외부5)', 'Exit 1-1 elevator'), refs: ['1620269'], press: { F1: 'B1', F2: '1' } })
walk(el11.F2, exit11)

// ═════════════ 1호선 (한국철도공사, 근사) ═════════════
// 자료: 안내도 3D 그림만 있음(심도·건축·편의시설 API·환승정보 없음).
// - 승강장: 지상1층, 그림에는 섬식 1면만 그려져 있다. 10칸(20m) 열차 기준 210m로 가정. 7호선과 나란히, 1호선 쪽(z+)에 둔다.
//   그림에서 서쪽 끝은 7호선 서쪽 끝보다 서쪽, 동쪽 끝은 대합실 다리 바로 너머 → x -150 ~ 60.
// - 왼쪽 통행(코레일): 도봉 방면(+x로 감)은 북쪽(z 41~46) 선로, 망월사 방면은 남쪽(z 56~61) 선로.
// - 대합실(지상2층)은 선로 위를 가로지르는 다리. 그림의 개찰구 줄은 다리 길이 방향(가운데)에 있어 승강장 쪽 절반이 개찰구 안.
// - 그림의 승강장 에스컬레이터·1·3번 출구 에스컬레이터는 편의시설 API에 없어 계단으로 넣었다(규칙 7).
// - 다리의 높이는 7호선 승강장과 같은 지상2층(6.35m)으로 근사.
area('p1', 'F1', 'platform', L('1호선 승강장', 'Line 1 platform'), rect(-150, 46, 60, 56), '1')
area('t1n', 'F1', 'track', L('1호선 선로 (도봉 방면)', 'Line 1 track (to Dobong)'), rect(-150, 41, 60, 46))
area('t1s', 'F1', 'track', L('1호선 선로 (망월사 방면)', 'Line 1 track (to Mangwolsa)'), rect(-150, 56, 60, 61))
// 7호선 → 1호선 환승통로: 3D 그림의 초록 점선(7호선 장암 쪽 끝 계단 → 비스듬한 긴 통로 → 1호선 승강장 망월사 쪽 끝).
// 그림의 1호선 승강장 서쪽 끝은 7호선 서쪽 끝보다 더 서쪽이라 통로를 ㄱ자 직사각형 셋으로 근사했다.
area('xfer', 'F1', 'paid', L('1호선 갈아타는 통로', 'Transfer passage to Line 1'), rect(-96, 11, -88, 30))
area('xfer2', 'F1', 'paid', L('1호선 갈아타는 통로', 'Transfer passage to Line 1'), rect(-160, 30, -88, 38))
area('xfer3', 'F1', 'paid', L('1호선 갈아타는 통로 (승강장 끝)', 'Transfer passage (platform end)'), rect(-160, 38, -150, 51))
const xferP1 = node('xfer_p1', 'junction', 'F1', [-150, 48.5], L('1호선 승강장 망월사 쪽 끝', 'Line 1 platform (Mangwolsa end)'))

area('c1_free', 'F2', 'concourse', L('1호선 대합실 (개찰구 밖, 1·2·3번 출구 통로)', 'Line 1 concourse (unpaid, Exits 1–3)'), rect(31, 12, 44, 72))
area('c1_paid', 'F2', 'paid', L('1호선 개찰구 안', 'Line 1 paid area'), rect(20, 28, 31, 68))
node('gate_1', 'gate', 'F2', [31, 48], L('1호선 개찰구', 'Line 1 gates'))
node('ticket_1', 'ticket', 'F2', [40, 44], L('승차권 발매기 (1호선 대합실)', 'Ticket machine (Line 1 concourse)'))

// 다리 → 1호선 승강장: 계단 2곳(승강장 길이 방향으로 내려감) + 엘리베이터
connector({ id: 'st1a', kind: 'stairs', top: { floor: 'F2', pos: [24, 49] }, bottomFloor: 'F1', dir: [-1, 0], label: L('1호선 승강장 계단 (도봉 방면 쪽)', 'Stairs to Line 1 platform (north)') })
connector({ id: 'st1b', kind: 'stairs', top: { floor: 'F2', pos: [24, 53] }, bottomFloor: 'F1', dir: [-1, 0], label: L('1호선 승강장 계단 (망월사 방면 쪽)', 'Stairs to Line 1 platform (south)') })
elevator({ id: 'el1', pos: [28, 51], floors: ['F1', 'F2'], label: L('1호선 승강장 엘리베이터', 'Line 1 platform elevator'), press: P12 })

// 출구 1·3(다리 끝에서 길로 내려감), 2(다리 북쪽 끝 아래 지상1층)
const x1 = connector({ id: 'x1', kind: 'stairs', top: { floor: 'F2', pos: [37, 70] }, bottomFloor: 'F1', dir: [0, 1], label: L('1번 출구 계단', 'Exit 1 stairs') })
const exit1 = node('exit1', 'exit', 'F1', [39.5, 86], L('1번 출구', 'Exit 1'))
walk(x1.bottom, exit1)
const elX1 = elevator({ id: 'el_x1', pos: [42.5, 70.5], floors: ['F1', 'F2'], label: L('1번 출구 엘리베이터', 'Exit 1 elevator'), press: P12 })
walk(elX1.F1, exit1)

const x3 = connector({ id: 'x3', kind: 'stairs', top: { floor: 'F2', pos: [43, 26] }, bottomFloor: 'F1', dir: [1, 0], label: L('3번 출구 계단', 'Exit 3 stairs') })
const exit3 = node('exit3', 'exit', 'F1', [58, 30.5], L('3번 출구', 'Exit 3'))
walk(x3.bottom, exit3)
const elX3 = elevator({ id: 'el_x3', pos: [41, 31], floors: ['F1', 'F2'], label: L('3번 출구 엘리베이터', 'Exit 3 elevator'), press: P12 })
walk(elX3.F1, exit3)

// 다리 북쪽 끝 ↔ 2번 출구 앞(지상1층): 계단 + 엘리베이터(3D 그림의 '2' 옆 기둥)
connector({ id: 'st2', kind: 'stairs', top: { floor: 'F2', pos: [40, 17] }, bottomFloor: 'F1', dir: [1, 0], label: L('1호선 대합실 계단 (2번 출구 쪽)', 'Stairs to Line 1 concourse (Exit 2)') })
elevator({ id: 'el_2', pos: [34, 14], floors: ['F1', 'F2'], label: L('1호선 대합실 엘리베이터 (2번 출구 쪽)', 'Line 1 concourse elevator (Exit 2)'), press: P12 })
node('exit2', 'exit', 'F1', [24, 20], L('2번 출구', 'Exit 2'))

// ───── 타는 곳: 계단을 올라온(내려온) 쪽에서 앞으로 걸어가면 닿는 곳(승강장 가운데) ─────
node('board7_jangam', 'boarding', 'F2', [0, -9], L('7호선 장암 방면 타는 곳', 'Line 7 to Jangam'), { line: '7', direction: L('장암 방면', 'to Jangam') })
node('board7_suraksan', 'boarding', 'F2', [0, 9], L('7호선 수락산 방면 타는 곳', 'Line 7 to Suraksan'), { line: '7', direction: L('수락산 방면', 'to Suraksan') })
// 1호선: 환승통로(망월사 쪽 끝, x -150)와 다리 계단(x 12) 사이. 어느 쪽에서 와도 앞으로 걸어 닿는다
node('board1_dobong', 'boarding', 'F1', [-70, 48], L('1호선 도봉 방면 타는 곳', 'Line 1 to Dobong'), { line: '1', direction: L('도봉 방면', 'to Dobong') })
node('board1_mangwolsa', 'boarding', 'F1', [-70, 54], L('1호선 망월사 방면 타는 곳', 'Line 1 to Mangwolsa'), { line: '1', direction: L('망월사 방면', 'to Mangwolsa') })
// 승강장 가운데 확인 지점: 165m 승강장을 끝에서 끝까지 걸을 때 중간에서 단계를 끊는다(한 단계 150m 이하)
node('p7n_mid', 'junction', 'F2', [0, -6.5], L('7호선 장암 방면 승강장 가운데', 'Middle of Jangam-bound platform'))
node('p7s_mid', 'junction', 'F2', [0, 6.5], L('7호선 수락산 방면 승강장 가운데', 'Middle of Suraksan-bound platform'))
node('p1_mid', 'junction', 'F1', [-70, 51], L('1호선 승강장 가운데', 'Middle of Line 1 platform'))
node('p7w_mid', 'junction', 'F1', [-40, 0], L('7호선 개찰구 안 대합실 가운데', 'Line 7 paid concourse (middle)'))
node('sign_map_p7', 'sign', 'F2', [-30, -9.5], L('역 이용 및 비상대피 안내도 (현위치)', 'Station & evacuation map (You are here)'))
void [st7nw, st7sw, st7ne, st7se, el3, el4, gate7w, gate7e, gate11, xferP1]

// ═════════════ 트인 공간에서 곧장 걷기 (build-gunja.mjs와 같은 규칙) ═════════════
{
  const OPEN = new Set(['concourse', 'paid', 'passage', 'platform'])
  const MAX_OPEN_EDGE = 100
  const rectOf = (poly) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), z0: Math.min(...poly.map((p) => p[1])), z1: Math.max(...poly.map((p) => p[1])) })
  const inside = (r, [x, z]) => x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const obstacles = new Map()
  const addObs = (floor, r, owner) => obstacles.set(floor, [...(obstacles.get(floor) ?? []), { rect: r, owner }])
  for (const e of edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    const h = WIDTH[e.kind] / 2 + 0.3
    const alongX = Math.abs(b.pos[0] - a.pos[0]) >= Math.abs(b.pos[1] - a.pos[1])
    const r = alongX
      ? { x0: Math.min(a.pos[0], b.pos[0]), x1: Math.max(a.pos[0], b.pos[0]), z0: a.pos[1] - h, z1: a.pos[1] + h }
      : { x0: a.pos[0] - h, x1: a.pos[0] + h, z0: Math.min(a.pos[1], b.pos[1]), z1: Math.max(a.pos[1], b.pos[1]) }
    for (const f of new Set([a.floor, b.floor])) addObs(f, r, null)
  }
  for (const n of nodes) if (n.type === 'elevator') addObs(n.floor, { x0: n.pos[0] - 1.4, x1: n.pos[0] + 1.4, z0: n.pos[1] - 1.4, z1: n.pos[1] + 1.4 }, n.id)
  const crosses = ([ax, az], [bx, bz], r) => {
    const s = { x0: r.x0 + 0.05, x1: r.x1 - 0.05, z0: r.z0 + 0.05, z1: r.z1 - 0.05 }
    const dx = bx - ax
    const dz = bz - az
    let t0 = 0
    let t1 = 1
    for (const [p, q] of [[-dx, ax - s.x0], [dx, s.x1 - ax], [-dz, az - s.z0], [dz, s.z1 - az]]) {
      if (p === 0) {
        if (q < 0) return false
      } else {
        const t = q / p
        if (p < 0) t0 = Math.max(t0, t)
        else t1 = Math.min(t1, t)
      }
    }
    return t1 > t0 && (t1 - t0) * Math.hypot(dx, dz) > 0.2
  }
  const openRects = areas.filter((ar) => OPEN.has(ar.kind)).map((ar) => ({ floor: ar.floor, r: rectOf(ar.polygon) }))
  const strictlyIn = (r, [x, z], m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m
  let waypoints = 0
  for (const [floor, list] of obstacles) {
    list.forEach((o, k) => {
      const g = 0.6
      const corners = [[o.rect.x0 - g, o.rect.z0 - g], [o.rect.x1 + g, o.rect.z0 - g], [o.rect.x0 - g, o.rect.z1 + g], [o.rect.x1 + g, o.rect.z1 + g]]
      corners.forEach((c, ci) => {
        const pos = c.map(round)
        if (!openRects.some((a) => a.floor === floor && strictlyIn(a.r, pos, -0.3))) return
        if (list.some((q) => strictlyIn(q.rect, pos, 0.3))) return
        node(`wp_${floor}_${k}_${ci}`, 'waypoint', floor, pos, L('통로', 'Walkway'))
        waypoints++
      })
    })
  }
  console.log(`waypoints: +${waypoints}`)

  // 맞닿은 두 트인 구역 사이 연결점. 개찰구가 있는 층에서 개찰구 안(paid)과 밖이 맞닿은 곳에는 만들지 않는다.
  const gateFloors = new Set(nodes.filter((n) => n.type === 'gate').map((n) => n.floor))
  let portals = 0
  const open = areas.filter((ar) => OPEN.has(ar.kind))
  for (let i = 0; i < open.length; i++)
    for (let j = i + 1; j < open.length; j++) {
      const [A, B] = [open[i], open[j]]
      if (A.floor !== B.floor) continue
      if (gateFloors.has(A.floor) && (A.kind === 'paid') !== (B.kind === 'paid')) continue
      const ra = rectOf(A.polygon)
      const rb = rectOf(B.polygon)
      const x0 = Math.max(ra.x0, rb.x0)
      const x1 = Math.min(ra.x1, rb.x1)
      const z0 = Math.max(ra.z0, rb.z0)
      const z1 = Math.min(ra.z1, rb.z1)
      if (x1 < x0 - 0.01 || z1 < z0 - 0.01) continue
      if (Math.max(x1 - x0, z1 - z0) < 2) continue
      if (nodes.some((n) => n.floor === A.floor && inside(ra, n.pos) && inside(rb, n.pos))) continue
      const small = (ra.x1 - ra.x0) * (ra.z1 - ra.z0) <= (rb.x1 - rb.x0) * (rb.z1 - rb.z0) ? A : B
      const along = x1 - x0 >= z1 - z0
      const len = along ? x1 - x0 : z1 - z0
      const ts = len > 20 ? [1.5, len / 2, len - 1.5] : [len / 2]
      ts.forEach((t, k) => {
        const pos = along ? [x0 + t, (z0 + z1) / 2] : [(x0 + x1) / 2, z0 + t]
        node(`portal_${A.id}_${B.id}${ts.length > 1 ? `_${k}` : ''}`, 'junction', A.floor, pos, L(`${small.label.ko} 입구`, `Entrance to ${small.label.en}`))
        portals++
      })
    }
  console.log(`portals: +${portals}`)

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  let dropped = 0
  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i]
    if (e.kind !== 'walk') continue
    const a = nodeById.get(e.from)
    const b = nodeById.get(e.to)
    if (a.floor !== b.floor) continue
    if ((obstacles.get(a.floor) ?? []).some((o) => o.owner !== a.id && o.owner !== b.id && crosses(a.pos, b.pos, o.rect))) {
      console.warn(`dropped hand-drawn walk ${e.from} → ${e.to} (crosses a structure)`)
      edges.splice(i, 1)
      dropped++
    }
  }
  console.log(`crossing walk edges dropped: -${dropped}`)

  const gatedLifts = new Set(
    edges
      .filter((e) => e.kind === 'walk' && [e.from, e.to].some((id) => nodeById.get(id).type === 'gate') && [e.from, e.to].some((id) => nodeById.get(id).type === 'elevator'))
      .flatMap((e) => [e.from, e.to].filter((id) => nodeById.get(id).type === 'elevator')),
  )
  const has = new Set(edges.map((e) => [e.from, e.to].sort().join('|')))
  let added = 0
  for (const ar of areas) {
    if (!OPEN.has(ar.kind)) continue
    const r = rectOf(ar.polygon)
    const inArea = nodes.filter((n) => n.floor === ar.floor && inside(r, n.pos) && !gatedLifts.has(n.id))
    for (let i = 0; i < inArea.length; i++)
      for (let j = i + 1; j < inArea.length; j++) {
        const [a, b] = [inArea[i], inArea[j]]
        const key = [a.id, b.id].sort().join('|')
        const len = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])
        // 100m 넘는 곧은 연결은 만들지 않는다: 긴 승강장·통로에서는 가운데 확인 지점을 거쳐 가게 해 한 단계가 150m를 넘지 않게
        if (has.has(key) || len < 0.5 || len > MAX_OPEN_EDGE) continue
        const blocked = (obstacles.get(ar.floor) ?? []).some((o) => o.owner !== a.id && o.owner !== b.id && crosses(a.pos, b.pos, o.rect))
        if (blocked) continue
        edges.push({ from: a.id, to: b.id, kind: 'walk', open: true })
        has.add(key)
        added++
      }
  }
  console.log(`open-space walk edges: +${added}`)
}

const station = {
  id: 'dobongsan',
  name: L('도봉산', 'Dobongsan'),
  note:
    '7호선: 서울교통공사 안내도(in_2712)·역사심도/건축/면적정보·편의시설 API 기준 근사. 1호선(코레일): 공공데이터 없음, 안내도 3D 그림만 보고 근사(승강장 1면, 210m 가정, 대합실 다리 높이 6.35m 가정, 에스컬레이터는 API에 없어 계단으로 표시).',
  sources: [
    '서울교통공사 사이버스테이션 역 이용 및 비상대피 안내도 (in_2712.jpg)',
    '서울교통공사_역사심도정보_20250814',
    '서울교통공사_역사건축정보_20251231',
    '서울교통공사_역사면적정보_20260831',
    '공공데이터포털 서울교통공사_편의시설위치정보 API (stnNm=도봉산)',
    '국가철도공단_서울교통공사_환승정보_20260630',
  ],
  floors: FLOORS,
  areas,
  nodes,
  edges,
}

const out = fileURLToPath(new URL('../src/data/dobongsan.json', import.meta.url))
writeFileSync(out, JSON.stringify(station, null, 1) + '\n')
console.log(`wrote ${out}: ${nodes.length} nodes, ${edges.length} edges, ${areas.length} areas`)
