import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { buildSteps, crossesPaidArea, isInsideGates, type StepOptions } from './guide/steps'
import { nextDepartures } from './guide/timetable'
import { defaultLang, t, type Lang } from './i18n'
import { alightHeading, bestDoor, doorSide, etaFrom, LINKS, linkFor, onwardTargets, withDoorNode, type Link } from './journey/journey'
import { StationScene } from './scene/StationScene'
import { TrainInterior } from './scene/TrainInterior'
import { baseBoarding } from './station/doors'
import { findRoute, findRouteVia, type Route } from './station/route'
import type { Station } from './station/types'
import { currentProfile, PROFILES, type StationProfile } from './stations/profile'
import { GuidePanel } from './ui/GuidePanel'
import { useArrivals, useFacilityStatus } from './live'
import { LocatePanel } from './ui/LocatePanel'
import { PlanPanel, type Plan } from './ui/PlanPanel'
import { RidePanel } from './ui/RidePanel'

const LINE_COLOR: Record<string, string> = { '1': '#0052A4', '5': '#996CAC', '7': '#747F00' }
const SAVE_KEY = 'subway-guide-journey'

/** 두 역에 걸친 여정: leg1 = 출발역 안내, ride = 열차 안, leg2 = 도착역 안내(내린 문 앞에서 시작) */
type Journey = {
  linkId: string
  /** 탈 문(빠른 하차 칸) */
  door: string
  /** 도착역에서 갈 곳 */
  onwardTo: string
  /** 도착역에서 내린 문부터 걷는 거리(m) */
  leg2Length: number
  phase: 'leg1' | 'ride' | 'leg2'
  boardedAt?: number
}

const tickets = (s: Station) => s.nodes.filter((n) => n.type === 'ticket').map((n) => n.id)
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

type Leg = { route: Route; routeStation: Station | null; journey: Journey | null }

/** 출발역 안내 경로. 도착역에서 갈 곳까지 골랐으면 그 출구에 가까운 문(빠른 하차 칸)으로 간다 */
function planLeg1(profile: StationProfile, p: Plan, unavailable: string[]): Leg | 'noRoute' | 'street' {
  const station = profile.station
  const opts = { stepFree: p.stepFree, unavailableFacilities: unavailable }
  const link = p.onwardTo ? linkFor(profile.id, p.destination) : null
  if (link && p.onwardTo) {
    const pick = bestDoor(link, p.from, p.onwardTo, { ...opts, ticketMachines: p.needTicket ? tickets(station) : undefined })
    const at = pick && withDoorNode(station, link.boarding, pick.door)
    if (pick && at)
      return {
        route: pick.leg1,
        routeStation: at.station,
        journey: { linkId: link.id, door: pick.door, onwardTo: p.onwardTo, leg2Length: pick.leg2.length, phase: 'leg1' },
      }
  }
  const r = p.needTicket ? findRouteVia(station, p.from, tickets(station), p.to, opts) : findRoute(station, p.from, p.to, opts)
  if (!r) return 'noRoute'
  if (crossesPaidArea(station, r)) return 'street'
  return { route: r, routeStation: null, journey: null }
}

function loadSaved(): { stationId: StationProfile['id']; plan: Plan; journey: Journey } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function save(v: { stationId: string; plan: Plan; journey: Journey } | null) {
  try {
    if (v) localStorage.setItem(SAVE_KEY, JSON.stringify(v))
    else localStorage.removeItem(SAVE_KEY)
  } catch {
    /* 저장 못 해도 안내는 계속 */
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(defaultLang)
  // 역 전환: ?station=dobongsan (기본 군자역). 여정 중에는 열차에서 내리면 도착역으로 바뀐다
  const [stationId, setStationId] = useState<StationProfile['id']>(() => currentProfile().id)
  const profile = PROFILES[stationId]
  const base = profile.station
  const [plan, setPlan] = useState<Plan | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  /** 문 앞 임시 지점을 넣은 역 데이터(여정 중일 때) */
  const [routeStation, setRouteStation] = useState<Station | null>(null)
  const [stepOpts, setStepOpts] = useState<StepOptions>({})
  const [journey, setJourney] = useState<Journey | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [located, setLocated] = useState<string | null>(null)
  const station = routeStation ?? base
  const link: Link | null = journey ? LINKS.find((l) => l.id === journey.linkId) ?? null : null

  useEffect(() => {
    document.title = `${base.id === 'gunja' ? 'Gunja' : base.name.en} Station Guide`
  }, [base])

  const facilities = useFacilityStatus(profile.id)
  const unavailable = facilities?.unavailable ?? []
  const arrivals = useArrivals(!!route)
  const steps = useMemo(() => (route ? buildSteps(station, route, stepOpts) : []), [route, station, stepOpts])
  const active = route && steps.length > 0 ? steps[Math.min(stepIndex, steps.length - 1)] : null

  // 3D 열차: 시간표 기준 다음 출발 시각(한 번 들어와 서 있다가 이 시각에 떠난다)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  const boardingEnd = route && route.nodeIds.at(-1)!.startsWith('board') ? route.nodeIds.at(-1)! : null
  const departAt = useMemo(() => {
    if (!boardingEnd) return null
    const next = nextDepartures(boardingEnd, plan?.destination, now, 1)[0]
    if (!next) return null
    const minuteStart = new Date(now)
    minuteStart.setSeconds(0, 0)
    return minuteStart.getTime() + next.minutes * 60_000
  }, [boardingEnd, plan, now])

  const start = (p: Plan) => {
    // 실시간으로 멈춘 엘리베이터·에스컬레이터는 경로에서 뺀다
    const leg = planLeg1(profile, p, unavailable)
    if (leg === 'noRoute') {
      const exits = new Set(profile.elevatorExits)
      const exitNoLift = p.stepFree && ((p.from.startsWith('exit') && !exits.has(p.from)) || (p.to.startsWith('exit') && !exits.has(p.to)))
      setError(exitNoLift ? profile.noStepFree[lang] : t(lang, 'noRoute'))
      return
    }
    if (leg === 'street') {
      setError(t(lang, 'useStreet'))
      return
    }
    setError(null)
    setPlan(p)
    setRoute(leg.route)
    setRouteStation(leg.routeStation)
    setJourney(leg.journey)
    setStepOpts({})
    setStepIndex(0)
  }

  const restart = () => {
    setPlan(null)
    setRoute(null)
    setRouteStation(null)
    setJourney(null)
    setStepOpts({})
    setStepIndex(0)
    save(null)
  }

  const switchStation = (id: StationProfile['id']) => {
    if (id === stationId) return
    restart()
    setLocated(null)
    setLocating(false)
    setError(null)
    setStationId(id)
    try {
      history.replaceState(null, '', id === 'gunja' ? location.pathname : `?station=${id}`)
    } catch {
      /* 주소를 못 바꿔도 화면은 바뀐다 */
    }
  }

  const boarded = () => {
    if (!journey || !plan) return
    const j: Journey = { ...journey, phase: 'ride', boardedAt: Date.now() }
    setJourney(j)
    save({ stationId, plan, journey: j })
  }

  const unboard = () => {
    if (!journey) return
    setJourney({ ...journey, phase: 'leg1', boardedAt: undefined })
    setStepIndex(steps.length)
    save(null)
  }

  /** 열차에서 내림: 도착역으로 바꾸고, 내린 문 앞에서 출발하는 안내를 만든다 */
  const alight = () => {
    if (!journey || !link || !plan) return
    const dest = PROFILES[link.to]
    const at = withDoorNode(dest.station, link.alight, journey.door)
    const r = at && findRoute(at.station, at.nodeId, journey.onwardTo, { stepFree: plan.stepFree })
    if (!at || !r) {
      setError(t(lang, 'noRoute'))
      return
    }
    setStationId(dest.id)
    try {
      history.replaceState(null, '', `?station=${dest.id}`)
    } catch {
      /* 주소를 못 바꿔도 화면은 바뀐다 */
    }
    setRouteStation(at.station)
    setRoute(r)
    setStepOpts({ startHeading: alightHeading(link.alight) ?? undefined, startContext: { ko: t('ko', 'offTrain'), en: t('en', 'offTrain') } })
    setPlan({ from: at.nodeId, to: journey.onwardTo, stepFree: plan.stepFree, needTicket: false })
    setJourney({ ...journey, phase: 'leg2' })
    setStepIndex(0)
    setFloorPick(null)
    save(null)
  }

  // 새로고침·연결 끊김 뒤: 열차 안이었으면 그 화면으로 돌아온다
  useEffect(() => {
    const s = loadSaved()
    if (!s || s.journey.phase !== 'ride') return
    const p = PROFILES[s.stationId]
    if (!p) return
    const leg = planLeg1(p, s.plan, [])
    if (typeof leg === 'string') return
    setStationId(s.stationId)
    setPlan(s.plan)
    setRoute(leg.route)
    setRouteStation(leg.routeStation)
    setJourney(s.journey)
    setStepIndex(Number.MAX_SAFE_INTEGER)
  }, [])

  const allFloors = useMemo(() => new Set(station.floors.map((f) => f.id)), [station])
  // 보여줄 층: 기본은 지금 있는 곳의 층만(안내 중이면 지금 단계가 지나는 층). 버튼으로 바꿀 수 있다
  const [floorPick, setFloorPick] = useState<string | null>(null)
  const [view, setView] = useState<'top' | 'front'>('front')
  const nodeFloor = useMemo(() => new Map(station.nodes.map((n) => [n.id, n.floor])), [station])
  const autoFloors = useMemo(() => {
    if (route) {
      // 한 단계 = 한 층: 그 단계가 끝나는 층만 보인다(층 이동 단계는 도착하는 층과 그 계단·엘리베이터)
      const end = active && stepIndex < steps.length ? route.nodeIds[active.to] : route.nodeIds.at(-1)!
      return new Set([nodeFloor.get(end)!])
    }
    if (located) return new Set([nodeFloor.get(located)!])
    return allFloors
  }, [route, active, stepIndex, steps.length, located, nodeFloor, allFloors])
  // 단계가 바뀌거나 경로가 바뀌면 자동 모드로 돌아간다
  useEffect(() => setFloorPick(null), [route, stepIndex, located])
  // 군자역: 지상은 출입구 덮개뿐이라 지하1층 대합실과 한 판으로 묶어 보여준다(역별 설정)
  const picked = floorPick === 'all' ? allFloors : floorPick ? new Set([floorPick]) : autoFloors
  const visibleFloors = new Set(picked)
  for (const group of profile.mergedFloors) if (group.some((f) => picked.has(f))) for (const f of group) visibleFloors.add(f)

  const riding = journey?.phase === 'ride' && link
  const onwardLabel = link && journey ? onwardTargets(link).find((o) => o.id === journey.onwardTo)?.label : undefined
  const doorReason =
    journey?.phase === 'leg1' && link && onwardLabel ? fill(t(lang, 'fastDoor'), { station: link.stops.at(-1)![lang], target: onwardLabel[lang] }) : undefined
  const toward = link
    ? PROFILES[link.from].destinations.filter((d) => d.boarding === link.boarding).sort((a, b) => b.stops - a.stops)[0]?.name
    : undefined
  const eta = journey?.boardedAt && link ? etaFrom(new Date(journey.boardedAt), link).toTimeString().slice(0, 5) : '--:--'

  return (
    <div className="app">
      <div className="scene">
        {riding ? (
          <TrainInterior
            lang={lang}
            line={link.line}
            color={LINE_COLOR[link.line] ?? '#333'}
            toward={toward ?? link.stops.at(-1)!}
            stops={link.stops}
            from={PROFILES[link.from].station.name}
            door={journey!.door}
            doorSide={doorSide(link.alight)}
            eta={eta}
          />
        ) : (
          <>
            <StationScene
              station={station}
              profile={profile}
              route={route}
              active={active && stepIndex < steps.length ? { from: active.from, to: active.to } : null}
              here={route ? null : located}
              unavailable={unavailable}
              visibleFloors={visibleFloors}
              departAt={departAt}
              view={route ? view : 'top'}
              boardView={!!route && steps.length > 0 && stepIndex >= steps.length && !!boardingEnd}
              lang={lang}
            />
            <div className="floor-pick" role="group" aria-label={t(lang, 'floors')}>
              <button className={floorPick === null ? 'on' : ''} onClick={() => setFloorPick(null)}>{t(lang, 'floorHere')}</button>
              {station.floors.filter((f) => !profile.hiddenFloorButtons.includes(f.id)).map((f) => (
                <button key={f.id} className={floorPick === f.id ? 'on' : ''} onClick={() => setFloorPick(f.id)}>
                  {profile.floorButtons[f.id]?.[lang] ?? f.label[lang]}
                </button>
              ))}
              <button className={floorPick === 'all' ? 'on' : ''} onClick={() => setFloorPick('all')}>{t(lang, 'floorAll')}</button>
            </div>
            {route && (
              <div className="view-pick" role="group">
                <button className={view === 'front' ? 'on' : ''} onClick={() => setView('front')}>{t(lang, 'viewFront')}</button>
                <button className={view === 'top' ? 'on' : ''} onClick={() => setView('top')}>{t(lang, 'viewTop')}</button>
              </div>
            )}
            <p className="map-hint">{t(lang, 'mapHint')}</p>
          </>
        )}
      </div>

      <aside className="panel">
        <header>
          <div>
            {riding ? (
              <h1>{`${PROFILES[link.from].station.name[lang]} → ${link.stops.at(-1)![lang]}`}</h1>
            ) : (
              // 지금 있는 역 바꾸기(안내 중이면 안내를 끝내고 바꾼다)
              <label className="station-switch">
                <span className="sr-only">{t(lang, 'whichStation')}</span>
                <select value={stationId} onChange={(e) => switchStation(e.target.value as StationProfile['id'])} aria-label={t(lang, 'whichStation')}>
                  {Object.values(PROFILES).map((p) => (
                    <option key={p.id} value={p.id}>{p.station.name[lang]}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="badge">{t(lang, 'approx')}</p>
          </div>
          {/* 언어 설정: 지금 언어만 보이고, 눌러서 고른다 */}
          <label className="lang-setting" title={t(lang, 'langSetting')}>
            <span aria-hidden="true">🌐</span>
            <select
              value={lang}
              aria-label={t(lang, 'langSetting')}
              onChange={(e) => {
                const v = e.target.value as Lang
                setLang(v)
                try {
                  localStorage.setItem('subway-guide-lang', v)
                } catch {
                  /* 저장 못 해도 이번 화면에는 적용 */
                }
              }}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
        </header>

        {riding ? (
          <RidePanel
            lang={lang}
            link={link}
            door={journey!.door}
            doorSide={doorSide(link.alight)}
            eta={eta}
            next={{ label: onwardLabel ?? { ko: '', en: '' }, meters: journey!.leg2Length }}
            onAlight={alight}
            onBack={unboard}
          />
        ) : locating ? (
          <LocatePanel
            station={base}
            profile={profile}
            lang={lang}
            onLocated={(id) => {
              setLocating(false)
              if (plan && route) {
                // 안내 중에 길을 잃었으면: 찾은 곳에서 같은 목적지로 다시 안내
                start({ ...plan, from: id, needTicket: plan.needTicket && !isInsideGates(base, id) })
              } else setLocated(id)
            }}
            onCancel={() => setLocating(false)}
          />
        ) : route && plan ? (
          <GuidePanel
            lang={lang}
            steps={steps}
            index={stepIndex}
            totalLength={route.length}
            destination={plan.destination}
            arrivals={arrivals?.byBoarding[baseBoarding(route.nodeIds.at(-1)!)] ?? null}
            boarding={route.nodeIds.at(-1)!.startsWith('board') ? route.nodeIds.at(-1)! : null}
            onNext={() => setStepIndex((i) => Math.min(i + 1, steps.length))}
            onBack={() => setStepIndex((i) => Math.max(Math.min(i, steps.length) - 1, 0))}
            onRestart={restart}
            onLost={() => setLocating(true)}
            onBoarded={journey?.phase === 'leg1' ? boarded : undefined}
            doorReason={doorReason}
          />
        ) : (
          <PlanPanel
            key={stationId}
            station={base}
            profile={profile}
            lang={lang}
            error={error}
            onSubmit={start}
            located={located}
            onLost={() => setLocating(true)}
            onClearLocated={() => setLocated(null)}
            facilities={facilities}
          />
        )}
      </aside>
    </div>
  )
}
