// 역 구조 데이터 스키마.
// 좌표계: x = 동(+)/서(-), z = 남(+)/북(-), y = 높이(m, 지하는 음수). 평면 좌표 pos는 [x, z].

export type Label = { ko: string; en: string }

export type Floor = {
  id: string
  label: Label
  /** 바닥 높이(m). 지면 = 0 */
  y: number
}

export type AreaKind = 'ground' | 'concourse' | 'paid' | 'platform' | 'passage' | 'track'

export type Area = {
  id: string
  floor: string
  kind: AreaKind
  label: Label
  /** 호선 번호(승강장 색 지정용) */
  line?: string
  polygon: [number, number][]
}

export type NodeType =
  | 'exit'
  | 'junction'
  | 'landing'
  | 'gate'
  | 'ticket'
  | 'toilet'
  | 'info'
  | 'elevator'
  | 'boarding'
  | 'sign'
  /** 구조물을 비켜 가는 자동 지점(화면에 그리지 않음) */
  | 'waypoint'

export type StationNode = {
  id: string
  type: NodeType
  floor: string
  pos: [number, number]
  label: Label
  /** 탑승 지점: 호선과 방면 */
  line?: string
  direction?: Label
  /** 편의시설 API 시설번호(fcltNo) 등 외부 데이터 연결 키 */
  facilityRef?: string
  /** 엘리베이터: 이 층에서 누를 버튼 이름(층마다 표기가 다른 엘리베이터용, 없으면 역 기본값) */
  press?: string
}

export type EdgeKind = 'walk' | 'stairs' | 'escalator' | 'elevator'

export type StationEdge = {
  from: string
  to: string
  kind: EdgeKind
  /** 트인 공간에서 곧장 걷는 연결(자동 생성, 3D 점선으로 그리지 않음) */
  open?: boolean
  /** true면 from → to 방향으로만 이동 가능 */
  oneway?: boolean
  /** 이 구간을 이루는 시설(편의시설 API fcltNo). 모두 쓸 수 없으면 경로에서 뺀다 */
  facilityRefs?: string[]
  /** 계단·에스컬레이터 폭(m), 3D 표현용 */
  width?: number
}

export type Station = {
  id: string
  name: Label
  note?: string
  sources?: string[]
  floors: Floor[]
  areas: Area[]
  nodes: StationNode[]
  edges: StationEdge[]
}
