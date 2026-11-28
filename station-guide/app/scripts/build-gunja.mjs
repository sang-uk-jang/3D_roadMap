// 군자역 역 구조 데이터(src/data/gunja.json) 생성 스크립트.
// 실행: npm run build:data
//
// 근거 자료
// - 서울교통공사 역 이용 및 비상대피 안내도 (data/raw/gunja_map_in_2545.jpg): 층 구성, 출구·계단·엘리베이터 배치
// - 서울교통공사 역사심도정보: 승강장 깊이 (5호선 13.24m, 7호선 20.13m)
// - 서울교통공사 역사건축정보/면적정보: 승강장 길이 165m, 승강장 면적 → 폭
// - 편의시설위치정보 API (data/raw/gunja_facilities_api.json): 엘리베이터·에스컬레이터·발매기·화장실 위치 설명과 시설번호
//
// 좌표는 안내도를 보고 잡은 근사치다(실측 아님). 계단·에스컬레이터는 위/아래 입구 노드를 따로 두고
// 높이차 × 경사 비율만큼 수평으로 떨어뜨려 실제 경사에 맞춘다.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FLOORS = [
  { id: 'G', label: { ko: '지상', en: 'Street' }, y: 0 },
  { id: 'B1', label: { ko: '지하1층 대합실', en: 'B1 Concourse' }, y: -6 },
  { id: 'B2_5', label: { ko: '지하2층 5호선 승강장', en: 'B2 Line 5 Platform' }, y: -13.2 },
  { id: 'B2_7', label: { ko: '지하2층 7호선 대합실', en: 'B2 Line 7 Concourse' }, y: -16.5 },
  { id: 'B3', label: { ko: '지하3층 7호선 승강장', en: 'B3 Line 7 Platforms' }, y: -20.1 },
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
 * 층 연결 계단/에스컬레이터. 위 입구(top)에서 dir 방향으로 내려가 아래 입구 노드를 만든다.
 * top이 문자열이면 기존 노드를 위 입구로 쓴다(지상 출입구 등).
 */
function connector({ id, kind, top, bottomFloor, dir, label, refs }) {
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
  const bottomId = node(`${id}_bot`, 'landing', bottomFloor, bottomPos, L(`${label.ko} (아래)`, `${label.en} (bottom)`))
  edges.push({ from: topId, to: bottomId, kind, width: WIDTH[kind], ...(refs ? { facilityRefs: refs } : {}) })
  return { top: topId, bottom: bottomId }
}

/** 여러 층에 서는 엘리베이터. 층마다 같은 평면 좌표에 노드를 만든다 */
function elevator({ id, pos, floors, label, refs }) {
  const ids = floors.map((f) => node(`${id}_${f}`, 'elevator', f, pos, label, { facilityRef: refs[0] }))
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ from: ids[i], to: ids[i + 1], kind: 'elevator', facilityRefs: refs })
  }
  return Object.fromEntries(floors.map((f, i) => [f, ids[i]]))
}

// ───────────── 구역 ─────────────
area('street', 'G', 'ground', L('지상', 'Street'), rect(-100, -90, 100, 90))
// ───────────── 배치 근거 (두 안내도: 5호선 in_2545, 7호선 in_2727) ─────────────
// · 단면도 축척: 승강장 165m를 그림 폭에 맞춰 환산(약 0.1m/px). 그림이라 ±5m 정도 오차.
// · B1은 십자 모양: 가운데 광장(개찰구 밖)에 출구 계단이 모이고, 5호선 축(동서)과 7호선 축(남북)으로 개찰구 안 구역이 뻗는다.
// · 출구 계단이 B1에 닿는 곳: 1·2번 서쪽 약 28m, 7·8번 서쪽 약 21m, 5·6번 동쪽 약 16m, 3·4번 동쪽 약 23m(5호선 단면),
//   1·2·3·4번 북쪽 17~28m, 5·6·7·8번 남쪽 17~28m(7호선 단면).
// · 5호선 승강장과 B1은 승강장 양 끝 계단으로만 이어진다(5호선 단면의 양 끝 계단, 가운데 계단 없음). 엘리베이터 2대는 가운데.
// · 7호선: B1 북쪽 에스컬레이터(가운데 쪽으로 내려감)·남쪽 계단으로 B2 대합실, B2는 남북으로 한 판,
//   B2→B3는 북쪽 에스컬레이터(북쪽으로 내려감)·남쪽 계단(남쪽으로 내려감)·가운데 환승 계단("갈아타는 곳 5").
area('plaza_n', 'B1', 'concourse', L('대합실 북쪽 (1·2·3·4번 출구)', 'Concourse north (Exits 1–4)'), rect(-40, -30, 40, -12))
area('plaza_c', 'B1', 'concourse', L('대합실 가운데 (표 사는 곳)', 'Concourse centre (tickets)'), rect(-22, -12, 22, 12))
area('plaza_s', 'B1', 'concourse', L('대합실 남쪽 (5·6·7·8번 출구)', 'Concourse south (Exits 5–8)'), rect(-40, 12, 40, 28))
area('paid_5', 'B1', 'paid', L('5호선 개찰구 안 (장한평 쪽)', 'Line 5 paid area (west)'), rect(-82, -10, -22, 10))
area('paid_5e', 'B1', 'paid', L('5호선 개찰구 안 (아차산 쪽)', 'Line 5 paid area (east)'), rect(22, -10, 82, 10))
area('c7_paid', 'B1', 'paid', L('7호선 개찰구 안 (중곡 쪽)', 'Line 7 paid area (north)'), rect(-10, -80, 10, -30))
area('c7s_paid', 'B1', 'paid', L('7호선 개찰구 안 (어린이대공원 쪽)', 'Line 7 paid area (south)'), rect(-10, 28, 10, 70))
// 출구 엘리베이터 앞 통로: 7번은 7·8번 출구 옆, 4번은 5호선 단면의 동쪽 끝 기둥(약 +72m)
area('lift7', 'B1', 'passage', L('7번 출구 엘리베이터 앞', 'Exit 7 elevator lobby'), rect(-20, 28, -12, 40))
area('lift4', 'B1', 'passage', L('4번 출구 엘리베이터 통로', 'Exit 4 elevator passage'), rect(40, -20, 74, -12))

area('p5', 'B2_5', 'platform', L('5호선 승강장', 'Line 5 Platform'), rect(-82.5, -5, 82.5, 5), '5')
area('t5n', 'B2_5', 'track', L('5호선 선로', 'Line 5 track'), rect(-82.5, -9, 82.5, -5))
area('t5s', 'B2_5', 'track', L('5호선 선로', 'Line 5 track'), rect(-82.5, 5, 82.5, 9))

area('c7b2', 'B2_7', 'paid', L('7호선 대합실 (지하2층)', 'Line 7 concourse (B2)'), rect(-14, -62, 14, 62))
area('spass', 'B2_7', 'passage', L('환승통로 (5호선 승강장 아래)', 'Transfer passage (under Line 5)'), rect(-95, -4, 95, 4))

area('p7w', 'B3', 'platform', L('7호선 어린이대공원 방면 승강장', "Line 7 platform to Children's Grand Park"), rect(-12, -82.5, -5, 82.5), '7')
area('t7', 'B3', 'track', L('7호선 선로', 'Line 7 track'), rect(-5, -82.5, 5, 82.5))
area('p7e', 'B3', 'platform', L('7호선 중곡 방면 승강장', 'Line 7 platform to Junggok'), rect(5, -82.5, 12, 82.5), '7')

// ───────────── 지상 출입구 ─────────────
// 에스컬레이터가 있는 출구: 1, 4, 5, 8 (편의시설 API). 나머지는 계단.
const EXITS = [
  { n: 1, pos: [-31, -33], kind: 'escalator', dir: [0, 1], refs: ['1780768', '1780769'] },
  { n: 2, pos: [-25, -33], kind: 'stairs', dir: [0, 1] },
  { n: 3, pos: [21, -33], kind: 'stairs', dir: [0, 1] },
  { n: 4, pos: [27, -33], kind: 'escalator', dir: [0, 1], refs: ['1310689', '1310690'] },
  { n: 5, pos: [20, 33], kind: 'escalator', dir: [0, -1], refs: ['1310687', '1310688'] },
  { n: 6, pos: [14, 33], kind: 'stairs', dir: [0, -1] },
  { n: 7, pos: [-19, 33], kind: 'stairs', dir: [0, -1] },
  { n: 8, pos: [-25, 33], kind: 'escalator', dir: [0, -1], refs: ['1786693', '1786695'] },
]
const exitBottom = {}
for (const e of EXITS) {
  const id = node(`exit${e.n}`, 'exit', 'G', e.pos, L(`${e.n}번 출구`, `Exit ${e.n}`))
  const kindKo = e.kind === 'escalator' ? '에스컬레이터' : '계단'
  const kindEn = e.kind === 'escalator' ? 'escalator' : 'stairs'
  exitBottom[e.n] = connector({
    id: `x${e.n}`,
    kind: e.kind,
    top: id,
    bottomFloor: 'B1',
    dir: e.dir,
    label: L(`${e.n}번 출구 ${kindKo}`, `Exit ${e.n} ${kindEn}`),
    refs: e.refs,
  }).bottom
}
// 출구 엘리베이터: 4번(외부3), 7번(7호선 외부1)
const elX4 = elevator({ id: 'el_x4', pos: [70, -16], floors: ['G', 'B1'], label: L('4번 출구 엘리베이터', 'Exit 4 elevator'), refs: ['1310686'] })
const elX7 = elevator({ id: 'el_x7', pos: [-15, 36], floors: ['G', 'B1'], label: L('7번 출구 엘리베이터', 'Exit 7 elevator'), refs: ['1311410'] })
// 4번 출구 앞 보도에서 엘리베이터까지(출구 에스컬레이터를 비켜서)
const street4 = node('street4', 'junction', 'G', [30, -37], L('4번 출구 앞 보도', 'Sidewalk at Exit 4'))
walk('exit4', street4, elX4.G)
walk('exit7', elX7.G)

// ───────────── B1: 대합실(개찰구 밖) ─────────────
const hallW = node('hall_w', 'junction', 'B1', [-30, -18], L('대합실 북서쪽 (1·2번 출구)', 'Concourse north-west (Exits 1·2)'))
const hallE = node('hall_e', 'junction', 'B1', [26, -18], L('대합실 북동쪽 (3·4번 출구)', 'Concourse north-east (Exits 3·4)'))
const hallSW = node('hall_sw', 'junction', 'B1', [-24, 18], L('대합실 남서쪽 (7·8번 출구)', 'Concourse south-west (Exits 7·8)'))
const hallSE = node('hall_se', 'junction', 'B1', [18, 18], L('대합실 남동쪽 (5·6번 출구)', 'Concourse south-east (Exits 5·6)'))
const plaza = node('plaza', 'junction', 'B1', [0, 0], L('대합실 가운데', 'Concourse centre'))
const ticketW = node('ticket_w', 'ticket', 'B1', [-16, -7], L('승차권 발매기 · 교통카드 키오스크', 'Ticket machine & card kiosk'), { facilityRef: '1231454' })
const ticketE = node('ticket_e', 'ticket', 'B1', [16, -7], L('승차권 발매기 · 교통카드 키오스크', 'Ticket machine & card kiosk'), { facilityRef: '1231456' })
// 안내도: 화장실은 7·8번 출구 쪽(5호선 단면 서쪽 약 38m), 5호선 고객안전실·수유실은 가운데 표 사는 곳 옆
const toilet = node('toilet_w', 'toilet', 'B1', [-36, 16], L('화장실', 'Toilet'), { facilityRef: '1740720' })
const info5 = node('info5', 'info', 'B1', [5, -10], L('5호선 고객안전실 · 수유실', 'Line 5 information & nursing room'))
const gateW = node('gate_w', 'gate', 'B1', [-22, 0], L('5호선 개찰구 (장한평 방면)', 'Line 5 gates (to Janghanpyeong)'))
const gateE = node('gate_e', 'gate', 'B1', [22, 0], L('5호선 개찰구 (아차산 방면)', 'Line 5 gates (to Achasan)'))

for (const n of [1, 2]) walk(exitBottom[n], hallW)
for (const n of [3, 4]) walk(exitBottom[n], hallE)
for (const n of [7, 8]) walk(exitBottom[n], hallSW)
for (const n of [5, 6]) walk(exitBottom[n], hallSE)
walk(elX7.B1, hallSW)
walk(elX4.B1, hallE)
walk(hallW, plaza, hallE)
walk(hallSW, plaza, hallSE)
walk(plaza, ticketW, gateW)
walk(plaza, ticketE, gateE)
walk(hallSW, toilet)
walk(plaza, info5)

// ───────────── B1: 5호선 개찰구 안 → 승강장 ─────────────
// 섬식 승강장(폭 10m). B1↔승강장은 양 끝 계단(바깥쪽으로 내려감). 편의시설 API에 5호선 승강장 에스컬레이터는 없다.
// 내부 엘리베이터 2대는 광장 가운데(안내도의 초록 기둥, 단면상 가운데 ±10m)에서 5호선·7호선 승강장까지.
// 광장은 개찰구 밖이라 엘리베이터 앞에 교통약자용 개찰구를 둔다(위치는 추정).
const paid5 = node('paid_5', 'junction', 'B1', [-45, 5], L('5호선 개찰구 안 (장한평 쪽)', 'Line 5 paid area (west)'))
const paid5e = node('paid_5e', 'junction', 'B1', [45, 5], L('5호선 개찰구 안 (아차산 쪽)', 'Line 5 paid area (east)'))
const st5wEnd = connector({ id: 'st5w_end', kind: 'stairs', top: { floor: 'B1', pos: [-62, -1] }, bottomFloor: 'B2_5', dir: [-1, 0], label: L('5호선 승강장 계단 (장한평 쪽 끝)', 'Stairs to Line 5 platform (west end)') })
const st5eEnd = connector({ id: 'st5e_end', kind: 'stairs', top: { floor: 'B1', pos: [62, -1] }, bottomFloor: 'B2_5', dir: [1, 0], label: L('5호선 승강장 계단 (아차산 쪽 끝)', 'Stairs to Line 5 platform (east end)') })
walk(gateW, paid5, st5wEnd.top)
walk(gateE, paid5e, st5eEnd.top)
// 편의시설 API 위치 설명: 내부1 = "장한평 방면 5-3, 아차산 방면 4-1"(가운데 동쪽), 내부2 = "장한평 방면 4-3, 아차산 방면 5-1"(가운데 서쪽).
// 7호선 승강장(폭 7m) 안에 들어가도록 x를 맞춘다.
const el1 = elevator({ id: 'el1', pos: [9.8, 2.3], floors: ['B1', 'B2_5', 'B3'], label: L('내부 엘리베이터 1', 'Elevator 1'), refs: ['1310684'] })
const el2 = elevator({ id: 'el2', pos: [-7.2, 2.3], floors: ['B1', 'B2_5', 'B3'], label: L('내부 엘리베이터 2', 'Elevator 2'), refs: ['1310685'] })
const gateL1 = node('gate_lift1', 'gate', 'B1', [9.8, 7], L('엘리베이터 앞 개찰구 (1)', 'Gate at elevator 1'))
const gateL2 = node('gate_lift2', 'gate', 'B1', [-7.2, 7], L('엘리베이터 앞 개찰구 (2)', 'Gate at elevator 2'))
walk(plaza, gateL1, el1.B1)
walk(plaza, gateL2, el2.B1)

// ───────────── B1: 7호선 개찰구 안(북쪽·남쪽) ─────────────
const gate7 = node('gate_7', 'gate', 'B1', [0, -30], L('7호선 개찰구 (중곡 쪽)', 'Line 7 gates (north)'))
const gate7s = node('gate_7s', 'gate', 'B1', [0, 28], L('7호선 개찰구 (어린이대공원 쪽)', 'Line 7 gates (south)'))
const c7paid = node('c7_paid', 'junction', 'B1', [5, -40], L('7호선 개찰구 안 (중곡 쪽)', 'Line 7 paid area (north)'))
const c7spaid = node('c7s_paid', 'junction', 'B1', [5, 40], L('7호선 개찰구 안 (어린이대공원 쪽)', 'Line 7 paid area (south)'))
// 7호선 고객안전실: 7호선 단면의 북쪽 끝(약 -77m). 개찰구 안팎은 그림으로 알 수 없어 북쪽 구역 끝에 둔다.
const info7 = node('info7', 'info', 'B1', [5, -74], L('7호선 고객안전실', 'Line 7 information'))
walk(hallW, gate7, c7paid)
walk(hallE, gate7)
walk(hallSW, gate7s, c7spaid)
walk(hallSE, gate7s)
walk(c7paid, info7)
// B1→B2: 북쪽 에스컬레이터(1·2호기, 가운데 쪽으로 내려감), 남쪽 계단(가운데 쪽으로 내려감)
const es12 = connector({ id: 'es12', kind: 'escalator', top: { floor: 'B1', pos: [0, -56] }, bottomFloor: 'B2_7', dir: [0, 1], label: L('7호선 에스컬레이터 (지하1층↔지하2층)', 'Line 7 escalator (B1–B2)'), refs: ['1620263', '1620264'] })
const st7s = connector({ id: 'st7s', kind: 'stairs', top: { floor: 'B1', pos: [0, 62] }, bottomFloor: 'B2_7', dir: [0, -1], label: L('7호선 계단 (지하1층↔지하2층, 어린이대공원 쪽)', 'Line 7 stairs (B1–B2, south)') })
walk(c7paid, es12.top)
walk(c7spaid, st7s.top)

// ───────────── B2: 5호선 승강장 ─────────────
const p5c = node('p5_c', 'junction', 'B2_5', [0, 0], L('5호선 승강장 가운데', 'Line 5 platform (middle)'))
const p5w = node('p5_w', 'junction', 'B2_5', [-55, 0], L('5호선 승강장 서쪽', 'Line 5 platform (west)'))
const p5e = node('p5_e', 'junction', 'B2_5', [55, 0], L('5호선 승강장 동쪽', 'Line 5 platform (east)'))
const board5w = node('board5_w', 'boarding', 'B2_5', [-66, -4], L('5호선 장한평 방면 타는 곳', 'Line 5 to Janghanpyeong'), { line: '5', direction: L('장한평 방면', 'to Janghanpyeong') })
const board5e = node('board5_e', 'boarding', 'B2_5', [66, 4], L('5호선 아차산 방면 타는 곳', 'Line 5 to Achasan'), { line: '5', direction: L('아차산 방면', 'to Achasan') })
const signP5 = node('sign_map_p5', 'sign', 'B2_5', [40, 3], L('역 이용 및 비상대피 안내도 (현위치)', 'Station & evacuation map (You are here)'))
walk(el1.B2_5, p5c)
walk(el2.B2_5, p5c)
walk(p5c, p5w)
walk(p5c, p5e)
walk(p5e, signP5)
// 승강장 양 끝: B1에서 내려오는 계단 바깥에 7호선 갈아타는 계단(환승정보: 5→7 빠른 문 1-1·8-4)
const endW = connector({ id: 'tw', kind: 'stairs', top: { floor: 'B2_5', pos: [-78, 0] }, bottomFloor: 'B2_7', dir: [-1, 0], label: L('7호선 갈아타는 계단 (장한평 쪽 끝)', 'Transfer stairs to Line 7 (west end)') })
const endE = connector({ id: 'te', kind: 'stairs', top: { floor: 'B2_5', pos: [78, 0] }, bottomFloor: 'B2_7', dir: [1, 0], label: L('7호선 갈아타는 계단 (아차산 쪽 끝)', 'Transfer stairs to Line 7 (east end)') })

// ───────────── B2: 7호선 대합실 + 5호선 승강장 아래 환승통로 ─────────────
const passW = node('pass_w', 'junction', 'B2_7', [-88, 0], L('환승통로 (장한평 쪽)', 'Transfer passage (west)'))
const passE = node('pass_e', 'junction', 'B2_7', [88, 0], L('환승통로 (아차산 쪽)', 'Transfer passage (east)'))
const n7 = node('n7', 'junction', 'B2_7', [0, -30], L('7호선 대합실 (중곡 쪽)', 'Line 7 concourse (north)'))
const s7 = node('s7', 'junction', 'B2_7', [0, 30], L('7호선 대합실 (어린이대공원 쪽)', 'Line 7 concourse (south)'))
walk(endW.bottom, passW)
walk(endE.bottom, passE)
walk(es12.bottom, n7)
walk(st7s.bottom, s7)

// B2→B3: 북쪽 에스컬레이터 2쌍(북쪽으로 내려감), 남쪽 계단 2곳(남쪽으로 내려감), 가운데 환승 계단 2곳
const es34 = connector({ id: 'es34', kind: 'escalator', top: { floor: 'B2_7', pos: [-8.5, -44] }, bottomFloor: 'B3', dir: [0, -1], label: L('어린이대공원 방면 에스컬레이터', "Escalator to Children's Grand Park platform"), refs: ['1620265', '1620266'] })
const es56 = connector({ id: 'es56', kind: 'escalator', top: { floor: 'B2_7', pos: [8.5, -44] }, bottomFloor: 'B3', dir: [0, -1], label: L('중곡 방면 에스컬레이터', 'Escalator to Junggok platform'), refs: ['1620267', '1620268'] })
const st7w = connector({ id: 'st7w', kind: 'stairs', top: { floor: 'B2_7', pos: [-8.5, 46] }, bottomFloor: 'B3', dir: [0, 1], label: L('어린이대공원 방면 계단', "Stairs to Children's Grand Park platform") })
const st7e = connector({ id: 'st7e', kind: 'stairs', top: { floor: 'B2_7', pos: [8.5, 46] }, bottomFloor: 'B3', dir: [0, 1], label: L('중곡 방면 계단', 'Stairs to Junggok platform') })
// 가운데 "갈아타는 곳 5" 계단(7호선 단면). 환승정보: 7→5 빠른 문 5-1·5-2
const st7cw = connector({ id: 'st7cw', kind: 'stairs', top: { floor: 'B2_7', pos: [-8.5, -10] }, bottomFloor: 'B3', dir: [0, 1], label: L('5호선 갈아타는 계단 (가운데)', 'Transfer stairs to Line 5 (middle)') })
const st7ce = connector({ id: 'st7ce', kind: 'stairs', top: { floor: 'B2_7', pos: [8.5, -10] }, bottomFloor: 'B3', dir: [0, 1], label: L('5호선 갈아타는 계단 (가운데)', 'Transfer stairs to Line 5 (middle)') })

// ───────────── B3: 7호선 승강장 ─────────────
const board7w = node('board7_w', 'boarding', 'B3', [-6, -1], L('7호선 어린이대공원 방면 타는 곳', "Line 7 to Children's Grand Park"), { line: '7', direction: L('어린이대공원 방면', "to Children's Grand Park") })
const board7e = node('board7_e', 'boarding', 'B3', [6, -1], L('7호선 중곡 방면 타는 곳', 'Line 7 to Junggok'), { line: '7', direction: L('중곡 방면', 'to Junggok') })
walk(st7cw.bottom, board7w)
walk(st7ce.bottom, board7e)

// ───────────── 넓은 공간에서는 곧장 걷는다 ─────────────
// 대합실·통로·승강장은 트인 공간이라 같은 구역(직사각형) 안의 두 지점은 곧장 걸어갈 수 있다.
// 단, 계단·에스컬레이터(바닥 구멍이나 승강장 위 구조물)와 엘리베이터를 가로지르는 선은 잇지 않는다.
// 지상(도로)은 길 건너기 문제가 있어 제외한다.
{
  const OPEN = new Set(['concourse', 'paid', 'passage', 'platform'])
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rectOf = (poly) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), z0: Math.min(...poly.map((p) => p[1])), z1: Math.max(...poly.map((p) => p[1])) })
  const inside = (r, [x, z]) => x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01
  // 층별 장애물
  const obstacles = new Map()
  const addObs = (floor, rect, owner) => obstacles.set(floor, [...(obstacles.get(floor) ?? []), { rect, owner }])
  for (const e of edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    const h = WIDTH[e.kind] / 2 + 0.3
    const alongX = Math.abs(b.pos[0] - a.pos[0]) >= Math.abs(b.pos[1] - a.pos[1])
    const rect = alongX
      ? { x0: Math.min(a.pos[0], b.pos[0]), x1: Math.max(a.pos[0], b.pos[0]), z0: a.pos[1] - h, z1: a.pos[1] + h }
      : { x0: a.pos[0] - h, x1: a.pos[0] + h, z0: Math.min(a.pos[1], b.pos[1]), z1: Math.max(a.pos[1], b.pos[1]) }
    for (const f of new Set([a.floor, b.floor])) addObs(f, rect, null)
  }
  for (const n of nodes) if (n.type === 'elevator') addObs(n.floor, { x0: n.pos[0] - 1.4, x1: n.pos[0] + 1.4, z0: n.pos[1] - 1.4, z1: n.pos[1] + 1.4 }, n.id)
  /** 선분이 사각형 안쪽을 0.2m 넘게 지나가는지(Liang–Barsky) */
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
  // 구조물(계단·에스컬레이터·엘리베이터) 네 모서리 바로 바깥에 비켜 가는 지점을 둔다(가시성 그래프).
  // 좁은 승강장에서 계단 옆으로 지나가는 길을 만들기 위함. 화면에는 그리지 않는다.
  const openRects = areas.filter((ar) => OPEN.has(ar.kind)).map((ar) => ({ floor: ar.floor, r: rectOf(ar.polygon) }))
  const strictlyIn = (r, [x, z], m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m
  let waypoints = 0
  for (const [floor, list] of obstacles) {
    list.forEach((o, k) => {
      const g = 0.6
      const corners = [[o.rect.x0 - g, o.rect.z0 - g], [o.rect.x1 + g, o.rect.z0 - g], [o.rect.x0 - g, o.rect.z1 + g], [o.rect.x1 + g, o.rect.z1 + g]]
      corners.forEach((c, ci) => {
        const pos = c.map(round)
        if (!openRects.some((a) => a.floor === floor && strictlyIn(a.r, pos, -0.3))) return // 트인 구역 안쪽만
        if (list.some((q) => strictlyIn(q.rect, pos, 0.3))) return // 다른 구조물 안이면 제외
        node(`wp_${floor}_${k}_${ci}`, 'waypoint', floor, pos, L('통로', 'Walkway'))
        waypoints++
      })
    })
  }
  console.log(`waypoints: +${waypoints}`)

  // 붙어 있거나 겹치는 두 트인 구역 사이에 연결점(통로 입구)을 둔다.
  // 개찰구가 있는 층에서 개찰구 안(paid)과 밖이 맞닿은 곳은 개찰구로만 지나가므로 만들지 않는다.
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
      // 맞닿은 길이가 너무 짧으면(모서리만 닿음) 건너뜀
      if (Math.max(x1 - x0, z1 - z0) < 2) continue
      if (nodes.some((n) => n.floor === A.floor && inside(ra, n.pos) && inside(rb, n.pos))) continue // 이미 겹친 곳에 지점이 있음
      const small = (ra.x1 - ra.x0) * (ra.z1 - ra.z0) <= (rb.x1 - rb.x0) * (rb.z1 - rb.z0) ? A : B
      // 맞닿은 변이 길면 가운데뿐 아니라 양 끝(1.5m 안쪽)에도 둔다: 모서리를 끼고 도는 사람이 가운데까지 돌아가지 않게
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

  // 손으로 그은 걷기 연결 중 계단 구멍·구조물을 가로지르는 것은 뺀다(대신 아래에서 비켜 가는 선이 생긴다)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  let dropped = 0
  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i]
    if (e.kind !== 'walk') continue
    const a = nodeById.get(e.from)
    const b = nodeById.get(e.to)
    if (a.floor !== b.floor) continue
    if ((obstacles.get(a.floor) ?? []).some((o) => o.owner !== a.id && o.owner !== b.id && crosses(a.pos, b.pos, o.rect))) {
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
    // 엘리베이터 앞에 개찰구가 있으면 그 개찰구로만 드나든다
    const inArea = nodes.filter((n) => n.floor === ar.floor && inside(r, n.pos) && !gatedLifts.has(n.id))
    for (let i = 0; i < inArea.length; i++)
      for (let j = i + 1; j < inArea.length; j++) {
        const [a, b] = [inArea[i], inArea[j]]
        const key = [a.id, b.id].sort().join('|')
        if (has.has(key) || Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) < 0.5) continue
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
  id: 'gunja',
  name: L('군자(능동)', 'Gunja (Neungdong)'),
  note: '좌표는 서울교통공사 역 이용 안내도를 보고 잡은 근사치(실측 아님). 층 높이는 역사심도정보, 시설은 편의시설위치정보 API 기준.',
  sources: [
    '서울교통공사 사이버스테이션 역 이용 및 비상대피 안내도 (in_2545.jpg)',
    '서울교통공사_역사심도정보_20250814',
    '서울교통공사_역사건축정보_20251231',
    '공공데이터포털 서울교통공사_편의시설위치정보 API',
  ],
  floors: FLOORS,
  areas,
  nodes,
  edges,
}

const out = fileURLToPath(new URL('../src/data/gunja.json', import.meta.url))
writeFileSync(out, JSON.stringify(station, null, 1) + '\n')
console.log(`wrote ${out}: ${nodes.length} nodes, ${edges.length} edges, ${areas.length} areas`)
