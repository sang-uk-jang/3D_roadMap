import { useEffect, useState } from 'react'
import type { Destination } from '../data/lines'
import type { Step } from '../guide/steps'
import { TICKET_STEPS } from '../guide/ticket'
import { t, type Lang } from '../i18n'
import { formatArrival, type Arrival } from '../live'
import { hasTimetable, nextDepartures } from '../guide/timetable'
import { sideOf } from '../station/doors'

type Props = {
  lang: Lang
  steps: Step[]
  index: number
  totalLength: number
  destination?: Destination
  arrivals?: Arrival[] | null
  /** 도착 지점이 승강장이면 그 id(시간표 조회용) */
  boarding?: string | null
  onNext: () => void
  onBack: () => void
  onRestart: () => void
  /** 안내 중 길을 잃었을 때: 위치를 다시 찾아 같은 목적지로 */
  onLost?: () => void
  /** 이어지는 여정이 있으면: 열차에 탔을 때 */
  onBoarded?: () => void
  /** 빠른 하차 문을 고른 이유(예: 도봉산 2번 출구에 가까운 문) */
  doorReason?: string
}

const ICON: Record<Step['kind'], string> = { walk: '🚶', gate: '🎫', ticket: '🎟️', move: '↕️', arrive: '🚉' }
const VIA_ICON = { walk: '🚶', stairs: '🪜', escalator: '↕️', elevator: '🛗' }

export function GuidePanel({ lang, steps, index, totalLength, destination, arrivals, boarding, onNext, onBack, onRestart, onLost, onBoarded, doorReason }: Props) {
  const [showAll, setShowAll] = useState(false)
  // 시간표 기준 남은 시간을 30초마다 갱신
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const trains = <Trains lang={lang} arrivals={arrivals} boarding={boarding} destination={destination} now={now} />
  const finished = index >= steps.length
  const step = steps[Math.min(index, steps.length - 1)]
  const minutes = Math.max(1, Math.round(totalLength / 70))

  if (finished) {
    return (
      <div className="guide">
        <p className="progress">{t(lang, 'done')}</p>
        <h2 className="instruction">
          {destination
            ? `${t(lang, 'boardTrain')}${step.detail ? ` (${step.detail[lang]})` : ''} → ${destination.name[lang]} · ${destination.stops} ${t(lang, 'stops')}`
            : step.title[lang]}
        </h2>
        {destination?.branch && <p className="warn">{t(lang, destination.branch === 'hanam' ? 'branchHanam' : 'branchMacheon')}</p>}
        {step.door && (
          <div className="door-hint">
            <span>{t(lang, 'waitAtDoor')}</span>
            <strong className="door-no">{step.door}</strong>
            {doorReason && <small>{doorReason}</small>}
          </div>
        )}
        {trains}
        <div className="nav">
          <button onClick={onBack}>{t(lang, 'back')}</button>
          {onBoarded ? (
            <button className="primary big" onClick={onBoarded}>🚇 {t(lang, 'boarded')} →</button>
          ) : (
            <button className="primary" onClick={onRestart}>{t(lang, 'restart')}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="guide">
      <p className="progress">
        {t(lang, 'step')} {index + 1} / {steps.length} · {Math.round(totalLength)} m · ~{minutes} {t(lang, 'minutes')}
      </p>
      <div className="dots">
        {steps.map((_, i) => (
          <span key={i} className={i < index ? 'done' : i === index ? 'now' : ''} />
        ))}
      </div>
      {step.turn && (
        <div className="turn">
          <span className="turn-arrow">{step.turn.arrow}</span>
          <strong>{step.turn.label[lang]}</strong>
        </div>
      )}
      <h2 className="instruction">
        <span className="icon">{step.via ? VIA_ICON[step.via] : ICON[step.kind]}</span> {step.title[lang]}
      </h2>
      {step.press && (
        <div className="press">
          <span>{t(lang, 'pressButton')}</span>
          <strong className="press-btn">{step.press}</strong>
        </div>
      )}
      {step.detail && <p className="detail">{step.detail[lang]}</p>}
      {step.sign && (
        <div className="sign-hint">
          <span>{t(lang, 'followSign')}</span>
          <strong className="sign">{step.sign.ko}{lang !== 'ko' && <small>{step.sign.en}</small>}</strong>
        </div>
      )}
      {step.landmarks && (
        <p className="landmarks">
          👀 {t(lang, 'checkLandmarks')}: <strong>{step.landmarks.map((l) => l[lang]).join(' · ')}</strong>
        </p>
      )}
      {step.door && (
        <div className="door-hint">
          <span>{t(lang, 'waitAtDoor')}</span>
          <strong className="door-no">{step.door}</strong>
          <small>{doorReason ?? doorNote(lang, boarding)}</small>
        </div>
      )}
      {step.kind === 'arrive' && trains}
      {step.kind === 'ticket' && (
        <details className="ticket" open>
          <summary>{t(lang, 'ticketGuide')}</summary>
          <ol>{TICKET_STEPS.map((s, i) => <li key={i}>{s[lang]}</li>)}</ol>
        </details>
      )}
      <div className="nav">
        <button onClick={index === 0 ? onRestart : onBack}>{index === 0 ? t(lang, 'restart') : t(lang, 'back')}</button>
        <button className="primary big" onClick={onNext}>{t(lang, 'arrived')} →</button>
      </div>
      {onLost && (
        <button className="lost-btn" onClick={onLost}>{t(lang, 'lostOnWay')}</button>
      )}
      <button className="link" onClick={() => setShowAll(!showAll)}>{t(lang, 'showSteps')}</button>
      {showAll && (
        <ol className="all-steps">
          {steps.map((s, i) => (
            <li key={i} className={i === index ? 'now' : i < index ? 'done' : ''}>{s.title[lang]}</li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** 문 번호는 칸 수 가정에 따른 추정 */
function doorNote(lang: Lang, boarding?: string | null) {
  const cars = (boarding && sideOf(boarding)?.cars) || 8
  return lang === 'ko' ? `${cars}칸 열차 기준 추정 위치` : `Estimated for a ${cars}-car train`
}

/** 실시간 도착정보가 있으면 그것을, 없으면 시간표 기준 다음 열차(목적지까지 가는 열차만)를 보여준다 */
function Trains({ lang, arrivals, boarding, destination, now }: { lang: Lang; arrivals?: Arrival[] | null; boarding?: string | null; destination?: Destination; now: Date }) {
  if (arrivals && arrivals.length > 0) {
    return (
      <div className="next-trains">
        <strong>🚇 {t(lang, 'nextTrains')}</strong>
        <ul>{arrivals.map((a, i) => <li key={i}>{formatArrival(a, lang)}</li>)}</ul>
      </div>
    )
  }
  if (!boarding) return null
  if (!hasTimetable(boarding)) return <div className="next-trains"><p>{t(lang, 'noTimetable')}</p></div>
  const deps = nextDepartures(boarding, destination, now)
  return (
    <div className="next-trains">
      <strong>🕒 {t(lang, 'nextTrainsTimetable')}</strong>
      {deps.length === 0 ? (
        <p>{t(lang, 'noMoreTrains')}</p>
      ) : (
        <ul>
          {deps.map((d, i) => (
            <li key={i}>
              {d.time} · {lang === 'ko' ? `${d.terminus}행` : `to ${d.terminus}`} · {lang === 'ko' ? `${d.minutes}분 후` : `in ${d.minutes} min`}
            </li>
          ))}
        </ul>
      )}
      {destination && <small>{t(lang, 'onlyReaching')}</small>}
    </div>
  )
}
