import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import type { Vec3 } from '../station/graph'
import type { StationEdge } from '../station/types'

const STAIR_COLOR = '#cfd4db'
const STAIR_EDGE = '#9aa1ab'
const ESC_BODY = '#5b6470'
const ESC_RAIL = '#f2c200'
const ELEVATOR = '#2fbf4a'

/** 위 입구(top)에서 아래 입구(bottom)로 내려가는 구조물의 로컬 좌표계 정보 */
function frame(top: Vec3, bottom: Vec3) {
  const dx = bottom[0] - top[0]
  const dz = bottom[2] - top[2]
  const run = Math.hypot(dx, dz)
  const drop = top[1] - bottom[1]
  // 로컬 +z가 내려가는 방향을 향하도록 y축 회전
  const yaw = Math.atan2(dx, dz)
  return { run, drop, yaw }
}

function upper(a: Vec3, b: Vec3): [Vec3, Vec3] {
  return a[1] >= b[1] ? [a, b] : [b, a]
}

export function Stairs({ a, b, width = 3, highlight }: { a: Vec3; b: Vec3; width?: number; highlight?: boolean }) {
  const [top, bottom] = upper(a, b)
  const { run, drop, yaw } = frame(top, bottom)
  // 단 높이 약 0.5m 단위로 단순화(실제 단 수보다 적게 그려 렌더링 부담을 줄임)
  const steps = Math.max(4, Math.round(drop / 0.5))
  const h = drop / steps
  const d = run / steps
  const color = highlight ? '#fde68a' : STAIR_COLOR
  return (
    <group position={top} rotation={[0, yaw, 0]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, -(i + 0.5) * h, (i + 0.5) * d]}>
          <boxGeometry args={[width, h, d]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {/* 양옆 벽 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (width + 0.2)) / 2, -drop / 2 + 0.6, run / 2]} rotation={[Math.atan2(drop, run), 0, 0]}>
          <boxGeometry args={[0.2, 1.2, Math.hypot(run, drop)]} />
          <meshStandardMaterial color={STAIR_EDGE} />
        </mesh>
      ))}
    </group>
  )
}

export function Escalator({ a, b, width = 2.4, highlight, stopped = 'none', lang = 'ko' }: { a: Vec3; b: Vec3; width?: number; highlight?: boolean; stopped?: 'none' | 'some' | 'all'; lang?: 'ko' | 'en' }) {
  const [top, bottom] = upper(a, b)
  const { run, drop, yaw } = frame(top, bottom)
  const len = Math.hypot(run, drop)
  const pitch = Math.atan2(drop, run)
  return (
    <group position={top} rotation={[0, yaw, 0]}>
      <group position={[0, -drop / 2, run / 2]} rotation={[pitch, 0, 0]}>
        {/* 두 대(상행·하행) 몸체 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * width) / 4, 0, 0]}>
            <boxGeometry args={[width / 2 - 0.15, 0.5, len]} />
            <meshStandardMaterial color={stopped === 'all' || (stopped === 'some' && s > 0) ? '#b91c1c' : highlight ? '#a16207' : ESC_BODY} />
          </mesh>
        ))}
        {/* 손잡이 레일 */}
        {[-1, -0.02, 1].map((s) => (
          <mesh key={s} position={[(s * width) / 2, 0.8, 0]}>
            <boxGeometry args={[0.12, 0.12, len]} />
            <meshStandardMaterial color={ESC_RAIL} emissive={highlight ? ESC_RAIL : '#000'} emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
      {stopped !== 'none' && (
        <Html center position={[0, -drop / 2 + 3, run / 2]} zIndexRange={[15, 0]}>
          <div className="node-label stopped-label">⛔ {stopped === 'all' ? (lang === 'ko' ? '운행 중지' : 'Out of service') : lang === 'ko' ? '1대 멈춤' : '1 unit stopped'}</div>
        </Html>
      )}
    </group>
  )
}

export function ElevatorShaft({ x, z, yMin, yMax, highlight, stopped, label, showLabel }: { x: number; z: number; yMin: number; yMax: number; highlight?: boolean; stopped?: boolean; label?: string; showLabel?: boolean }) {
  const height = yMax - yMin + 3
  return (
    <group>
      <mesh position={[x, yMin + height / 2, z]}>
        <boxGeometry args={[2.4, height, 2.4]} />
        <meshStandardMaterial color={stopped ? '#b91c1c' : ELEVATOR} transparent opacity={highlight || stopped ? 0.9 : 0.18} depthWrite={!!highlight} />
      </mesh>
      {label && showLabel && (
        <Html center position={[x, yMax + 4.2, z]} zIndexRange={[12, 0]}>
          <div className={`node-label ${stopped ? 'stopped-label' : 'node-elevator'}`}>{stopped ? '⛔ ' : ''}{label}</div>
        </Html>
      )}
    </group>
  )
}

export function ExitCanopy({ p, highlight }: { p: Vec3; highlight?: boolean }) {
  return (
    <group position={p}>
      {[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.5, z]}>
          <boxGeometry args={[0.2, 3, 0.2]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      ))}
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[4.4, 0.3, 4.4]} />
        <meshStandardMaterial color={highlight ? '#f2c200' : '#374151'} />
      </mesh>
    </group>
  )
}

/** 엘리베이터 간선들을 평면 위치별로 묶어 한 개의 기둥으로 */
export function useElevatorShafts(edges: StationEdge[], pos: Map<string, Vec3>) {
  return useMemo(() => {
    const shafts = new Map<string, { x: number; z: number; yMin: number; yMax: number; nodes: Set<string> }>()
    for (const e of edges) {
      if (e.kind !== 'elevator') continue
      for (const id of [e.from, e.to]) {
        const p = pos.get(id)!
        const key = `${p[0]},${p[2]}`
        const s = shafts.get(key) ?? { x: p[0], z: p[2], yMin: p[1], yMax: p[1], nodes: new Set<string>() }
        s.yMin = Math.min(s.yMin, p[1])
        s.yMax = Math.max(s.yMax, p[1])
        s.nodes.add(id)
        shafts.set(key, s)
      }
    }
    return [...shafts.values()]
  }, [edges, pos])
}

const GATE_BODY = '#6b7280'
const GATE_TOP = '#3b82f6'
const FENCE = '#64748b'
/** 개찰구 한 줄 길이(m). 통로 폭 약 0.9m × 7칸 */
export const GATE_ROW = 8

/**
 * 개찰구 한 줄. axis는 사람이 지나가는 방향(x 또는 z).
 * 기계는 지나가는 방향과 수직으로 늘어선다.
 */
export function GateRow({ p, axis, highlight, count = 8 }: { p: Vec3; axis: 'x' | 'z'; highlight?: boolean; count?: number }) {
  const n = count
  const gap = GATE_ROW / 7
  const rowLen = gap * (n - 1)
  return (
    <group position={p} rotation={[0, axis === 'x' ? Math.PI / 2 : 0, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const x = -rowLen / 2 + i * gap
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.28, 1, 1.6]} />
              <meshStandardMaterial color={highlight ? '#1e40af' : GATE_BODY} />
            </mesh>
            <mesh position={[0, 1.03, 0]}>
              <boxGeometry args={[0.3, 0.06, 1.62]} />
              <meshStandardMaterial color={GATE_TOP} emissive={highlight ? GATE_TOP : '#000'} emissiveIntensity={0.6} />
            </mesh>
            {/* 날개(통로 쪽) */}
            {i < n - 1 && (
              <mesh position={[gap / 2, 0.75, 0]}>
                <boxGeometry args={[gap - 0.4, 0.4, 0.04]} />
                <meshStandardMaterial color="#e5e7eb" transparent opacity={0.7} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** 승차권 발매기·교통카드 키오스크 3대. face는 화면이 바라보는 방향(단위 벡터, x·z) */
export function TicketMachines({ p, face, highlight }: { p: Vec3; face: [number, number]; highlight?: boolean }) {
  // 로컬 +z가 화면 방향이 되도록 회전. 기계는 서 있는 자리(노드) 뒤 1.2m에 둔다
  const yaw = Math.atan2(face[0], face[1])
  return (
    <group position={[p[0] - face[0] * 1.2, p[1], p[2] - face[1] * 1.2]} rotation={[0, yaw, 0]}>
      {[-1.1, 0, 1.1].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.9, 1.8, 0.7]} />
            <meshStandardMaterial color={highlight ? '#b91c1c' : '#9ca3af'} />
          </mesh>
          <mesh position={[0, 1.25, 0.36]}>
            <boxGeometry args={[0.65, 0.5, 0.02]} />
            <meshStandardMaterial color="#0f172a" emissive="#38bdf8" emissiveIntensity={highlight ? 0.8 : 0.3} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <boxGeometry args={[0.92, 0.12, 0.72]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** 개찰구 안(유료 구역) 경계 울타리. 개찰구가 선 자리는 비운다 */
export function PaidFence({ polygon, y, gates }: { polygon: [number, number][]; y: number; gates: [number, number][] }) {
  const segs: { a: [number, number]; b: [number, number] }[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 0.01) continue
    const ux = (b[0] - a[0]) / len
    const uz = (b[1] - a[1]) / len
    // 이 변 위에 있는 개찰구 구간을 잘라낸다
    const cuts = gates
      .filter(([gx, gz]) => Math.abs((gx - a[0]) * uz - (gz - a[1]) * ux) < 0.5)
      .map(([gx, gz]) => (gx - a[0]) * ux + (gz - a[1]) * uz)
      .filter((t) => t > -GATE_ROW / 2 && t < len + GATE_ROW / 2)
      .map((t) => [t - GATE_ROW / 2 - 0.2, t + GATE_ROW / 2 + 0.2] as const)
      .sort((p, q) => p[0] - q[0])
    let t0 = 0
    for (const [c0, c1] of [...cuts, [len, len] as const]) {
      if (c0 > t0 + 0.1) segs.push({ a: [a[0] + ux * t0, a[1] + uz * t0], b: [a[0] + ux * Math.min(c0, len), a[1] + uz * Math.min(c0, len)] })
      t0 = Math.max(t0, c1)
    }
  }
  return (
    <group>
      {segs.map(({ a, b }, i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
        return (
          <mesh key={i} position={[(a[0] + b[0]) / 2, y + 0.55, (a[1] + b[1]) / 2]} rotation={[0, yaw, 0]}>
            <boxGeometry args={[0.08, 1.1, len]} />
            <meshStandardMaterial color={FENCE} transparent opacity={0.75} />
          </mesh>
        )
      })}
    </group>
  )
}

/** 화장실·안내실 표지 기둥 */
export function FacilityPost({ p, color, icon, highlight }: { p: Vec3; color: string; icon: string; highlight?: boolean }) {
  return (
    <group position={p}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 8]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 0.15]} />
        <meshStandardMaterial color={color} emissive={highlight ? color : '#000'} emissiveIntensity={0.5} />
      </mesh>
      <Html center position={[0, 2.6, 0.1]} zIndexRange={[9, 0]}>
        <div style={{ fontSize: 14, pointerEvents: 'none' }}>{icon}</div>
      </Html>
    </group>
  )
}

/** 승강장 안전문 위치 표시(바닥 띠) */
export function PlatformDoors({
  doors,
  y,
  dir,
  trackSide,
  transfer,
  wait,
}: {
  doors: { id: string; pos: [number, number] }[]
  y: number
  dir: [number, number]
  trackSide: [number, number]
  transfer: Set<string>
  wait?: string | null
}) {
  const yaw = Math.atan2(dir[0], dir[1])
  return (
    <group>
      {doors.map((d) => {
        const isWait = d.id === wait
        const isTransfer = transfer.has(d.id)
        // 가장자리에서 0.5m 안쪽
        const x = d.pos[0] - trackSide[0] * 0.5
        const z = d.pos[1] - trackSide[1] * 0.5
        return (
          <mesh key={d.id} position={[x, y + 0.03, z]} rotation={[0, yaw, 0]}>
            <boxGeometry args={[isWait ? 1.2 : 0.7, 0.06, isWait ? 2.2 : 1.6]} />
            <meshStandardMaterial color={isWait ? '#e11d48' : isTransfer ? '#16a34a' : '#facc15'} emissive={isWait ? '#e11d48' : '#000'} emissiveIntensity={0.5} />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * 열차(8칸). rest = 정차했을 때 맨 앞 위치, dir = 진행 방향.
 * 처음 그려질 때 한 번 들어와 멈추고, departAt(ms)이 되면 한 번 떠나 사라진다.
 * 다음 열차는 departAt이 바뀌면(key) 새로 들어온다.
 */
export function Train({ rest, y, dir, color, departAt, cars = 8, carLength = 20 }: { rest: [number, number]; y: number; dir: [number, number]; color: string; departAt: number; cars?: number; carLength?: number }) {
  const ref = useRef<Group>(null)
  const shownAt = useRef(Date.now())
  const yaw = Math.atan2(dir[0], dir[1])
  useFrame(() => {
    if (!ref.current) return
    const now = Date.now()
    let shift: number
    if (now >= departAt) {
      // 출발: 6초 동안 가속하며 앞으로 빠져나감
      const t = (now - departAt) / 1000
      ref.current.visible = t < 6
      shift = 200 * Math.pow(Math.min(t, 6) / 6, 2)
    } else {
      // 도착: 5초 동안 감속하며 들어와 정차
      const k = Math.min(1, (now - shownAt.current) / 5000)
      ref.current.visible = true
      shift = -170 * Math.pow(1 - k, 2)
    }
    ref.current.position.set(rest[0] + dir[0] * shift, y, rest[1] + dir[1] * shift)
  })
  return (
    <group ref={ref} position={[rest[0], y, rest[1]]} rotation={[0, yaw, 0]}>
      {Array.from({ length: cars }, (_, i) => {
        const zc = -(i + 0.5) * carLength
        return (
          <group key={i} position={[0, 0, zc]}>
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[2.8, 3.2, carLength - 0.6]} />
              <meshStandardMaterial color="#cbd5e1" />
            </mesh>
            {/* 창문 띠 */}
            <mesh position={[0, 2.35, 0]}>
              <boxGeometry args={[2.86, 0.9, carLength - 1.6]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            {/* 호선 색 띠 */}
            <mesh position={[0, 1.2, 0]}>
              <boxGeometry args={[2.86, 0.55, carLength - 0.6]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {i === 0 && (
              <mesh position={[0, 1.8, carLength / 2 - 0.35]}>
                <boxGeometry args={[2.82, 3.22, 0.3]} />
                <meshStandardMaterial color={color} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
