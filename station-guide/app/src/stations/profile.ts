// 역마다 다른 화면 설정. 엔진(경로·안내 단계·3D)은 역 데이터(JSON)만 보고, 나머지 역별 값은 여기 모은다.
// 역 전환: URL 쿼리 ?station=dobongsan (기본은 군자역)
import gunja from '../data/gunja.json'
import dobongsan from '../data/dobongsan.json'
import { DESTINATIONS, type Destination } from '../data/lines'
import { DOBONGSAN_DESTINATIONS } from '../data/lines-dobongsan'
import type { Label, Station } from '../station/types'

export type StationProfile = {
  id: 'gunja' | 'dobongsan'
  station: Station
  destinations: Destination[]
  /** 층 선택 버튼 이름 */
  floorButtons: Record<string, Label>
  /** 엘리베이터 이름표에 쓰는 짧은 층 이름 */
  floorShort: Record<string, Label>
  /** 함께 보여줄 층 묶음(예: 지상과 지하1층) */
  mergedFloors: string[][]
  /** 층 선택 버튼에서 뺄 층 */
  hiddenFloorButtons: string[]
  /** 엘리베이터로 오갈 수 있는 출구 */
  elevatorExits: string[]
  /** "열차에서 내렸어요"에서 고를 승강장 */
  platformOrigins: { id: string; label: Label }[]
  lineColors: Record<string, string>
  /** 도착역 이름 예시와 지원 노선 문구 */
  placeholder: Label
  unknownStation: Label
  noStepFree: Label
  /** 길 잃음: 버튼으로 고르는 위치 */
  manualPlaces: { id: string; label: Label }[]
  /** 길 잃음: 출구 번호 버튼 → 그 출구 안쪽 위치 */
  exitSpots: { n: string; node: string }[]
  /** 표지판 샘플 사진(public/samples) */
  samples: string[]
  /** 서버 편의시설 API 조회 역명 */
  facilityStation: string
}

const LINE_COLORS = { '1': '#0052A4', '5': '#996CAC', '7': '#747F00' }

export const PROFILES: Record<StationProfile['id'], StationProfile> = {
  gunja: {
    id: 'gunja',
    station: gunja as Station,
    destinations: DESTINATIONS,
    floorButtons: {
      B1: { ko: '지상·B1', en: 'Street·B1' },
      B2_5: { ko: 'B2 5호선', en: 'B2 L5' },
      B2_7: { ko: 'B2 7호선', en: 'B2 L7' },
      B3: { ko: 'B3', en: 'B3' },
    },
    floorShort: {
      G: { ko: '지상', en: 'Street' },
      B1: { ko: 'B1', en: 'B1' },
      B2_5: { ko: 'B2', en: 'B2' },
      B2_7: { ko: 'B2', en: 'B2' },
      B3: { ko: 'B3', en: 'B3' },
    },
    mergedFloors: [['G', 'B1']],
    hiddenFloorButtons: ['G'],
    elevatorExits: ['exit4', 'exit7'],
    platformOrigins: [
      { id: 'board5_w', label: { ko: '5호선 승강장', en: 'Line 5 platform' } },
      { id: 'board7_w', label: { ko: '7호선 어린이대공원 방면 승강장', en: "Line 7 platform · to Children's Grand Park" } },
      { id: 'board7_e', label: { ko: '7호선 중곡 방면 승강장', en: 'Line 7 platform · to Junggok' } },
    ],
    lineColors: LINE_COLORS,
    placeholder: { ko: '역 이름 (예: 광화문, Konkuk)', en: 'Station name (e.g. Gwanghwamun)' },
    unknownStation: { ko: '5·7호선 역만 찾을 수 있어요. 역 이름을 확인해 주세요.', en: 'Only Line 5 and Line 7 stations are supported. Please check the name.' },
    noStepFree: {
      ko: '이 출구에는 엘리베이터가 없어요. 엘리베이터가 있는 4번 또는 7번 출구를 이용하세요.',
      en: 'This exit has no elevator. Please use Exit 4 or Exit 7, which have elevators.',
    },
    manualPlaces: [
      { id: 'p5_c', label: { ko: '5호선 승강장', en: 'Line 5 platform' } },
      { id: 'board7_e', label: { ko: '7호선 승강장 (중곡 방면)', en: 'Line 7 platform (to Junggok)' } },
      { id: 'board7_w', label: { ko: '7호선 승강장 (어린이대공원 방면)', en: "Line 7 platform (to Children's Grand Park)" } },
      { id: 'gate_w', label: { ko: '5호선 개찰구 (1·2·7·8번 출구 쪽)', en: 'Line 5 gates (Exits 1·2·7·8)' } },
      { id: 'gate_e', label: { ko: '5호선 개찰구 (3·4·5·6번 출구 쪽)', en: 'Line 5 gates (Exits 3·4·5·6)' } },
      { id: 'gate_7', label: { ko: '7호선 개찰구', en: 'Line 7 gates' } },
    ],
    exitSpots: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n: String(n), node: `x${n}_bot` })),
    samples: ['t1_exit4_entrance', 't2_exit4_station', 't6_gate7', 't7_exit34_pillar'],
    facilityStation: '군자',
  },
  dobongsan: {
    id: 'dobongsan',
    station: dobongsan as Station,
    destinations: DOBONGSAN_DESTINATIONS,
    floorButtons: {
      F1: { ko: '1F 7호선 대합실·1호선', en: '1F L7 hall·L1' },
      F2: { ko: '2F 7호선 승강장·1호선 대합실', en: '2F L7 platforms·L1 hall' },
    },
    floorShort: { F1: { ko: '1F', en: '1F' }, F2: { ko: '2F', en: '2F' } },
    mergedFloors: [],
    hiddenFloorButtons: [],
    elevatorExits: ['exit1', 'exit1-1', 'exit2', 'exit3'],
    platformOrigins: [
      { id: 'board7_jangam', label: { ko: '7호선 장암 방면 승강장', en: 'Line 7 platform · to Jangam' } },
      { id: 'board7_suraksan', label: { ko: '7호선 수락산 방면 승강장', en: 'Line 7 platform · to Suraksan' } },
      { id: 'board1_dobong', label: { ko: '1호선 승강장 (도봉 방면)', en: 'Line 1 platform · to Dobong' } },
      { id: 'board1_mangwolsa', label: { ko: '1호선 승강장 (망월사 방면)', en: 'Line 1 platform · to Mangwolsa' } },
    ],
    lineColors: LINE_COLORS,
    placeholder: { ko: '역 이름 (예: 노원, 의정부, 서울역)', en: 'Station name (e.g. Nowon, Seoul Station)' },
    unknownStation: { ko: '1·7호선 역만 찾을 수 있어요. 역 이름을 확인해 주세요.', en: 'Only Line 1 and Line 7 stations are supported. Please check the name.' },
    noStepFree: { ko: '계단 없는 경로를 찾지 못했어요.', en: 'No step-free route found.' },
    manualPlaces: [
      { id: 'board7_jangam', label: { ko: '7호선 승강장 (장암 방면)', en: 'Line 7 platform (to Jangam)' } },
      { id: 'board7_suraksan', label: { ko: '7호선 승강장 (수락산 방면)', en: 'Line 7 platform (to Suraksan)' } },
      { id: 'board1_dobong', label: { ko: '1호선 승강장', en: 'Line 1 platform' } },
      { id: 'gate_7w', label: { ko: '7호선 개찰구 (장암 쪽)', en: 'Line 7 gates (Jangam side)' } },
      { id: 'gate_7e', label: { ko: '7호선 개찰구 (수락산 쪽)', en: 'Line 7 gates (Suraksan side)' } },
      { id: 'gate_1', label: { ko: '1호선 개찰구 (2층 대합실)', en: 'Line 1 gates (2F)' } },
    ],
    exitSpots: [
      { n: '1', node: 'x1_top' },
      { n: '1-1', node: 'x11_bot' },
      { n: '2', node: 'exit2' },
      { n: '3', node: 'x3_top' },
    ],
    samples: [],
    facilityStation: '도봉산',
  },
}

/** URL 쿼리 ?station=...으로 고른 역. 없거나 모르는 값이면 군자역 */
export function currentProfile(search = typeof location !== 'undefined' ? location.search : ''): StationProfile {
  const id = new URLSearchParams(search).get('station')
  return id && id in PROFILES ? PROFILES[id as StationProfile['id']] : PROFILES.gunja
}
