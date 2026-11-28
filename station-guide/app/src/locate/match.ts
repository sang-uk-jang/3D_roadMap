// 표지판에서 읽은 글자(OCR 결과)를 역 안의 위치 후보로 바꾼다.
// 표지판 종류별 규칙:
//   출구 표지판(출입구/나가는 곳/Exit + 숫자)  → 그 출구 계단 아래(대합실)
//   타는 곳 N호선                              → N호선 개찰구 앞
//   갈아타는 곳 N호선                          → 다른 호선 승강장
//   방면 이름(장한평·아차산·중곡·어린이대공원)  → 그 방면 승강장
//   화장실                                     → 화장실 앞
//   역 이름만(군자/Gunja/544/725)              → 출구 어딘가 (번호를 물어봐야 함)
import type { Label } from '../station/types'

export type Candidate = { nodeId: string; score: number; reason: Label }

export type MatchResult = {
  candidates: Candidate[]
  /** 후보가 하나로 좁혀져 바로 써도 되는지 */
  confident: boolean
  /** 군자역 표지판으로 보이는지(역 이름·역번호를 읽었는지) */
  stationSeen: boolean
  /** 출구 표지판인데 번호를 못 읽은 경우 등, 사용자에게 물어볼 것 */
  ask?: 'exitNumber' | 'where'
}

const EXIT_WORDS = /출입구|나가는\s*곳|나가는|출구|entrance|exit|way\s*out/i
const BOARD_WORDS = /타는\s*곳|타는|to\s*trains|platform/i
const TRANSFER_WORDS = /갈아타는|환승|transfer/i
const TOILET_WORDS = /화장실|toilet|restroom/i
const STATION_WORDS = /군\s*자|gunja|능동|neungdong|\b544\b|\b725\b/i

const DIRECTIONS: { re: RegExp; node: string; label: Label }[] = [
  { re: /장한평|janghanpyeong/i, node: 'board5_w', label: { ko: '장한평 방면', en: 'to Janghanpyeong' } },
  { re: /아차산|achasan/i, node: 'board5_e', label: { ko: '아차산 방면', en: 'to Achasan' } },
  { re: /중곡|junggok/i, node: 'board7_e', label: { ko: '중곡 방면', en: 'to Junggok' } },
  { re: /어린이대공원|children'?s\s*grand\s*park/i, node: 'board7_w', label: { ko: '어린이대공원 방면', en: "to Children's Grand Park" } },
]

const GATE_OF_LINE: Record<string, string[]> = { '5': ['gate_w', 'gate_e'], '7': ['gate_7'] }

/** 글자 속에서 노선 번호(5·7)를 찾는다: "5호선", "Line 7", 원 안 숫자 등 */
function linesIn(text: string): string[] {
  const found = new Set<string>()
  // "5호선", "Line 7", 노선 동그라미가 괄호로 읽힌 "(7)"
  for (const m of text.matchAll(/([57])\s*호선|line\s*([57])|\(([57])\)/gi)) found.add(m[1] ?? m[2] ?? m[3])
  return [...found]
}

/** 출구 번호(1~8): 혼자 떨어진 숫자 */
function exitNumbersIn(text: string): number[] {
  const nums = new Set<number>()
  for (const m of text.matchAll(/(?<![\d])([1-8])(?![\d])/g)) nums.add(Number(m[1]))
  return [...nums]
}

export function matchSignText(raw: string): MatchResult {
  const text = raw.replace(/\s+/g, ' ')
  const scores = new Map<string, Candidate>()
  const add = (nodeId: string, score: number, reason: Label) => {
    const prev = scores.get(nodeId)
    if (!prev || prev.score < score) scores.set(nodeId, { nodeId, score, reason })
    else prev.score += score * 0.2
  }

  const stationSeen = STATION_WORDS.test(text)
  const isExitSign = EXIT_WORDS.test(text)
  const isTransfer = TRANSFER_WORDS.test(text)
  const isBoard = BOARD_WORDS.test(text) && !isTransfer
  let lines = linesIn(text)
  // '타는 곳/갈아타는 곳' 표지판에서 '7호선'이 깨져 읽혀도(예: 73M) 동그라미 안 숫자 5·7이 혼자 남으면 호선으로 본다
  if ((BOARD_WORDS.test(text) || isTransfer) && lines.length === 0) {
    lines = [...new Set([...text.matchAll(/(?<![\d])([57])(?![\d])/g)].map((m) => m[1]))]
  }
  // 역 이름 표지판의 "544 725"는 출구 번호가 아니므로 빼고 센다
  const exitNums = exitNumbersIn(text.replace(/\b(544|725)\b/g, '').replace(/[57]\s*호선/g, ''))

  if (isExitSign || stationSeen) {
    for (const n of exitNums) {
      add(`x${n}_bot`, isExitSign ? 3 : 2, { ko: `${n}번 출구 표지판`, en: `Exit ${n} sign` })
    }
  }
  if (isTransfer) {
    for (const l of lines) {
      // 7호선으로 갈아타라는 표지판은 5호선 승강장에, 5호선은 7호선 승강장에 있다
      if (l === '7') add('p5_c', 2.5, { ko: '7호선 갈아타는 곳 표지판 (5호선 승강장)', en: 'Transfer to Line 7 sign (Line 5 platform)' })
      if (l === '5') {
        add('board7_w', 2, { ko: '5호선 갈아타는 곳 표지판 (7호선 승강장)', en: 'Transfer to Line 5 sign (Line 7 platform)' })
        add('board7_e', 2, { ko: '5호선 갈아타는 곳 표지판 (7호선 승강장)', en: 'Transfer to Line 5 sign (Line 7 platform)' })
      }
    }
  }
  if (isBoard) {
    for (const l of lines) {
      for (const g of GATE_OF_LINE[l]) add(g, 2, { ko: `${l}호선 타는 곳 표지판`, en: `Line ${l} trains sign` })
    }
    if (lines.length === 0) {
      // "타는 곳"만 읽히고 호선을 못 읽음 → 개찰구 세 곳 모두 후보
      for (const [l, gates] of Object.entries(GATE_OF_LINE)) {
        for (const g of gates) add(g, 1, { ko: `타는 곳 표지판 (${l}호선?)`, en: `Trains sign (Line ${l}?)` })
      }
    }
  }
  for (const d of DIRECTIONS) {
    if (d.re.test(text)) add(d.node, isBoard || isTransfer ? 1 : 1.5, { ko: `${d.label.ko} 표지판`, en: `${d.label.en} sign` })
  }
  if (TOILET_WORDS.test(text)) add('toilet_w', 1.5, { ko: '화장실 표지판', en: 'Toilet sign' })

  const candidates = [...scores.values()].sort((a, b) => b.score - a.score)
  const top = candidates[0]
  const second = candidates[1]
  const exitCandidates = candidates.filter((c) => /^x\d_bot$/.test(c.nodeId))
  // 출구 번호를 읽었는데 다른 숫자 덩어리(잡음)도 함께 읽혔다면 OCR이 숫자를 잘못 읽었을 수 있다(4↔8 등)
  const digitNoise = /\d{2,}/.test(text.replace(/\b(544|725)\b/g, ''))
  const exitUnsure = exitCandidates.length > 0 && (digitNoise || exitCandidates.length > 1)
  const confident = !!top && top.score >= 2 && (!second || top.score - second.score >= 1) && !(exitUnsure && /^x\d_bot$/.test(top.nodeId))
  let ask: MatchResult['ask']
  if (candidates.length === 0) ask = isExitSign || stationSeen ? 'exitNumber' : 'where'
  // 출구 표지판인데 번호가 확실하지 않음 → 번호를 물어본다(읽은 번호는 후보로 강조)
  else if (!confident && (isExitSign || stationSeen) && exitCandidates.length > 0) ask = 'exitNumber'
  else if (!confident) ask = 'where'
  return { candidates: candidates.slice(0, 4), confident, stationSeen, ask }
}
