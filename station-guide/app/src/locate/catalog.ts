// LLM에게 고르게 할 위치 목록. 이 목록 밖의 답은 버린다(엉뚱한 위치를 지어내지 못하게).
import type { Station } from '../station/types'

export type CatalogEntry = { id: string; ko: string; en: string; signs: string }

/** 어떤 표지판이 보이면 그 위치인지(프롬프트용 설명) */
const HINTS: Record<string, string> = {
  p5_c: "'갈아타는 곳 7호선' 표지판, 보라색 5호선 열차, 장한평/아차산 방면 안내",
  board5_w: "'장한평 방면' 승강장 안내",
  board5_e: "'아차산 방면' 승강장 안내",
  board7_e: "올리브색 7호선, '중곡 방면' 승강장 안내, '갈아타는 곳 5호선'",
  board7_w: "올리브색 7호선, '어린이대공원 방면' 승강장 안내, '갈아타는 곳 5호선'",
  gate_w: "개찰구, '타는 곳 5호선', 1·2·7·8번 출구 쪽 안내",
  gate_e: "개찰구, '타는 곳 5호선', 3·4·5·6번 출구 쪽 안내",
  gate_7: "개찰구 위 '타는 곳 7호선'",
  hall_w: "대합실(개찰구 밖), '나가는 곳 1 2 7 8'",
  hall_e: "대합실(개찰구 밖), '나가는 곳 3 4 5 6', 7호선 화살표",
  c7_free: '7호선 대합실(개찰구 밖), 7호선 고객안전실',
  toilet_w: '화장실 입구',
}

export function locationCatalog(station: Station): CatalogEntry[] {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const entries: CatalogEntry[] = []
  for (let n = 1; n <= 8; n++) {
    const id = `x${n}_bot`
    if (byId.has(id)) {
      entries.push({ id, ko: `${n}번 출구 계단 아래`, en: `Bottom of the Exit ${n} stairs`, signs: `'${n}' 숫자가 큰 출구 표지판, '${n} 출입구', '나가는 곳 ${n}', 역 이름판 '군자 ${n}'` })
    }
  }
  for (const [id, signs] of Object.entries(HINTS)) {
    const node = byId.get(id)
    if (node) entries.push({ id, ko: node.label.ko, en: node.label.en, signs })
  }
  return entries
}
