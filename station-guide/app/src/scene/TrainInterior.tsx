// 열차 안 간단한 모습: 통로를 따라 바라본 객차(좌석·문·손잡이), 내리는 문 쪽 표시, 위쪽 안내 화면, 아래 노선 띠.
// 실제 열차 위치는 모른다(실시간 자료 없음) — 지나는 역 목록과 예상 도착 시각만 보여준다.
import type { Label } from '../station/types'

type Props = {
  lang: 'ko' | 'en'
  line: string
  color: string
  /** 열차가 가는 쪽 종점 방면 이름 */
  toward: Label
  /** 지나는 역(내릴 역 포함) */
  stops: Label[]
  from: Label
  door: string
  doorSide: 'left' | 'right' | null
  eta: string
}

export function TrainInterior({ lang, line, color, toward, stops, from, door, doorSide, eta }: Props) {
  const last = stops.at(-1)!
  const car = door.split('-')[0]
  // 객차 원근: 가운데 소실점으로 모이는 사다리꼴
  const W = 800
  const H = 500
  const vx = 400
  const vy = 205
  const sideDoors = [0.18, 0.42, 0.66] // 앞쪽(화면 아래)에서 안쪽으로 문 위치(비율)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  // 왼쪽 벽: (60,470)→(vx-120,vy+40), 오른쪽 벽: (740,470)→(vx+120,vy+40)
  const wall = (t: number, right: boolean) => ({ x: lerp(right ? 740 : 60, right ? vx + 120 : vx - 120, t), yb: lerp(470, vy + 60, t), yt: lerp(70, vy - 40, t) })
  const openSide = doorSide ?? 'right'
  const strip = stops.length > 12 ? [...stops.slice(0, 5), null, ...stops.slice(-5)] : stops

  return (
    <div className="train-interior" role="img" aria-label={lang === 'ko' ? `${line}호선 열차 안, ${last.ko}에서 내림` : `Inside a Line ${line} train, getting off at ${last.en}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <rect width={W} height={H} fill="#eef1f4" />
        {/* 천장·바닥·벽 */}
        <polygon points={`60,70 740,70 ${vx + 120},${vy - 40} ${vx - 120},${vy - 40}`} fill="#f8fafc" />
        <polygon points={`60,470 740,470 ${vx + 120},${vy + 60} ${vx - 120},${vy + 60}`} fill="#cbd5e1" />
        <polygon points={`60,70 ${vx - 120},${vy - 40} ${vx - 120},${vy + 60} 60,470`} fill="#e2e8f0" />
        <polygon points={`740,70 ${vx + 120},${vy - 40} ${vx + 120},${vy + 60} 740,470`} fill="#e2e8f0" />
        {/* 앞 칸으로 가는 문 */}
        <rect x={vx - 120} y={vy - 40} width={240} height={100} fill="#94a3b8" />
        <rect x={vx - 30} y={vy - 30} width={60} height={90} fill="#64748b" />
        {/* 바닥 가운데 줄 */}
        <polygon points={`380,470 420,470 ${vx + 4},${vy + 60} ${vx - 4},${vy + 60}`} fill="#94a3b8" />
        {/* 노선 색 띠(창 아래) */}
        {[false, true].map((right) => {
          const a = wall(0, right)
          const b = wall(1, right)
          const y = (w: { yb: number; yt: number }) => lerp(w.yt, w.yb, 0.55)
          return <polygon key={`band${right}`} points={`${a.x},${y(a)} ${b.x},${y(b)} ${b.x},${y(b) + 6} ${a.x},${y(a) + 14}`} fill={color} />
        })}
        {/* 좌석(문 사이 긴 의자) */}
        {[false, true].map((right) =>
          [0, 1, 2].map((k) => {
            const t0 = k === 0 ? 0.02 : sideDoors[k - 1] + 0.08
            const t1 = sideDoors[k] - 0.02
            const a = wall(t0, right)
            const b = wall(t1, right)
            const inset = (w: { x: number }, t: number) => w.x + (right ? -1 : 1) * lerp(70, 20, t)
            const yS = (w: { yb: number; yt: number }) => lerp(w.yt, w.yb, 0.78)
            return (
              <polygon
                key={`seat${right}${k}`}
                points={`${a.x},${yS(a)} ${b.x},${yS(b)} ${inset(b, t1)},${yS(b) + lerp(30, 8, t1)} ${inset(a, t0)},${yS(a) + lerp(30, 8, t0)}`}
                fill="#3b82f6"
                opacity={0.8}
              />
            )
          }),
        )}
        {/* 문: 내리는 쪽 문은 노선 색 테두리와 화살표 */}
        {[false, true].map((right) =>
          sideDoors.map((t, k) => {
            const a = wall(t, right)
            const b = wall(t + 0.07, right)
            const open = (right ? 'right' : 'left') === openSide
            return (
              <g key={`door${right}${k}`}>
                <polygon points={`${a.x},${lerp(a.yt, a.yb, 0.12)} ${b.x},${lerp(b.yt, b.yb, 0.12)} ${b.x},${b.yb} ${a.x},${a.yb}`} fill={open ? '#fef3c7' : '#d1d5db'} stroke={open ? color : '#9ca3af'} strokeWidth={open ? 4 : 2} />
                <line x1={(a.x + b.x) / 2} y1={lerp((a.yt + b.yt) / 2, (a.yb + b.yb) / 2, 0.12)} x2={(a.x + b.x) / 2} y2={(a.yb + b.yb) / 2} stroke="#6b7280" strokeWidth={1.5} />
              </g>
            )
          }),
        )}
        {/* 손잡이 */}
        {[0.1, 0.3, 0.5, 0.7].map((t) =>
          [false, true].map((right) => {
            const w = wall(t, right)
            const x = lerp(w.x, vx, 0.18)
            const y = lerp(w.yt, w.yb, 0.08)
            return <circle key={`h${t}${right}`} cx={x} cy={y + lerp(26, 8, t)} r={lerp(9, 4, t)} fill="none" stroke="#475569" strokeWidth={2} />
          }),
        )}
        {/* 위쪽 안내 화면 */}
        <rect x={210} y={86} width={380} height={64} rx={8} fill="#0f172a" />
        <text x={400} y={112} textAnchor="middle" fill="#fbbf24" fontSize={18} fontWeight={700}>
          {lang === 'ko' ? `${toward.ko} 방면` : `Toward ${toward.en}`}
        </text>
        <text x={400} y={138} textAnchor="middle" fill="#f8fafc" fontSize={20} fontWeight={700}>
          {lang === 'ko' ? `내릴 역: ${last.ko} · 도착 예정 ${eta}` : `Get off at ${last.en} · ETA ${eta}`}
        </text>
        {/* 내리는 문 쪽 화살표 */}
        {doorSide && (
          <g>
            <rect x={openSide === 'right' ? 560 : 70} y={300} width={170} height={44} rx={22} fill={color} />
            <text x={openSide === 'right' ? 645 : 155} y={328} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={700}>
              {openSide === 'right' ? (lang === 'ko' ? '내리는 문 ➡' : 'Exit doors ➡') : lang === 'ko' ? '⬅ 내리는 문' : '⬅ Exit doors'}
            </text>
          </g>
        )}
        {/* 지금 탄 칸·문 */}
        <rect x={330} y={400} width={140} height={52} rx={10} fill="#fff" stroke="#e11d48" strokeWidth={3} />
        <text x={400} y={422} textAnchor="middle" fill="#e11d48" fontSize={13} fontWeight={700}>
          {lang === 'ko' ? `${car}번째 칸` : `Car ${car}`}
        </text>
        <text x={400} y={444} textAnchor="middle" fill="#111827" fontSize={18} fontWeight={800}>
          📍 {door}
        </text>
      </svg>
      {/* 노선 띠: 타는 역 → 내릴 역 */}
      <ol className="ride-strip" style={{ ['--line' as string]: color }}>
        <li className="from">{from[lang]}</li>
        {strip.map((s, i) => (s ? <li key={i} className={s === last ? 'to' : ''}>{s[lang]}</li> : <li key={i} className="gap">⋯</li>))}
      </ol>
    </div>
  )
}
