import { t, type Lang } from '../i18n'
import type { FacilityStatus } from '../live'
import type { Station } from '../station/types'

/** 실시간 엘리베이터·에스컬레이터 상태 요약 */
export function LiveStatus({ station, lang, facilities }: { station: Station; lang: Lang; facilities: FacilityStatus }) {
  const total = Object.keys(facilities.status).length
  const down = new Set(facilities.unavailable)
  // 멈춘 시설이 어느 구간인지(출구 에스컬레이터 등) 이름으로 보여준다
  const names = new Set<string>()
  for (const e of station.edges) {
    if (!(e.facilityRefs ?? []).some((r) => down.has(r))) continue
    const top = station.nodes.find((n) => n.id === e.from)!
    names.add(top.label[lang].replace(/ \((위|아래|top|bottom)\)$/, ''))
  }
  const time = new Date(facilities.updatedAt).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`live ${down.size ? 'warn-box' : 'ok-box'}`}>
      <strong>📡 {t(lang, 'liveTitle')}</strong> <small>{time}</small>
      {down.size === 0 ? (
        <p>{t(lang, 'allRunning')} ({total})</p>
      ) : (
        <>
          <p>
            {lang === 'ko' ? `${total}대 중 ${down.size}대 멈춤` : `${down.size} of ${total} stopped`}
            {names.size > 0 && `: ${[...names].join(', ')}`}
          </p>
          <p className="detail">{t(lang, 'someStopped')}</p>
        </>
      )}
    </div>
  )
}
