// 열차 안 화면의 옆 패널: 내릴 역, 남은 정거장, 예상 도착 시각, 내리는 문, 내린 뒤 할 일. "내렸어요"를 누르면 도착역 안내로 넘어간다.
import { t, type Lang } from '../i18n'
import type { Link } from '../journey/journey'
import type { Label } from '../station/types'

type Props = {
  lang: Lang
  link: Link
  door: string
  doorSide: 'left' | 'right' | null
  eta: string
  /** 내린 뒤 가는 곳과 걷는 거리 */
  next: { label: Label; meters: number }
  onAlight: () => void
  onBack: () => void
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

export function RidePanel({ lang, link, door, doorSide, eta, next, onAlight, onBack }: Props) {
  const last = link.stops.at(-1)!
  return (
    <div className="guide ride">
      <p className="progress">🚇 {t(lang, 'rideTitle')}</p>
      <h2 className="instruction">
        <span className={`line-badge l${link.line}`}>{link.line}</span> {last[lang]} · {fill(t(lang, 'rideStops'), { n: link.stops.length })}
      </h2>
      <div className="door-hint">
        <span>{t(lang, 'rideEta')}</span>
        <strong className="door-no">{eta}</strong>
        <small>{fill(t(lang, 'rideEtaNote'), { m: link.minutes })}</small>
      </div>
      <p className="detail">🔊 {fill(t(lang, 'rideListen'), { ko: last.ko, en: last.en })}</p>
      {doorSide && <p className="landmarks">🚪 <strong>{fill(t(lang, 'rideDoorSide'), { side: t(lang, doorSide) })}</strong></p>}
      <p className="landmarks">📍 {t(lang, 'rideYouAre')}: <strong>{door}</strong></p>
      <p className="detail">➡️ {fill(t(lang, 'rideNext'), { target: next.label[lang], m: Math.round(next.meters / 5) * 5 })}</p>
      <details className="ticket">
        <summary>{lang === 'ko' ? '지나는 역' : 'Stops'}</summary>
        <ol>{link.stops.map((s, i) => <li key={i}>{s[lang]}</li>)}</ol>
      </details>
      <div className="nav">
        <button onClick={onBack}>{t(lang, 'rideBack')}</button>
        <button className="primary big" onClick={onAlight}>{fill(t(lang, 'rideAlight'), { station: last[lang] })} →</button>
      </div>
    </div>
  )
}
