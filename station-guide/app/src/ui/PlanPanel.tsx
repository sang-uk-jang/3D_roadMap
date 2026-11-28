import { useState } from 'react'
import { findDestinationIn, type Destination } from '../data/lines'
import type { StationProfile } from '../stations/profile'
import { t, type Lang } from '../i18n'
import { isInsideGates } from '../guide/steps'
import type { FacilityStatus } from '../live'
import { LiveStatus } from './LiveStatus'
import { StationPicker } from './StationPicker'
import { linkFor, onwardTargets } from '../journey/journey'
import type { Station } from '../station/types'

export type Plan = {
  from: string
  to: string
  stepFree: boolean
  needTicket: boolean
  destination?: Destination
  /** 도착역도 데이터가 있으면: 그 역에서 갈 곳(출구·다른 노선 타는 곳) */
  onwardTo?: string
}

type Props = {
  station: Station
  profile: StationProfile
  lang: Lang
  error: string | null
  onSubmit: (plan: Plan) => void
  /** 표지판 사진으로 찾은 현재 위치(노드 id) */
  located?: string | null
  onLost: () => void
  onClearLocated: () => void
  facilities?: FacilityStatus | null
}

export function PlanPanel({ station, profile, lang, error, onSubmit, located, onLost, onClearLocated, facilities }: Props) {
  const exits = station.nodes.filter((n) => n.type === 'exit').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  const [originKind, setOriginKind] = useState<'exit' | 'platform'>('exit')
  const [exitId, setExitId] = useState(exits[0]?.id ?? '')
  const [platformId, setPlatformId] = useState(profile.platformOrigins[0].id)
  const [destKind, setDestKind] = useState<'train' | 'exit'>('train')
  const [query, setQuery] = useState('')
  const [destExit, setDestExit] = useState(exits[0]?.id ?? '')
  const [stepFree, setStepFree] = useState(false)
  const [needTicket, setNeedTicket] = useState(false)

  const dest = destKind === 'train' ? findDestinationIn(profile.destinations, query) : undefined
  const from = located ?? (originKind === 'exit' ? exitId : platformId)
  const outside = located ? !isInsideGates(station, located) : originKind === 'exit'
  const canStart = destKind === 'exit' || !!dest
  // 도착역이 안내 데이터가 있는 역이면 그 역에서 나갈 출구까지 이어서 안내한다
  const link = profile.id && dest ? linkFor(profile.id, dest) : null
  const onward = link ? onwardTargets(link) : []
  const [onwardTo, setOnwardTo] = useState('')
  const onwardPick = onward.some((o) => o.id === onwardTo) ? onwardTo : ''

  const submit = () => {
    if (!canStart) return
    onSubmit({
      from,
      to: destKind === 'exit' ? destExit : dest!.boarding,
      stepFree,
      needTicket: outside && destKind === 'train' && needTicket,
      destination: dest,
      ...(link && onwardPick ? { onwardTo: onwardPick } : {}),
    })
  }

  return (
    <div className="plan">
      <button className="lost-btn" onClick={onLost}>📷 {t(lang, 'lostButton')}</button>
      <h2>{t(lang, 'whereNow')}</h2>
      {located ? (
        <div className="located">
          <span>📍 {t(lang, 'youAreHere')}: <strong>{station.nodes.find((n) => n.id === located)?.label[lang]}</strong></span>
          <button onClick={onClearLocated}>{t(lang, 'change')}</button>
        </div>
      ) : (
      <>
      <div className="seg">
        <button className={originKind === 'exit' ? 'on' : ''} onClick={() => setOriginKind('exit')}>{t(lang, 'atExit')}</button>
        <button className={originKind === 'platform' ? 'on' : ''} onClick={() => setOriginKind('platform')}>{t(lang, 'onPlatform')}</button>
      </div>
      {originKind === 'exit' ? (
        <div className="chips">
          {exits.map((e) => (
            <button key={e.id} className={`chip exit-chip${exitId === e.id ? ' on' : ''}`} onClick={() => setExitId(e.id)}>
              {e.id.replace('exit', '')}
            </button>
          ))}
        </div>
      ) : (
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
          {profile.platformOrigins.map((p) => (
            <option key={p.id} value={p.id}>{p.label[lang]}</option>
          ))}
        </select>
      )}
      </>
      )}

      <h2>{t(lang, 'whereTo')}</h2>
      <div className="seg">
        <button className={destKind === 'train' ? 'on' : ''} onClick={() => setDestKind('train')}>{t(lang, 'byTrain')}</button>
        <button className={destKind === 'exit' ? 'on' : ''} onClick={() => setDestKind('exit')}>{t(lang, 'leave')}</button>
      </div>
      {destKind === 'train' ? (
        <>
          <StationPicker
            lang={lang}
            station={station}
            destinations={profile.destinations}
            value={query}
            placeholder={profile.placeholder[lang]}
            onChange={setQuery}
            onEnter={submit}
          />
          {dest ? (
            <p className="dest-info">
              <span className={`line-badge l${dest.line}`}>{dest.line}</span> {dest.name[lang]} · {dest.stops} {t(lang, 'stops')}
            </p>
          ) : (
            query.trim() && <p className="warn">{profile.unknownStation[lang]}</p>
          )}
          {link && (
            <div className="onward">
              <p className="detail">{t(lang, 'onwardAsk').replace('{station}', link.stops.at(-1)![lang])}</p>
              <div className="chips">
                {onward.map((o) => (
                  <button
                    key={o.id}
                    className={`chip${o.id.startsWith('exit') ? ' exit-chip' : ''}${onwardPick === o.id ? ' on' : ''}`}
                    onClick={() => setOnwardTo(onwardPick === o.id ? '' : o.id)}
                    title={o.label[lang]}
                  >
                    {o.id.startsWith('exit') ? o.id.replace('exit', '') : o.label[lang]}
                  </button>
                ))}
              </div>
              <small className="detail">{t(lang, 'onwardNote')}</small>
            </div>
          )}
        </>
      ) : (
        <div className="chips">
          {exits.map((e) => (
            <button key={e.id} className={`chip exit-chip${destExit === e.id ? ' on' : ''}`} onClick={() => setDestExit(e.id)}>
              {e.id.replace('exit', '')}
            </button>
          ))}
        </div>
      )}

      <div className="checks">
        <label><input type="checkbox" checked={stepFree} onChange={(e) => setStepFree(e.target.checked)} /> {t(lang, 'stepFree')}</label>
        {outside && destKind === 'train' && (
          <label><input type="checkbox" checked={needTicket} onChange={(e) => setNeedTicket(e.target.checked)} /> {t(lang, 'needTicket')}</label>
        )}
      </div>
      {facilities && <LiveStatus station={station} lang={lang} facilities={facilities} />}
      {error && <p className="warn">{error}</p>}
      <button className="primary" disabled={!canStart} onClick={submit}>{t(lang, 'start')}</button>
    </div>
  )
}
