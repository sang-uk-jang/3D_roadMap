// 군자역에서 탈 수 있는 5·7호선의 방면별 역 목록(군자에서 가까운 순).
// 출처: 서울교통공사 사이버스테이션 노선도의 역 순서. 영문 표기는 확인이 더 필요함.
import type { Label } from '../station/types'

export type Destination = {
  name: Label
  line: string
  /** 군자역에서 탈 승강장(boarding 노드 id) */
  boarding: string
  /** 군자역에서 몇 번째 역인지 */
  stops: number
  /** 5호선 강동 이후 갈래: 'hanam'(하남검단산 방면) | 'macheon'(마천 방면) */
  branch?: 'hanam' | 'macheon'
}

export type Raw = [string, string]

const L5_WEST: Raw[] = [
  ['장한평', 'Janghanpyeong'], ['답십리', 'Dapsimni'], ['마장', 'Majang'], ['왕십리', 'Wangsimni'], ['행당', 'Haengdang'],
  ['신금호', 'Singeumho'], ['청구', 'Cheonggu'], ['동대문역사문화공원', 'Dongdaemun History & Culture Park'],
  ['을지로4가', 'Euljiro 4-ga'], ['종로3가', 'Jongno 3-ga'], ['광화문', 'Gwanghwamun'], ['서대문', 'Seodaemun'],
  ['충정로', 'Chungjeongno'], ['애오개', 'Aeogae'], ['공덕', 'Gongdeok'], ['마포', 'Mapo'], ['여의나루', 'Yeouinaru'],
  ['여의도', 'Yeouido'], ['신길', 'Singil'], ['영등포시장', 'Yeongdeungpo Market'], ['영등포구청', 'Yeongdeungpo-gu Office'],
  ['양평', 'Yangpyeong'], ['오목교', 'Omokgyo'], ['목동', 'Mok-dong'], ['신정', 'Sinjeong'], ['까치산', 'Kkachisan'],
  ['화곡', 'Hwagok'], ['우장산', 'Ujangsan'], ['발산', 'Balsan'], ['마곡', 'Magok'], ['송정', 'Songjeong'],
  ['김포공항', 'Gimpo Intl. Airport'], ['개화산', 'Gaehwasan'], ['방화', 'Banghwa'],
]
const L5_EAST_TRUNK: Raw[] = [['아차산', 'Achasan'], ['광나루', 'Gwangnaru'], ['천호', 'Cheonho'], ['강동', 'Gangdong']]
const L5_EAST_HANAM: Raw[] = [
  ['길동', 'Gil-dong'], ['굽은다리', 'Gubeundari'], ['명일', 'Myeongil'], ['고덕', 'Godeok'], ['상일동', 'Sangil-dong'],
  ['강일', 'Gangil'], ['미사', 'Misa'], ['하남풍산', 'Hanam Pungsan'], ['하남시청', 'Hanam City Hall'], ['하남검단산', 'Hanam Geomdansan'],
]
const L5_EAST_MACHEON: Raw[] = [
  ['둔촌동', 'Dunchon-dong'], ['올림픽공원', 'Olympic Park'], ['방이', 'Bangi'], ['오금', 'Ogeum'], ['개롱', 'Gaerong'],
  ['거여', 'Geoyeo'], ['마천', 'Macheon'],
]
export const L7_NORTH: Raw[] = [
  ['중곡', 'Junggok'], ['용마산', 'Yongmasan'], ['사가정', 'Sagajeong'], ['면목', 'Myeonmok'], ['상봉', 'Sangbong'],
  ['중화', 'Junghwa'], ['먹골', 'Meokgol'], ['태릉입구', 'Taereung'], ['공릉', 'Gongneung'], ['하계', 'Hagye'],
  ['중계', 'Junggye'], ['노원', 'Nowon'], ['마들', 'Madeul'], ['수락산', 'Suraksan'], ['도봉산', 'Dobongsan'], ['장암', 'Jangam'],
]
export const L7_SOUTH: Raw[] = [
  ['어린이대공원', "Children's Grand Park"], ['건대입구', 'Konkuk Univ.'], ['뚝섬유원지', 'Ttukseom Resort'], ['청담', 'Cheongdam'],
  ['강남구청', 'Gangnam-gu Office'], ['학동', 'Hakdong'], ['논현', 'Nonhyeon'], ['반포', 'Banpo'],
  ['고속터미널', 'Express Bus Terminal'], ['내방', 'Naebang'], ['이수', 'Isu'], ['남성', 'Namseong'],
  ['숭실대입구', 'Soongsil Univ.'], ['상도', 'Sangdo'], ['장승배기', 'Jangseungbaegi'], ['신대방삼거리', 'Sindaebang Samgeori'],
  ['보라매', 'Boramae'], ['신풍', 'Sinpung'], ['대림', 'Daerim'], ['남구로', 'Namguro'],
  ['가산디지털단지', 'Gasan Digital Complex'], ['철산', 'Cheolsan'], ['광명사거리', 'Gwangmyeong Sageori'], ['천왕', 'Cheonwang'],
  ['온수', 'Onsu'], ['까치울', 'Kkachiul'], ['부천종합운동장', 'Bucheon Stadium'], ['춘의', 'Chunui'], ['신중동', 'Sinjung-dong'],
  ['부천시청', 'Bucheon City Hall'], ['상동', 'Sang-dong'], ['삼산체육관', 'Samsan Gymnasium'], ['굴포천', 'Gulpocheon'],
  ['부평구청', 'Bupyeong-gu Office'], ['산곡', 'Sangok'], ['석남', 'Seongnam'],
]

export const make = (list: Raw[], line: string, boarding: string, offset = 0, branch?: Destination['branch']): Destination[] =>
  list.map(([ko, en], i) => ({ name: { ko, en }, line, boarding, stops: offset + i + 1, ...(branch ? { branch } : {}) }))

export const DESTINATIONS: Destination[] = [
  ...make(L5_WEST, '5', 'board5_w'),
  ...make(L5_EAST_TRUNK, '5', 'board5_e'),
  ...make(L5_EAST_HANAM, '5', 'board5_e', L5_EAST_TRUNK.length, 'hanam'),
  ...make(L5_EAST_MACHEON, '5', 'board5_e', L5_EAST_TRUNK.length, 'macheon'),
  ...make(L7_NORTH, '7', 'board7_e'),
  ...make(L7_SOUTH, '7', 'board7_w'),
]

export function findDestination(query: string): Destination | undefined {
  return findDestinationIn(DESTINATIONS, query)
}

/** 역 이름(한국어·영어, 앞부분만 써도 됨)으로 목적지를 찾는다 */
export function findDestinationIn(list: Destination[], query: string): Destination | undefined {
  const q = query.trim().toLowerCase().replace(/역$/, '').replace(/\s+station$/, '')
  if (!q) return undefined
  return (
    list.find((d) => d.name.ko === q || d.name.en.toLowerCase() === q) ??
    list.find((d) => d.name.ko.startsWith(q) || d.name.en.toLowerCase().startsWith(q))
  )
}
