// 도봉산역 승강장 안전문(칸-문 번호) 위치. 좌표는 scripts/build-dobongsan.mjs와 같다.
// 7호선: 8칸·칸 20m·문 4개, 165m 승강장(x -82.5~82.5) 가운데 정차 가정. 오른쪽 통행.
//   환승 빠른 문(7→1): 국가철도공단_서울교통공사_환승정보_20260630 — 1-1, 8-4 (두 방면 모두)
// 1호선(코레일): 10칸·칸 20m·문 4개, 210m 승강장(x -150~60) 가운데 정차 가정(근사). 왼쪽 통행.
//   1→7 환승 빠른 문은 공공데이터에 없다(코레일 구간) → 표시하지 않음.
import type { PlatformSide } from './doors'

const TO_LINE1 = { ko: '1호선 갈아타기', en: 'Transfer to Line 1' }

export const DOBONGSAN_SIDES: PlatformSide[] = [
  { boarding: 'board7_jangam', line: '7', dir: [-1, 0], front: [-80, -4], trackSide: [0, 1], transfer: { doors: ['1-1', '8-4'], to: TO_LINE1 } },
  { boarding: 'board7_suraksan', line: '7', dir: [1, 0], front: [80, 4], trackSide: [0, -1], transfer: { doors: ['1-1', '8-4'], to: TO_LINE1 } },
  { boarding: 'board1_dobong', line: '1', cars: 10, dir: [1, 0], front: [55, 46], trackSide: [0, -1], transfer: { doors: [], to: { ko: '7호선 갈아타기', en: 'Transfer to Line 7' } } },
  { boarding: 'board1_mangwolsa', line: '1', cars: 10, dir: [-1, 0], front: [-145, 56], trackSide: [0, 1], transfer: { doors: [], to: { ko: '7호선 갈아타기', en: 'Transfer to Line 7' } } },
]
