// 승강장 안전문(칸-문 번호) 위치.
// 가정: 5·7호선 모두 8칸, 칸 길이 20m, 칸마다 문 4개(앞에서 2.5·7.5·12.5·17.5m), 열차는 165m 승강장 가운데 정차.
// 1번 칸·1번 문 = 열차 진행 방향 맨 앞(서울 지하철 안전문 번호 방식). 실측·공식 도면과 대조하지 않았다.
// 환승 빠른 문: 국가철도공단_서울교통공사_환승정보_20260630 (군자 5→7: 1-1, 8-4 / 7→5: 5-1, 5-2)
import type { Label } from './types'
import { DOBONGSAN_SIDES } from './doors-dobongsan'

export const CARS = 8
export const CAR_LENGTH = 20
const DOOR_OFFSETS = [2.5, 7.5, 12.5, 17.5]

export type PlatformSide = {
  /** 타는 곳 노드 id */
  boarding: string
  line: string
  /** 칸 수(없으면 8) */
  cars?: number
  /** 열차 진행 방향(평면 단위 벡터 [x, z]) */
  dir: [number, number]
  /** 정차한 열차 맨 앞 위치(평면) — 승강장 가장자리 선 위 */
  front: [number, number]
  /** 승강장 가장자리에서 선로 쪽을 가리키는 단위 벡터 */
  trackSide: [number, number]
  /** 환승 빠른 문 */
  transfer: { doors: string[]; to: Label }
}

export const PLATFORM_SIDES: PlatformSide[] = [
  { boarding: 'board5_w', line: '5', dir: [-1, 0], front: [-80, -5], trackSide: [0, -1], transfer: { doors: ['1-1', '8-4'], to: { ko: '7호선 갈아타기', en: 'Transfer to Line 7' } } },
  { boarding: 'board5_e', line: '5', dir: [1, 0], front: [80, 5], trackSide: [0, 1], transfer: { doors: ['1-1', '8-4'], to: { ko: '7호선 갈아타기', en: 'Transfer to Line 7' } } },
  { boarding: 'board7_w', line: '7', dir: [0, 1], front: [-5, 80], trackSide: [1, 0], transfer: { doors: ['5-1', '5-2'], to: { ko: '5호선 갈아타기', en: 'Transfer to Line 5' } } },
  { boarding: 'board7_e', line: '7', dir: [0, -1], front: [5, -80], trackSide: [-1, 0], transfer: { doors: ['5-1', '5-2'], to: { ko: '5호선 갈아타기', en: 'Transfer to Line 5' } } },
]

export type Door = { id: string; car: number; door: number; pos: [number, number] }

export function doorsOf(side: PlatformSide): Door[] {
  const out: Door[] = []
  for (let c = 1; c <= (side.cars ?? CARS); c++)
    DOOR_OFFSETS.forEach((off, i) => {
      const s = (c - 1) * CAR_LENGTH + off
      out.push({ id: `${c}-${i + 1}`, car: c, door: i + 1, pos: [side.front[0] - side.dir[0] * s, side.front[1] - side.dir[1] * s] })
    })
  return out
}

/** 모든 역의 승강장 쪽(타는 곳 id는 역끼리 겹치지 않는다) */
export const ALL_PLATFORM_SIDES: PlatformSide[] = [...PLATFORM_SIDES, ...DOBONGSAN_SIDES]

/** 이 역의 승강장 쪽 */
export function sidesFor(stationId: string): PlatformSide[] {
  return stationId === 'dobongsan' ? DOBONGSAN_SIDES : PLATFORM_SIDES
}

/** 문 앞에 만든 임시 타는 곳('board7_e@8-4')의 원래 타는 곳 id */
export function baseBoarding(id: string): string {
  return id.split('@')[0]
}

export function sideOf(boardingId: string) {
  const id = baseBoarding(boardingId)
  return ALL_PLATFORM_SIDES.find((s) => s.boarding === id) ?? null
}

/** 타는 곳 노드에서 가장 가까운 문 */
export function nearestDoor(boardingId: string, at: [number, number]): Door | null {
  const side = sideOf(boardingId)
  if (!side) return null
  let best: Door | null = null
  let bestD = Infinity
  for (const d of doorsOf(side)) {
    const dist = Math.hypot(d.pos[0] - at[0], d.pos[1] - at[1])
    if (dist < bestD) [best, bestD] = [d, dist]
  }
  return best
}
