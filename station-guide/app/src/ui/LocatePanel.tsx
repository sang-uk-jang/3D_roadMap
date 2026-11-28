import { useRef, useState, type PointerEvent } from 'react'
import { t, type Lang } from '../i18n'
import { askAI, type AIResult } from '../locate/ai'
import { matchSignText, type MatchResult } from '../locate/match'
import { loadImage, readSign } from '../locate/ocr'
import type { Rect } from '../locate/preprocess'
import type { Station } from '../station/types'
import type { StationProfile } from '../stations/profile'

type Props = {
  station: Station
  profile: StationProfile
  lang: Lang
  onLocated: (nodeId: string) => void
  onCancel: () => void
}

type Phase = 'pick' | 'crop' | 'reading' | 'result'

export function LocatePanel({ station, profile, lang, onLocated, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [file, setFile] = useState<Blob | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [progress, setProgress] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [ai, setAI] = useState<AIResult | 'loading' | 'unavailable' | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const imgEl = useRef<HTMLImageElement>(null)
  const label = (id: string) => station.nodes.find((n) => n.id === id)?.label[lang] ?? id
  const SAMPLES = profile.samples
  const MANUAL = profile.manualPlaces
  const exitNode = (n: string) => profile.exitSpots.find((e) => e.n === n)?.node
  // 표지판 규칙이 낸 후보 중 이 역에 있는 곳만 남긴다(출구 번호 후보는 이 역의 출구 위치로 바꾼다)
  const known = new Set(station.nodes.map((n) => n.id))
  const candidates = (match?.candidates ?? []).flatMap((c) => {
    const n = /^x(\d)_bot$/.exec(c.nodeId)?.[1]
    const id = n ? exitNode(n) : c.nodeId
    return id && known.has(id) ? [{ ...c, nodeId: id }] : []
  })
  const readExits = (match?.candidates ?? []).map((c) => /^x(\d)_bot$/.exec(c.nodeId)?.[1]).filter((n): n is string => !!n && !!exitNode(n))

  const open = async (blob: Blob) => {
    setFile(blob)
    setImg(await loadImage(blob))
    setRect(null)
    setMatch(null)
    setAI(null)
    setPhase('crop')
  }
  const openSample = async (name: string) => open(await (await fetch(`${import.meta.env.BASE_URL}samples/${name}.jpg`)).blob())

  // 화면 좌표 → 원본 이미지 좌표
  const toImage = (e: PointerEvent) => {
    const el = imgEl.current!
    const r = el.getBoundingClientRect()
    const sx = img!.naturalWidth / r.width
    const sy = img!.naturalHeight / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }
  const onDown = (e: PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = toImage(e)
    setRect(null)
  }
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    const p = toImage(e)
    const s = drag.current
    setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const onUp = () => {
    drag.current = null
  }

  const read = async () => {
    if (!img) return
    const crop = rect && rect.w > 20 && rect.h > 10 ? rect : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
    setPhase('reading')
    setProgress(0)
    try {
      const text = await readSign(img, crop, setProgress)
      setOcrText(text.replace(/\s+/g, ' ').trim())
      setMatch(matchSignText(text))
    } catch {
      setOcrText('')
      setMatch({ candidates: [], confident: false, stationSeen: false, ask: 'where' })
    }
    setPhase('result')
  }

  const tryAI = async () => {
    if (!file) return
    setAI('loading')
    const r = await askAI(file, rect ?? undefined)
    setAI(r ?? 'unavailable')
  }

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`

  return (
    <div className="locate">
      <h2>{t(lang, 'lostTitle')}</h2>

      {phase === 'pick' && (
        <>
          <p className="detail">{t(lang, 'lostHelp')}</p>
          <label className="primary file-btn">
            📷 {t(lang, 'takePhoto')}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
          </label>
          <button
            className="wide"
            onClick={() => {
              // 사진 없이 바로 버튼으로 위치 고르기
              setImg(null)
              setFile(null)
              setOcrText('')
              setMatch({ candidates: [], confident: false, stationSeen: false, ask: 'where' })
              setPhase('result')
            }}
          >
            {t(lang, 'pickWithoutPhoto')}
          </button>
          {SAMPLES.length > 0 && <p className="detail">{t(lang, 'orSample')}</p>}
          <div className="samples">
            {SAMPLES.map((s) => (
              <button key={s} onClick={() => openSample(s)} aria-label={s}>
                <img src={`${import.meta.env.BASE_URL}samples/${s}.jpg`} alt="" />
              </button>
            ))}
          </div>
        </>
      )}

      {img && phase !== 'pick' && (
        <div className="crop-wrap">
          <img
            ref={imgEl}
            src={img.src}
            alt=""
            className="crop-img"
            draggable={false}
            onPointerDown={phase === 'crop' ? onDown : undefined}
            onPointerMove={phase === 'crop' ? onMove : undefined}
            onPointerUp={onUp}
          />
          {rect && (
            <div
              className="crop-rect"
              style={{ left: pct(rect.x / img.naturalWidth), top: pct(rect.y / img.naturalHeight), width: pct(rect.w / img.naturalWidth), height: pct(rect.h / img.naturalHeight) }}
            />
          )}
        </div>
      )}

      {phase === 'crop' && (
        <>
          <p className="detail">{t(lang, 'dragSign')}</p>
          <button className="primary wide" onClick={read}>{t(lang, rect ? 'readSelected' : 'readWhole')}</button>
        </>
      )}

      {phase === 'reading' && <p className="progress">{t(lang, 'reading')} {Math.round(progress * 100)}%</p>}

      {phase === 'result' && match && (
        <>
          {img && (
            <p className="ocr-text">
              {t(lang, 'readText')}: <code>{ocrText || '—'}</code>
            </p>
          )}
          {match.ask === 'exitNumber' ? (
            <>
              {/* 출구 표지판: 읽은 번호를 강조하되 사용자가 직접 확인해 누르게 한다(OCR은 4↔8을 헷갈린다) */}
              <h3>{t(lang, 'whichExit')}</h3>
              {readExits.length > 0 && <p className="detail">{t(lang, 'readExitHint')} {readExits.join(', ')}</p>}
              <div className="chips">
                {profile.exitSpots.map(({ n, node }) => (
                  <button key={n} className={`chip exit-chip${readExits.includes(n) ? ' on' : ''}`} onClick={() => onLocated(node)}>{n}</button>
                ))}
              </div>
            </>
          ) : (
            candidates.length > 0 && (
              <>
                <h3>{t(lang, match.confident ? 'foundHere' : 'isItOneOf')}</h3>
                <div className="cands">
                  {candidates.map((c) => (
                    <button key={c.nodeId} className={match.confident ? 'primary' : ''} onClick={() => onLocated(c.nodeId)}>
                      <strong>{label(c.nodeId)}</strong>
                      <small>{c.reason[lang]}</small>
                    </button>
                  ))}
                </div>
              </>
            )
          )}

          {/* 찾은 결과가 틀렸을 수도 있으니 다른 선택지는 언제나 열 수 있게 */}
          <details className="other" open={!match.confident && match.ask !== 'exitNumber'}>
            <summary>{t(lang, candidates.length > 0 || match.ask === 'exitNumber' ? 'notThere' : 'whereAreYou')}</summary>
            <div className="cands">
              {MANUAL.map((m) => (
                <button key={m.id} onClick={() => onLocated(m.id)}>{m.label[lang]}</button>
              ))}
            </div>
            {match.ask !== 'exitNumber' && (
              <>
                <p className="detail">{t(lang, 'nearExit')}</p>
                <div className="chips">
                  {profile.exitSpots.map(({ n, node }) => (
                    <button key={n} className="chip exit-chip" onClick={() => onLocated(node)}>{n}</button>
                  ))}
                </div>
              </>
            )}
            <div className="ai-box">
              {ai === null && file && <button onClick={tryAI}>🤖 {t(lang, 'askAI')}</button>}
              {ai === 'loading' && <p className="progress">{t(lang, 'reading')}</p>}
              {ai === 'unavailable' && <p className="detail">{t(lang, 'aiUnavailable')}</p>}
              {ai && typeof ai === 'object' && known.has(ai.nodeId) && (
                <button className="primary" onClick={() => onLocated(ai.nodeId)}>
                  <strong>{label(ai.nodeId)}</strong>
                  <small>{ai.reason}</small>
                </button>
              )}
            </div>
          </details>
          {img && <button className="link" onClick={() => setPhase('crop')}>{t(lang, 'retryCrop')}</button>}
        </>
      )}

      <div className="nav">
        <button onClick={phase === 'pick' ? onCancel : () => setPhase('pick')}>{t(lang, 'back')}</button>
      </div>
    </div>
  )
}
