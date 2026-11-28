import { Bounds, Html, Line, MapControls, useBounds } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { nodePosition, type Vec3 } from '../station/graph'
import type { Route } from '../station/route'
import type { Area, AreaKind, NodeType, Station } from '../station/types'
import { baseBoarding, doorsOf, nearestDoor, sidesFor } from '../station/doors'
import type { StationProfile } from '../stations/profile'
import { ElevatorShaft, Escalator, ExitCanopy, FacilityPost, GateRow, PaidFence, PlatformDoors, Stairs, TicketMachines, Train, useElevatorShafts } from './Structures'

const LINE_COLOR: Record<string, string> = { '1': '#0052A4', '5': '#996CAC', '7': '#747F00' }
const AREA_COLOR: Record<AreaKind, string> = {
  ground: '#d9dde2',
  concourse: '#8d96a3',
  paid: '#6f9bc8',
  passage: '#8d96a3',
  platform: '#7c8492',
  track: '#2f3742',
}
const NODE_COLOR: Record<NodeType, string> = {
  exit: '#f2c200',
  junction: '#8a94a3',
  landing: '#8a94a3',
  gate: '#3b82f6',
  ticket: '#ef4444',
  toilet: '#0ea5e9',
  info: '#0ea5e9',
  elevator: '#2fbf4a',
  boarding: '#111827',
  sign: '#f97316',
  waypoint: '#000000',
}
/** 항상 이름표를 보여줄 노드 */
const LABELED: NodeType[] = ['exit', 'boarding', 'gate', 'ticket', 'toilet', 'info']
/** 점으로 그리지 않을 노드(구조물로 표현되거나 단순 연결점) */
const HIDDEN_DOT: NodeType[] = ['junction', 'landing', 'elevator', 'exit', 'gate', 'ticket', 'toilet', 'info', 'boarding', 'waypoint']
/** 경로 밖일 때 쓰는 짧은 이름표 */
const SHORT_LABEL: Partial<Record<NodeType, { ko: string; en: string }>> = {
  gate: { ko: '개찰구', en: 'Gates' },
  ticket: { ko: '🎫 발매기', en: '🎫 Tickets' },
  toilet: { ko: '🚻 화장실', en: '🚻 Toilet' },
  info: { ko: 'ℹ️ 안내', en: 'ℹ️ Info' },
}

/** 평면 벡터를 가장 가까운 축 방향 단위 벡터로 */
function snap([x, z]: [number, number]): [number, number] {
  return Math.abs(x) >= Math.abs(z) ? [Math.sign(x) || 1, 0] : [0, Math.sign(z) || 1]
}

type Rect = { x0: number; x1: number; z0: number; z1: number }

/** 계단·에스컬레이터가 위층 바닥을 뚫고 내려가는 자리(평면 사각형)와 들어가는 쪽 */
type Opening = { floor: string; rect: Rect; entry: 'x0' | 'x1' | 'z0' | 'z1' }

function openingsOf(station: Station): Opening[] {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  const fy = new Map(station.floors.map((f) => [f.id, f.y]))
  const out: Opening[] = []
  for (const e of station.edges) {
    if (e.kind !== 'stairs' && e.kind !== 'escalator') continue
    let top = byId.get(e.from)!
    let bot = byId.get(e.to)!
    if (fy.get(top.floor)! < fy.get(bot.floor)!) [top, bot] = [bot, top]
    const h = (e.width ?? 3) / 2 + 0.3
    const [tx, tz] = top.pos
    const [bx, bz] = bot.pos
    const alongX = Math.abs(bx - tx) >= Math.abs(bz - tz)
    const rect = alongX
      ? { x0: Math.min(tx, bx), x1: Math.max(tx, bx), z0: tz - h, z1: tz + h }
      : { x0: tx - h, x1: tx + h, z0: Math.min(tz, bz), z1: Math.max(tz, bz) }
    const entry = alongX ? (bx > tx ? 'x0' : 'x1') : bz > tz ? 'z0' : 'z1'
    out.push({ floor: top.floor, rect, entry })
  }
  return out
}

function rectOf(poly: [number, number][]): Rect {
  return { x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), z0: Math.min(...poly.map((p) => p[1])), z1: Math.max(...poly.map((p) => p[1])) }
}

/** 구역 사각형 안으로 자른 구멍(가장자리에서 0.1m 안쪽). 너무 작으면 null */
function clipHole(r: Rect, area: Rect): Rect | null {
  const c = { x0: Math.max(r.x0, area.x0 + 0.1), x1: Math.min(r.x1, area.x1 - 0.1), z0: Math.max(r.z0, area.z0 + 0.1), z1: Math.min(r.z1, area.z1 - 0.1) }
  return c.x1 - c.x0 > 0.5 && c.z1 - c.z0 > 0.5 ? c : null
}

/** 구멍 둘레 난간: 들어가는 쪽만 비운다 */
function OpeningRail({ r, y, entry }: { r: Rect; y: number; entry: Opening['entry'] }) {
  const sides: { key: Opening['entry']; pos: [number, number, number]; size: [number, number, number] }[] = [
    { key: 'x0', pos: [r.x0, y + 0.5, (r.z0 + r.z1) / 2], size: [0.08, 1, r.z1 - r.z0] },
    { key: 'x1', pos: [r.x1, y + 0.5, (r.z0 + r.z1) / 2], size: [0.08, 1, r.z1 - r.z0] },
    { key: 'z0', pos: [(r.x0 + r.x1) / 2, y + 0.5, r.z0], size: [r.x1 - r.x0, 1, 0.08] },
    { key: 'z1', pos: [(r.x0 + r.x1) / 2, y + 0.5, r.z1], size: [r.x1 - r.x0, 1, 0.08] },
  ]
  return (
    <group>
      {sides
        .filter((s) => s.key !== entry)
        .map((s) => (
          <mesh key={s.key} position={s.pos}>
            <boxGeometry args={s.size} />
            <meshStandardMaterial color="#e5e7eb" transparent opacity={0.85} />
          </mesh>
        ))}
    </group>
  )
}

function AreaSlab({ area, y, highlight, solid, holes = [] }: { area: Area; y: number; highlight: boolean; solid: boolean; holes?: Rect[] }) {
  const holeKey = holes.map((h) => `${h.x0},${h.x1},${h.z0},${h.z1}`).join('|')
  const geometry = useMemo(() => {
    // Shape는 xy 평면 → x축 -90° 회전으로 xz 평면에 눕힘. (x, -z)로 넣어야 z 방향이 맞음
    const shape = new THREE.Shape(area.polygon.map(([x, z]) => new THREE.Vector2(x, -z)))
    // 계단이 내려가는 자리는 바닥에 구멍을 뚫는다
    for (const h of holes)
      shape.holes.push(new THREE.Path([new THREE.Vector2(h.x0, -h.z0), new THREE.Vector2(h.x0, -h.z1), new THREE.Vector2(h.x1, -h.z1), new THREE.Vector2(h.x1, -h.z0)]))
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.polygon, holeKey])
  const color = area.line ? LINE_COLOR[area.line] : AREA_COLOR[area.kind]
  // 가장 아래 보이는 층은 거의 불투명하게, 그 위 층은 아래가 비치게
  const opacity = area.kind === 'ground' ? 0.25 : solid ? (area.kind === 'track' ? 0.85 : 0.95) : area.kind === 'track' ? 0.3 : highlight ? 0.4 : 0.25
  return (
    <mesh geometry={geometry} position={[0, y - 0.4, 0]}>
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={solid && area.kind !== 'ground'} />
    </mesh>
  )
}

/** 경로가 바뀌면 경로 전체가 보이도록 카메라를 맞춘다. 경로가 없으면 역 중심부를 보여준다 */
function FitTo({ points, home }: { points: Vec3[] | null; home: THREE.Box3 }) {
  const bounds = useBounds()
  const key = points?.map((p) => p.join(',')).join('|') ?? ''
  useEffect(() => {
    const box = new THREE.Box3()
    if (points && points.length > 0) {
      for (const p of points) box.expandByPoint(new THREE.Vector3(...p))
    } else {
      box.copy(home)
    }
    // 너무 짧은 경로도 주변이 보이도록 최소 크기 보장
    // 점 하나(현재 위치)면 주변이 보이도록 더 넓게
    box.expandByScalar(points && points.length === 1 ? 25 : 8)
    bounds.refresh(box).fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/**
 * "내 앞" 시점: 지금 단계 출발점 뒤·위에서 첫 걸음 방향을 바라본다.
 * 화면의 왼쪽/오른쪽이 안내 문장의 왼쪽/오른쪽과 맞도록.
 */
function FollowCam({ pts, prev }: { pts: Vec3[]; prev?: Vec3 | null }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const camera = useThree((s) => s.camera)
  const key = pts.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (!controls || pts.length < 2) return
    const a = new THREE.Vector3(...pts[0])
    const b = new THREE.Vector3(...pts[pts.length - 1])
    // 바라보는 방향 = 지금 서 있는 방향(앞 단계에서 걸어온 방향). 그래야 화면의 왼쪽/오른쪽이 "왼쪽으로 도세요"와 맞다
    let first = new THREE.Vector3()
    for (let i = 1; i < pts.length; i++) {
      first = new THREE.Vector3(...pts[i]).sub(a)
      first.y = 0
      if (first.length() > 2) break
    }
    let d = new THREE.Vector3()
    if (prev) {
      d = a.clone().sub(new THREE.Vector3(...prev))
      d.y = 0
    }
    // 뒤로 돌아야 하는 경우(100° 넘게 꺾임)는 카메라가 방금 지나온 계단 위에 놓이므로, 돌아선 뒤의 방향으로 본다
    if (d.length() < 0.5 || (first.length() > 0.5 && d.clone().normalize().dot(first.clone().normalize()) < Math.cos((100 * Math.PI) / 180))) d = first
    if (d.length() < 0.1) d.set(0, 0, -1)
    d.normalize()
    const span = Math.max(12, Math.hypot(b.x - a.x, b.z - a.z))
    // 약 50° 내려다보는 각도: 계단·에스컬레이터 같은 가까운 구조물이 화면을 가리지 않도록 뒤로 조금, 위로 높게
    const back = Math.min(16, 6 + span * 0.2)
    const up = Math.min(26, 14 + span * 0.25)
    const target = a.clone().lerp(b, 0.55)
    const pos = a.clone().addScaledVector(d, -back).add(new THREE.Vector3(0, up, 0))
    camera.position.copy(pos)
    controls.target.copy(target)
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls])
  return null
}

export type SceneProps = {
  station: Station
  /** 역별 설정(엘리베이터 층 이름 등). 없으면 군자역 기본값 */
  profile?: StationProfile
  route: Route | null
  /** 지금 안내 중인 단계가 다루는 route.nodeIds 구간 [from, to] */
  active?: { from: number; to: number } | null
  /** 실시간으로 멈춘 시설(fcltNo) */
  unavailable?: string[]
  /** 경로가 없을 때 표시할 현재 위치(노드 id) */
  here?: string | null
  visibleFloors: Set<string>
  /** 카메라: 위에서 전체 / 내 앞(지금 단계 진행 방향) */
  view?: 'top' | 'front'
  /** 목적지 승강장 열차의 출발 시각(ms). 없으면 열차를 그리지 않는다 */
  departAt?: number | null
  lang: 'ko' | 'en'
}

export function StationScene({ station, profile, route, active, here, unavailable = [], visibleFloors, lang, departAt = null, view = 'top' }: SceneProps) {
  const down = new Set(unavailable)
  // 경로가 없을 때 처음 보여줄 범위: 역 중심부(군자역은 기존 값 유지)
  const home = useMemo(() => {
    if (station.id === 'gunja') return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, -10, 0), new THREE.Vector3(120, 20, 80))
    // 그 밖의 역: 승강장·대합실 범위의 가운데 60%(양 끝 계단까지 다 넣으면 너무 멀어 구조가 안 보인다)
    const all = new THREE.Box3()
    for (const a of station.areas) {
      if (a.kind === 'ground') continue
      const y = station.floors.find((f) => f.id === a.floor)!.y
      for (const [x, z] of a.polygon) all.expandByPoint(new THREE.Vector3(x, y, z))
    }
    const box = all.clone().expandByScalar(0)
    const c = all.getCenter(new THREE.Vector3())
    const size = all.getSize(new THREE.Vector3()).multiply(new THREE.Vector3(0.6, 1, 0.6))
    box.setFromCenterAndSize(c, size)
    return box
  }, [station])
  const floorShort = (id: string) => profile?.floorShort[id]?.[lang] ?? id
  const pos = useMemo(() => {
    const m = new Map<string, Vec3>()
    for (const n of station.nodes) m.set(n.id, nodePosition(station, n))
    return m
  }, [station])
  const floorY = useMemo(() => new Map(station.floors.map((f) => [f.id, f.y])), [station])
  const nodeFloor = useMemo(() => new Map(station.nodes.map((n) => [n.id, n.floor])), [station])
  const shafts = useElevatorShafts(station.edges, pos)
  // 계단·에스컬레이터가 내려가는 자리: 위층 바닥 구멍 + 난간
  const openings = useMemo(() => openingsOf(station), [station])
  const holesByArea = useMemo(() => {
    const m = new Map<string, Rect[]>()
    for (const a of station.areas) {
      const ar = rectOf(a.polygon)
      const hs = openings.filter((o) => o.floor === a.floor).map((o) => clipHole(o.rect, ar)).filter((h): h is Rect => !!h)
      if (hs.length) m.set(a.id, hs)
    }
    return m
  }, [station, openings])

  // 개찰구: 지나가는 방향(이웃 노드 방향을 한 축으로 모아 축에 맞춤). 발매기: 화면이 대합실 쪽을 보게
  const fixtures = useMemo(() => {
    const byId = new Map(station.nodes.map((n) => [n.id, n]))
    const neighbors = (id: string) =>
      station.edges.filter((e) => e.kind === 'walk' && (e.from === id || e.to === id)).map((e) => byId.get(e.from === id ? e.to : e.from)!)
    const gateAxis = new Map<string, 'x' | 'z'>()
    const ticketFace = new Map<string, [number, number]>()
    for (const n of station.nodes) {
      if (n.type === 'gate') {
        let sx = 0
        let sz = 0
        for (const o of neighbors(n.id)) {
          const dx = o.pos[0] - n.pos[0]
          const dz = o.pos[1] - n.pos[1]
          const l = Math.hypot(dx, dz) || 1
          sx += Math.abs(dx / l)
          sz += Math.abs(dz / l)
        }
        gateAxis.set(n.id, sx >= sz ? 'x' : 'z')
      }
      if (n.type === 'ticket') {
        const hall = neighbors(n.id).find((o) => o.type !== 'gate')
        ticketFace.set(n.id, hall ? snap([hall.pos[0] - n.pos[0], hall.pos[1] - n.pos[1]]) : [0, 1])
      }
    }
    const gatesByFloor = new Map<string, [number, number][]>()
    for (const n of station.nodes) if (n.type === 'gate') gatesByFloor.set(n.floor, [...(gatesByFloor.get(n.floor) ?? []), n.pos])
    return { gateAxis, ticketFace, gatesByFloor }
  }, [station])

  // 강조할 층: 단계 안내 중이면 지금 단계가 지나는 층, 아니면 경로 전체가 지나는 층
  const routeFloors = useMemo(() => {
    const ids = route ? (active ? route.nodeIds.slice(active.from, active.to + 1) : route.nodeIds) : []
    return new Set(ids.map((id) => nodeFloor.get(id)!))
  }, [route, active, nodeFloor])
  const onRoute = useMemo(() => new Set(route?.nodeIds ?? []), [route])
  const routeEdges = useMemo(() => new Set(route?.edges ?? []), [route])
  const show = (floor: string) => visibleFloors.has(floor)
  // 보이는 층 중 가장 아래층 바닥만 진하게(위층 바닥이 아래층을 가리지 않도록)
  const lowestFloor = station.floors.filter((f) => visibleFloors.has(f.id)).sort((a, b) => a.y - b.y)[0]?.id

  const routePoints = route?.nodeIds.map((id) => {
    const p = pos.get(id)!
    return [p[0], p[1] + 0.8, p[2]] as Vec3
  })
  // 단계 안내 중이면: 지난 구간(회색) / 지금 구간(빨강, 굵게) / 남은 구간(연한 빨강)
  // 보이는 층에 닿는 구간만 선으로 그린다(숨긴 층 위에 떠 있는 선 방지). 층 이동 구간은 한쪽 층만 보여도 그린다
  const runs = (from: number, to: number): Vec3[][] => {
    if (!route || !routePoints) return []
    const out: Vec3[][] = []
    let cur: Vec3[] = []
    for (let i = from; i < to; i++) {
      const fa = nodeFloor.get(route.nodeIds[i])!
      const fb = nodeFloor.get(route.nodeIds[i + 1])!
      const ok = route.edges[i].kind === 'walk' ? show(fa) && show(fb) : show(fa) || show(fb)
      if (ok) {
        if (cur.length === 0) cur.push(routePoints[i])
        cur.push(routePoints[i + 1])
      } else if (cur.length) {
        out.push(cur)
        cur = []
      }
    }
    if (cur.length) out.push(cur)
    return out
  }
  const donePts = active && routePoints ? routePoints.slice(0, active.from + 1) : null
  const activePts = active && routePoints ? routePoints.slice(active.from, active.to + 1) : null
  const nextPts = active && routePoints ? routePoints.slice(active.to) : null
  const stepEnd = active && route ? route.nodeIds[active.to] : null

  // 층 이름표: 층마다 구역 묶음의 북서쪽 모서리
  const floorCorners = useMemo(
    () =>
      station.floors.flatMap((f) => {
        const pts = station.areas.filter((a) => a.floor === f.id && a.kind !== 'ground').flatMap((a) => a.polygon)
        if (pts.length === 0) return []
        return [{ id: f.id, label: f.label, x: Math.min(...pts.map((p) => p[0])), z: Math.min(...pts.map((p) => p[1])), y: f.y }]
      }),
    [station],
  )
  // 승강장 문: 경로 끝(또는 시작)이 타는 곳이면 그 쪽 문 번호를 강조
  const routeEndId = route?.nodeIds.at(-1) ?? null
  // 문 앞 임시 타는 곳('board7_e@8-4')은 원래 타는 곳의 승강장 쪽으로 본다
  const routeEnd = routeEndId ? baseBoarding(routeEndId) : null
  const routeStart = route?.nodeIds[0] ? baseBoarding(route.nodeIds[0]) : null
  const byId = useMemo(() => new Map(station.nodes.map((n) => [n.id, n])), [station])
  const waitDoor = routeEndId && byId.get(routeEndId)?.type === 'boarding' ? nearestDoor(routeEndId, byId.get(routeEndId)!.pos) : null
  const sides = useMemo(() => sidesFor(station.id).filter((sd) => byId.has(sd.boarding)).map((sd) => ({ side: sd, doors: doorsOf(sd), node: byId.get(sd.boarding)! })), [byId, station.id])
  const herePos = here ? pos.get(here) ?? null : null
  const activeIds = active && route ? new Set(route.nodeIds.slice(active.from, active.to + 1)) : null

  return (
    <Canvas camera={{ position: [-110, 75, 130], fov: 40, near: 0.5, far: 3000 }}>
      <color attach="background" args={['#f4f5f7']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[60, 120, 80]} intensity={1.3} />
      {view === 'front' && activePts && activePts.length > 1 && <FollowCam pts={activePts} prev={active && routePoints && active.from > 0 ? routePoints[active.from - 1] : null} />}
      {/* 지도처럼: 한 손가락/왼쪽 끌기 = 이동, 두 손가락/오른쪽 끌기 = 회전, 휠/집기 = 확대 */}
      <MapControls makeDefault screenSpacePanning={false} maxPolarAngle={Math.PI / 2.1} />

      {station.areas
        .filter((a) => a.kind === 'ground' && show(a.floor))
        .map((a) => (
          <AreaSlab key={a.id} area={a} y={floorY.get(a.floor)!} highlight={false} solid={a.floor === lowestFloor} holes={holesByArea.get(a.id)} />
        ))}
      <Bounds margin={1.1}>
        {!(view === 'front' && activePts && activePts.length > 1) && <FitTo home={home} points={activePts ?? routePoints ?? (herePos ? [herePos] : null)} />}
      </Bounds>
      {station.areas
        .filter((a) => a.kind !== 'ground' && show(a.floor))
        .map((a) => (
          <AreaSlab key={a.id} area={a} y={floorY.get(a.floor)!} highlight={routeFloors.has(a.floor)} solid={a.floor === lowestFloor} holes={holesByArea.get(a.id)} />
        ))}
      {openings
        .filter((o) => show(o.floor) && o.floor !== 'G')
        .map((o, i) => (
          <OpeningRail key={`rail-${i}`} r={o.rect} y={floorY.get(o.floor)!} entry={o.entry} />
        ))}
      {/* 개찰구가 있는 층의 개찰구 안 구역 경계 울타리 */}
      {station.areas
        .filter((a) => a.kind === 'paid' && show(a.floor) && fixtures.gatesByFloor.has(a.floor))
        .map((a) => (
          <PaidFence key={`fence-${a.id}`} polygon={a.polygon} y={floorY.get(a.floor)!} gates={fixtures.gatesByFloor.get(a.floor)!} />
        ))}
      {floorCorners
        .filter((f) => show(f.id))
        .map((f) => (
          <Html key={`floor-${f.id}`} position={[f.x, f.y + 0.6, f.z]} zIndexRange={[5, 0]}>
            <div className={`floor-label${routeFloors.has(f.id) ? ' on' : ''}`}>{f.label[lang]}</div>
          </Html>
        ))}
      {sides
        .filter(({ node }) => show(node.floor))
        .map(({ side, doors, node }) => {
          const y = floorY.get(node.floor)!
          const isEnd = routeEnd === side.boarding
          const isRouteSide = isEnd || routeStart === side.boarding
          const transfer = new Set(side.transfer.doors)
          const wait = isEnd ? waitDoor?.id ?? null : null
          const color = LINE_COLOR[side.line]
          return (
            <group key={`doors-${side.boarding}`}>
              <PlatformDoors doors={doors} y={y} dir={side.dir} trackSide={side.trackSide} transfer={transfer} wait={wait} />
              {isRouteSide &&
                doors
                  .filter((d) => d.door === 1 || transfer.has(d.id) || d.id === wait)
                  .map((d) => {
                    const t = transfer.has(d.id)
                    const w = d.id === wait
                    return (
                      <Html key={d.id} center position={[d.pos[0] - side.trackSide[0] * 1.6, y + (w ? 2.6 : t ? 1.8 : 1), d.pos[1] - side.trackSide[1] * 1.6]} zIndexRange={[w ? 16 : 8, 0]}>
                        <div className={`door-label${t ? ' transfer' : ''}${w ? ' wait' : ''}`}>
                          {w ? `📍 ${d.id} ${lang === 'ko' ? '여기서 타요' : 'Board here'}` : t ? `${d.id} ${side.transfer.to[lang]}` : `${d.car}${lang === 'ko' ? '칸' : ''}`}
                        </div>
                      </Html>
                    )
                  })}
              {isEnd && departAt && (
                <>
                  <Train key={departAt} departAt={departAt} rest={[side.front[0] + side.trackSide[0] * 2.3, side.front[1] + side.trackSide[1] * 2.3]} y={y} dir={side.dir} color={color} />
                  <Html center position={[side.front[0] + side.trackSide[0] * 2.3 + side.dir[0] * 6, y + 5, side.front[1] + side.trackSide[1] * 2.3 + side.dir[1] * 6]} zIndexRange={[14, 0]}>
                    <div className="node-label train-label" style={{ borderColor: color }}>
                      🚆 {lang === 'ko' ? '열차 진행 방향' : 'Train direction'} → {node.direction?.[lang]}
                    </div>
                  </Html>
                </>
              )}
            </group>
          )
        })}

      {station.edges.map((e, i) => {
        if (!show(nodeFloor.get(e.from)!) && !show(nodeFloor.get(e.to)!)) return null
        const a = pos.get(e.from)!
        const b = pos.get(e.to)!
        const hl = routeEdges.has(e)
        if (e.kind === 'stairs') return <Stairs key={i} a={a} b={b} width={e.width} highlight={hl} />
        if (e.kind === 'escalator') {
          const refs = e.facilityRefs ?? []
          const stopped = refs.filter((r) => down.has(r)).length
          return <Escalator key={i} a={a} b={b} width={e.width} highlight={hl} stopped={stopped === 0 ? 'none' : stopped === refs.length ? 'all' : 'some'} lang={lang} />
        }
        if (e.kind === 'walk' && e.open) return null
        if (e.kind === 'walk')
          return (
            <Line key={i} points={[a, b].map((p) => [p[0], p[1] + 0.1, p[2]] as Vec3)} color="#9aa3af" lineWidth={1} dashed dashSize={1} gapSize={0.8} />
          )
        return null
      })}

      {shafts
        .filter((s) => [...s.nodes].some((id) => show(nodeFloor.get(id)!)))
        .map((s) => (
          <ElevatorShaft
            key={`${s.x},${s.z}`}
            {...s}
            highlight={[...s.nodes].some((id) => (activeIds ?? onRoute).has(id))}
            stopped={[...s.nodes].some((id) => !!byId.get(id)?.facilityRef && down.has(byId.get(id)!.facilityRef!))}
            showLabel={[...s.nodes].some((id) => onRoute.has(id) || (!!byId.get(id)?.facilityRef && down.has(byId.get(id)!.facilityRef!)))}
            label={`🛗 ${[...new Set([...s.nodes].map((id) => byId.get(id)?.press ?? floorShort(nodeFloor.get(id)!)))].join('·')}`}
          />
        ))}

      {station.nodes
        .filter((n) => show(n.floor))
        .map((n) => {
          const p = pos.get(n.id)!
          const on = onRoute.has(n.id)
          const isEnd = (route && (route.nodeIds[0] === n.id || route.nodeIds.at(-1) === n.id)) || n.id === stepEnd
          const labeled = LABELED.includes(n.type) || n.id === stepEnd || (on && !['junction', 'landing', 'elevator', 'waypoint'].includes(n.type))
          return (
            <group key={n.id}>
              {n.type === 'exit' && view !== 'front' && <ExitCanopy p={p} highlight={on} />}
              {n.type === 'gate' && <GateRow p={p} axis={fixtures.gateAxis.get(n.id)!} highlight={on} count={n.id.startsWith('gate_lift') ? 3 : 8} />}
              {n.type === 'ticket' && <TicketMachines p={p} face={fixtures.ticketFace.get(n.id)!} highlight={on} />}
              {(n.type === 'toilet' || n.type === 'info') && <FacilityPost p={p} color={n.type === 'toilet' ? '#0ea5e9' : '#2563eb'} icon={n.type === 'toilet' ? '🚻' : 'ℹ️'} highlight={on} />}
              {!HIDDEN_DOT.includes(n.type) && (
                <mesh position={[p[0], p[1] + 0.7, p[2]]}>
                  <sphereGeometry args={[on ? 0.5 : 0.35, 16, 12]} />
                  <meshStandardMaterial color={NODE_COLOR[n.type]} />
                </mesh>
              )}
              {labeled && (
                <Html center position={[p[0], p[1] + (n.type === 'exit' ? 5 : n.type === 'ticket' || n.type === 'toilet' || n.type === 'info' ? 4 : n.type === 'gate' ? 3 : 2.4), p[2]]} zIndexRange={[10, 0]}>
                  <div className={`node-label node-${n.type}${on ? ' on-route' : ''}${isEnd ? ' route-end' : ''}`}>
                    {!on && n.id !== stepEnd && SHORT_LABEL[n.type] ? SHORT_LABEL[n.type]![lang] : n.label[lang]}
                  </div>
                </Html>
              )}
            </group>
          )
        })}

      {herePos && (
        <group position={[herePos[0], herePos[1], herePos[2]]}>
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[1.6, 24, 16]} />
            <meshStandardMaterial color="#e11d48" emissive="#e11d48" emissiveIntensity={0.4} />
          </mesh>
          <Html center position={[0, 4.5, 0]} zIndexRange={[20, 0]}>
            <div className="node-label here-label">📍 {lang === 'ko' ? '현재 위치' : 'You are here'}</div>
          </Html>
        </group>
      )}
      {active ? (
        <>
          {donePts && runs(0, active.from).map((pts, i) => <Line key={`d${i}`} points={pts} color="#9ca3af" lineWidth={4} />)}
          {nextPts && runs(active.to, route!.nodeIds.length - 1).map((pts, i) => <Line key={`n${i}`} points={pts} color="#fda4af" lineWidth={3} />)}
          {activePts && runs(active.from, active.to).map((pts, i) => <Line key={`a${i}`} points={pts} color="#e11d48" lineWidth={8} />)}
        </>
      ) : (
        route && runs(0, route.nodeIds.length - 1).map((pts, i) => <Line key={`r${i}`} points={pts} color="#e11d48" lineWidth={6} />)
      )}
    </Canvas>
  )
}
