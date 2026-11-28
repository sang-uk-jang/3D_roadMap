// 도봉산역에서 탈 수 있는 1·7호선의 방면별 역 목록(도봉산에서 가까운 순).
// 7호선: 서울교통공사 노선도 순서(lines.ts와 같은 목록을 뒤집어 씀).
// 1호선(코레일): 역 순서는 노선도 기준, 서울역·구로 이후 갈래(인천·신창·광명·서동탄)는 넣지 않았다. 영문 표기는 확인이 더 필요함.
import { L7_NORTH, L7_SOUTH, make, type Destination, type Raw } from './lines'

const upToDobongsan = L7_NORTH.slice(0, L7_NORTH.findIndex(([ko]) => ko === '도봉산'))
const L7_TO_SURAKSAN: Raw[] = [...upToDobongsan].reverse().concat([['군자', 'Gunja']], L7_SOUTH)
const L7_TO_JANGAM: Raw[] = [['장암', 'Jangam']]

const L1_TO_MANGWOLSA: Raw[] = [
  ['망월사', 'Mangwolsa'], ['회룡', 'Hoeryong'], ['의정부', 'Uijeongbu'], ['가능', 'Ganeung'], ['녹양', 'Nogyang'],
  ['양주', 'Yangju'], ['덕계', 'Deokgye'], ['덕정', 'Deokjeong'], ['지행', 'Jihaeng'], ['동두천중앙', 'Dongducheon Jungang'],
  ['보산', 'Bosan'], ['동두천', 'Dongducheon'], ['소요산', 'Soyosan'], ['초성리', 'Choseong-ri'], ['한탄강', 'Hantangang'],
  ['전곡', 'Jeongok'], ['연천', 'Yeoncheon'],
]
const L1_TO_DOBONG: Raw[] = [
  ['도봉', 'Dobong'], ['방학', 'Banghak'], ['창동', 'Chang-dong'], ['녹천', 'Nokcheon'], ['월계', 'Wolgye'],
  ['광운대', 'Kwangwoon Univ.'], ['석계', 'Seokgye'], ['신이문', 'Sinimun'], ['외대앞', 'Hankuk Univ. of Foreign Studies'],
  ['회기', 'Hoegi'], ['청량리', 'Cheongnyangni'], ['제기동', 'Jegi-dong'], ['신설동', 'Sinseol-dong'], ['동묘앞', 'Dongmyo'],
  ['동대문', 'Dongdaemun'], ['종로5가', 'Jongno 5-ga'], ['종로3가', 'Jongno 3-ga'], ['종각', 'Jonggak'], ['서울역', 'Seoul Station'],
  ['남영', 'Namyeong'], ['용산', 'Yongsan'], ['노량진', 'Noryangjin'], ['대방', 'Daebang'], ['신길', 'Singil'],
  ['영등포', 'Yeongdeungpo'], ['신도림', 'Sindorim'], ['구로', 'Guro'],
]

export const DOBONGSAN_DESTINATIONS: Destination[] = [
  ...make(L7_TO_JANGAM, '7', 'board7_jangam'),
  ...make(L7_TO_SURAKSAN, '7', 'board7_suraksan'),
  ...make(L1_TO_MANGWOLSA, '1', 'board1_mangwolsa'),
  ...make(L1_TO_DOBONG, '1', 'board1_dobong'),
]
