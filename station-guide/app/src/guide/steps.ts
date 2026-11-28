// 경로(노드·간선 목록)를 사람이 따라갈 수 있는 안내 단계로 나눈다.
// 한 단계 = "다음 확인 지점까지 가는 일" 하나. 사용자가 "도착했어요"를 누르면 다음 단계로 넘어간다.
import { distance, nodePosition } from '../station/graph'
import { nearestDoor } from '../station/doors'
import type { Route } from '../station/route'
import type { EdgeKind, Label, Station, StationNode } from '../station/types'

export type StepKind = 'walk' | 'gate' | 'ticket' | 'move' | 'arrive'

/** 이 거리(m) 이상 걸으면 중간 지점에서 단계를 나눈다 */
const LONG_WALK = 70
/** 이름 있는 지점이 없어도 이 거리(m)를 넘으면 끊는다 */
const MAX_WALK = 100

/** 같은 층에서 가장 가까운 이름 있는 지점(비켜 가는 지점·계단 입구 제외, 15m 안) */
function nearestNamed(station: Station, n: StationNode): StationNode | null {
  let best: StationNode | null = null
  let bestD = 15
  for (const o of station.nodes) {
    if (o.floor !== n.floor || o.type === 'waypoint' || o.type === 'landing' || o.type === 'junction') continue
    const d = Math.hypot(o.pos[0] - n.pos[0], o.pos[1] - n.pos[1])
    if (d < bestD) [best, bestD] = [o, d]
  }
  return best
}

export type Step = {
  kind: StepKind
  title: Label
  /** 보조 설명(어떤 계단인지 등) */
  detail?: Label
  /** 따라갈 표지판 문구 */
  sign?: Label
  /** 이동 수단(층 이동 단계) */
  via?: EdgeKind
  /** route.nodeIds 안에서 이 단계가 다루는 구간 [from, to] (포함) */
  from: number
  to: number
  /** 이 단계에서 걷는 거리(m) */
  distance: number
  /** 타는 곳 도착 단계: 기다릴 문(안전문 위 칸-문 번호) */
  door?: string
  /** 앞 단계를 마친 방향 기준으로 처음 어느 쪽으로 가야 하는지(계단에서 내린 뒤, 개찰구를 지난 뒤 등) */
  turn?: { label: Label; arrow: string }
  /** 단계 끝에서 주변에 보여야 할 것(맞게 왔는지 확인용) */
  landmarks?: Label[]
  /** 엘리베이터 단계: 누를 층 버튼 */
  press?: string
}

const KIND: Record<EdgeKind, Label> = {
  walk: { ko: '걷기', en: 'walk' },
  stairs: { ko: '계단', en: 'stairs' },
  escalator: { ko: '에스컬레이터', en: 'escalator' },
  elevator: { ko: '엘리베이터', en: 'elevator' },
}

const josaRo = (word: string) => {
  // "계단으로", "에스컬레이터로", "엘리베이터로"
  const last = word.charCodeAt(word.length - 1)
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 && (last - 0xac00) % 28 !== 8
  return hasFinal ? '으로' : '로'
}

function walkPrefix(d: number): Label {
  if (d < 8) return { ko: '', en: '' }
  const m = Math.round(d / 5) * 5
  return { ko: `약 ${m}m 걸어가서 `, en: `Walk about ${m} m, then ` }
}

/** 영어 문장: 앞에 "Walk about N m, then "이 붙으면 그대로, 없으면 첫 글자를 대문자로 */
function en(prefix: string, rest: string) {
  return prefix ? prefix + rest : rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** 목적지 쪽 표지판 문구 */
function signFor(target: StationNode, transferring: boolean): Label | undefined {
  if (target.type === 'boarding' && target.line) {
    return transferring
      ? { ko: `갈아타는 곳 ${target.line}호선`, en: `Transfer · Line ${target.line}` }
      : { ko: `타는 곳 ${target.line}호선`, en: `To trains · Line ${target.line}` }
  }
  if (target.type === 'exit') {
    const n = target.id.replace('exit', '')
    return { ko: `나가는 곳 ${n}`, en: `Exit ${n}` }
  }
  return undefined
}

export type StepOptions = {
  /** 출발할 때 바라보는 방향과 그 말(예: 열차에서 내려 승강장 안쪽을 볼 때) */
  startHeading?: [number, number]
  startContext?: Label
}

export function buildSteps(station: Station, route: Route, opts: StepOptions = {}): Step[] {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const floor = new Map(station.floors.map((f) => [f.id, f]))
  const nodes = route.nodeIds.map((id) => byId.get(id)!)
  const pos = nodes.map((n) => nodePosition(station, n))
  const start = nodes[0]
  const target = nodes[nodes.length - 1]
  // 승강장에서 출발했으면 이미 개찰구 안에 있다
  // 개찰구에서 출발하면(출발 개찰구는 지나간 것으로 치지 않음) 첫 걸음이 향하는 쪽에 있는 것으로 본다
  let inside = start.type === 'gate' && nodes[1] ? isInsideGates(station, nodes[1].id) : isInsideGates(station, start.id)
  const transferring = start.type === 'boarding' && target.type === 'boarding'
  const sign = signFor(target, transferring)

  const steps: Step[] = []
  let segStart = 0
  let walked = 0

  for (let i = 0; i < route.edges.length; i++) {
    const e = route.edges[i]
    const a = nodes[i]
    const b = nodes[i + 1]

    if (e.kind === 'walk') {
      walked += distance(pos[i], pos[i + 1])
      const nextIsWalk = route.edges[i + 1]?.kind === 'walk'
      // 이름 있는 연결점이나 엘리베이터 앞(눈에 띄는 확인 지점)에서 끊는다
      // 앞으로 남은 걷기(다음 층 이동이나 목적지까지)를 더하면 너무 길어지면 70m 전이라도 끊는다
      let rest = 0
      for (let k = i + 1; k < route.edges.length && route.edges[k].kind === 'walk'; k++) rest += distance(pos[k], pos[k + 1])
      const tooLong = walked >= 40 && walked + rest > 140
      // 이름 없는 비켜 가는 지점이라도 너무 오래 걸었거나 이대로면 너무 길어지면 가까운 표식 이름으로 끊는다
      const near = b.type === 'waypoint' && (walked >= MAX_WALK || tooLong) ? nearestNamed(station, b) : null
      if ((walked >= LONG_WALK || tooLong) && (b.type === 'junction' || b.type === 'elevator' || b.type === 'boarding' || near) && nextIsWalk && b.id !== target.id) {
        // 긴 걷기는 이름 있는 중간 지점에서 끊어 확인받는다
        const p = walkPrefix(walked)
        const name = near ? { ko: `${near.label.ko} 옆`, en: `${near.label.en} (beside)` } : b.label
        steps.push({
          kind: 'walk',
          title: { ko: `${p.ko}${name.ko}까지 가세요`, en: en(p.en, `go to the ${name.en.charAt(0).toLowerCase()}${name.en.slice(1)}`) },
          sign,
          from: segStart,
          to: i + 1,
          distance: walked,
        })
        segStart = i + 1
        walked = 0
      } else if (b.type === 'gate' && b.id !== target.id) {
        const p = walkPrefix(walked)
        const entering = !inside
        inside = !inside
        steps.push({
          kind: 'gate',
          title: entering
            ? { ko: `${p.ko}${b.label.ko}에서 교통카드를 찍고 들어가세요`, en: en(p.en, `tap your card at the ${b.label.en}`) }
            : { ko: `${p.ko}${b.label.ko}에서 교통카드를 찍고 나가세요`, en: en(p.en, `tap your card to leave at the ${b.label.en}`) },
          sign,
          from: segStart,
          to: i + 1,
          distance: walked,
        })
        segStart = i + 1
        walked = 0
      } else if (b.type === 'ticket' && b.id !== target.id) {
        const p = walkPrefix(walked)
        steps.push({
          kind: 'ticket',
          title: { ko: `${p.ko}승차권 발매기로 가서 1회용 교통카드를 사세요`, en: en(p.en, 'buy a single-journey ticket at the ticket machine') },
          detail: b.label,
          from: segStart,
          to: i + 1,
          distance: walked,
        })
        segStart = i + 1
        walked = 0
      }
      continue
    }

    // 층 이동: 연속된 엘리베이터 구간은 한 단계로
    let j = i
    while (e.kind === 'elevator' && route.edges[j + 1]?.kind === 'elevator') j++
    const fromFloor = floor.get(a.floor)!
    const end = nodes[j + 1]
    const toFloor = floor.get(end.floor)!
    const up = toFloor.y > fromFloor.y
    const k = KIND[e.kind]
    const isLast = j + 1 === nodes.length - 1
    const toWhere: Label = isLast && end.type === 'exit' ? end.label : toFloor.label
    const what: Label = e.kind === 'elevator' ? a.label : byId.get(route.nodeIds[i])!.type === 'landing' ? landingName(a) : landingName(b)
    // 층을 넘기 전에 끊는다: 같은 층에서 계단·엘리베이터 입구까지 걷는 단계를 따로 둬서
    // 한 단계가 한 층만 다루게 한다(짧은 걸음은 이동 단계에 합침)
    if (segStart < i && walked >= 8) {
      const wp = walkPrefix(walked)
      steps.push({
        kind: 'walk',
        title:
          e.kind === 'elevator'
            ? { ko: `${wp.ko}엘리베이터 앞으로 가세요`, en: en(wp.en, 'go to the elevator') }
            : { ko: `${wp.ko}${k.ko} ${up ? '올라가는' : '내려가는'} 곳으로 가세요`, en: en(wp.en, `go to the ${k.en} ${up ? 'up' : 'down'}`) },
        detail: what,
        sign: isLast ? undefined : sign,
        from: segStart,
        to: i,
        distance: walked,
      })
      segStart = i
      walked = 0
    }
    const p = walkPrefix(walked)
    steps.push({
      kind: 'move',
      via: e.kind,
      title: {
        ko: `${p.ko}${k.ko}${josaRo(k.ko)} ${toWhere.ko}까지 ${up ? '올라가세요' : '내려가세요'}`,
        en: en(p.en, `take the ${k.en} ${up ? 'up' : 'down'} to ${toWhere.en}`),
      },
      detail: what,
      sign: isLast ? undefined : sign,
      from: segStart,
      to: j + 1,
      distance: walked,
    })
    segStart = j + 1
    walked = 0
    i = j
  }

  // 마지막 걷기 구간 → 도착 단계
  if (segStart < nodes.length - 1) {
    const p = walkPrefix(walked)
    steps.push({
      kind: 'arrive',
      title:
        target.type === 'boarding'
          ? { ko: `${p.ko}${target.label.ko}에 도착하세요`, en: en(p.en, `go to the platform: ${target.label.en}`) }
          : { ko: `${p.ko}${target.label.ko}(으)로 가세요`, en: en(p.en, `go to ${target.label.en}`) },
      detail: target.direction,
      ...(target.type === 'boarding' ? { door: nearestDoor(target.id, target.pos)?.id } : {}),
      from: segStart,
      to: nodes.length - 1,
      distance: walked,
    })
  }
  annotate(station, route, steps, opts)
  return steps
}

/** 엘리베이터 안 층 버튼 이름 */
const PRESS: Record<string, string> = { G: '1', B1: 'B1', B2_5: 'B2', B2_7: 'B2', B3: 'B3' }
/** 확인용 표식이 될 시설과 짧은 이름 */
const LANDMARK: Partial<Record<StationNode['type'], (n: StationNode) => Label>> = {
  toilet: () => ({ ko: '화장실', en: 'toilets' }),
  info: () => ({ ko: '고객안전실', en: 'information desk' }),
  ticket: () => ({ ko: '승차권 발매기', en: 'ticket machines' }),
  gate: () => ({ ko: '개찰구', en: 'ticket gates' }),
  elevator: () => ({ ko: '엘리베이터', en: 'elevator' }),
  sign: () => ({ ko: '역 안내도', en: 'station map board' }),
}
const LANDMARK_RANGE = 15

/**
 * 방향 전환: 진행 방향(앞 단계에서 마지막으로 움직인 방향) 대비 다음 걸음의 각도.
 * 좌표계 x = 동, z = 남이므로 h × v = h.x·v.z − h.z·v.x > 0 이면 오른쪽.
 */
function turnOf(h: [number, number], v: [number, number]): { ko: string; en: string; arrow: string } {
  const ang = (Math.atan2(h[0] * v[1] - h[1] * v[0], h[0] * v[0] + h[1] * v[1]) * 180) / Math.PI
  const a = Math.abs(ang)
  const right = ang > 0
  if (a < 30) return { ko: '앞으로 곧장 가세요', en: 'go straight ahead', arrow: '⬆️' }
  if (a < 60) return right ? { ko: '오른쪽 앞으로 가세요', en: 'bear right', arrow: '↗️' } : { ko: '왼쪽 앞으로 가세요', en: 'bear left', arrow: '↖️' }
  if (a < 135) return right ? { ko: '오른쪽으로 도세요', en: 'turn right', arrow: '➡️' } : { ko: '왼쪽으로 도세요', en: 'turn left', arrow: '⬅️' }
  return { ko: '뒤로 돌아서 가세요', en: 'turn around', arrow: '⬇️' }
}

function annotate(station: Station, route: Route, steps: Step[], opts: StepOptions = {}) {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const nodes = route.nodeIds.map((id) => byId.get(id)!)
  const dir = (i: number, j: number): [number, number] | null => {
    const dx = nodes[j].pos[0] - nodes[i].pos[0]
    const dz = nodes[j].pos[1] - nodes[i].pos[1]
    const l = Math.hypot(dx, dz)
    return l < 0.5 ? null : [dx / l, dz / l]
  }
  /** 앞 단계를 마치고 서 있는 방향과, 그걸 말로 하면 */
  let heading: [number, number] | null = opts.startHeading ?? null
  let context: Label | null = opts.startContext ?? null
  for (const s of steps) {
    // 이 단계 첫 걸음 방향
    if (heading && context && s.kind !== 'move' && route.edges[s.from]?.kind === 'walk') {
      let first: [number, number] | null = null
      for (let i = s.from; i < s.to && !first; i++) first = dir(i, i + 1)
      if (first) {
        const t = turnOf(heading, first)
        s.turn = { label: { ko: `${context.ko} ${t.ko}`, en: `${context.en}, ${t.en}` }, arrow: t.arrow }
      }
    }
    // 단계 끝 확인용 표식
    const end = nodes[s.to]
    const near = station.nodes
      .filter((n) => n.floor === end.floor && n.id !== end.id && LANDMARK[n.type])
      .map((n) => ({ n, d: Math.hypot(n.pos[0] - end.pos[0], n.pos[1] - end.pos[1]) }))
      .filter((x) => x.d <= LANDMARK_RANGE)
      .sort((a, b) => a.d - b.d)
    const seen = new Set<string>()
    const marks: Label[] = []
    for (const { n } of near) {
      const l = LANDMARK[n.type]!(n)
      if (seen.has(l.ko)) continue
      seen.add(l.ko)
      marks.push(l)
      if (marks.length >= 3) break
    }
    if (marks.length) s.landmarks = marks
    // 엘리베이터: 누를 버튼
    if (s.kind === 'move' && s.via === 'elevator') s.press = end.press ?? PRESS[end.floor]

    // 이 단계를 마친 뒤 향하는 방향
    const last = route.edges[s.to - 1]
    if (s.kind === 'move') {
      const k = last.kind
      heading = k === 'elevator' ? null : dir(s.to - 1, s.to)
      const up = (station.floors.find((f) => f.id === nodes[s.to].floor)!.y ?? 0) > (station.floors.find((f) => f.id === nodes[s.to - 1].floor)!.y ?? 0)
      context =
        k === 'stairs'
          ? up ? { ko: '계단을 올라오면', en: 'At the top of the stairs' } : { ko: '계단을 내려오면', en: 'At the bottom of the stairs' }
          : k === 'escalator'
            ? { ko: '에스컬레이터에서 내리면', en: 'Off the escalator' }
            : null
    } else if (s.kind === 'gate') {
      heading = dir(s.to - 1, s.to)
      context = { ko: '개찰구를 지나면', en: 'Past the gates' }
    } else if (s.kind === 'ticket') {
      heading = null // 발매기 앞에서는 기계를 보고 서 있으므로 방향을 말하지 않는다
      context = null
    } else {
      heading = dir(s.to - 1, s.to)
      context = { ko: '여기서', en: 'From here' }
    }
  }
}

/**
 * 경로가 개찰구를 두 번 넘는지(개찰구 밖 → 안 → 밖). 개찰구 밖 구역이 서로 이어지지 않은 역(도봉산 1-1번 출구 등)에서
 * 출구끼리 갈 때 생긴다. 요금을 내고 지나가게 되므로 안내하지 않고 역 밖 길을 쓰라고 한다.
 */
export function crossesPaidArea(station: Station, route: Route): boolean {
  const gates = new Set(station.nodes.filter((n) => n.type === 'gate').map((n) => n.id))
  return route.nodeIds.slice(1).filter((id) => gates.has(id)).length >= 2
}

/** 개찰구를 지나지 않고 승강장에 닿을 수 있으면 개찰구 안쪽이다 */
export function isInsideGates(station: Station, nodeId: string): boolean {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  if (byId.get(nodeId)?.type === 'gate') return false
  const adj = new Map<string, string[]>()
  for (const e of station.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from])
  }
  const seen = new Set([nodeId])
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    if (byId.get(cur)?.type === 'boarding') return true
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next) || byId.get(next)?.type === 'gate') continue
      seen.add(next)
      stack.push(next)
    }
  }
  return false
}

/** "7호선 갈아타는 계단 (가운데) (위)" → "7호선 갈아타는 계단 (가운데)" */
function landingName(n: StationNode): Label {
  return {
    ko: n.label.ko.replace(/ \((위|아래)\)$/, ''),
    en: n.label.en.replace(/ \((top|bottom)\)$/, ''),
  }
}
