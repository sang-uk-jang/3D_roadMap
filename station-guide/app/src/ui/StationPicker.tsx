// 도착역 고르기: 입력하면 거르고, 아래 목록(스크롤)은 노선·방면별로 묶어 보여준다.
// 브라우저 기본 datalist는 휴대폰·내장 브라우저에서 목록이 길면 스크롤이 안 되거나 안 보여서 직접 그린다.
import { useMemo, useState } from 'react'
import type { Destination } from '../data/lines'
import type { Lang } from '../i18n'
import type { Label, Station } from '../station/types'

type Props = {
  lang: Lang
  station: Station
  destinations: Destination[]
  value: string
  placeholder: string
  onChange: (text: string) => void
  onEnter: () => void
}

export function StationPicker({ lang, station, destinations, value, placeholder, onChange, onEnter }: Props) {
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase().replace(/역$/, '')
  const groups = useMemo(() => {
    const byBoarding = new Map<string, Destination[]>()
    for (const d of destinations) {
      if (q && !d.name.ko.includes(q) && !d.name.en.toLowerCase().includes(q)) continue
      byBoarding.set(d.boarding, [...(byBoarding.get(d.boarding) ?? []), d])
    }
    return [...byBoarding].map(([boarding, list]) => {
      const dir: Label | undefined = station.nodes.find((n) => n.id === boarding)?.direction
      return { boarding, line: list[0].line, dir, list: list.sort((a, b) => a.stops - b.stops) }
    })
  }, [destinations, q, station])
  const count = groups.reduce((n, g) => n + g.list.length, 0)
  const exact = destinations.some((d) => d.name.ko === value || d.name.en === value)

  return (
    <div className="station-picker">
      <div className="picker-input">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setOpen(false)
              onEnter()
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-expanded={open}
          aria-controls="station-list"
          role="combobox"
        />
        <button
          type="button"
          className="picker-toggle"
          aria-label={lang === 'ko' ? '역 목록 열기' : 'Show stations'}
          // 입력칸 blur보다 먼저 처리되도록 mousedown에서 막는다
          onMouseDown={(e) => {
            e.preventDefault()
            setOpen((o) => !o)
          }}
        >
          ▾
        </button>
      </div>
      {open && !exact && (
        <div className="picker-list" id="station-list" role="listbox">
          {count === 0 && <p className="detail">{lang === 'ko' ? '맞는 역이 없어요' : 'No matching station'}</p>}
          {groups.map((g) => (
            <section key={g.boarding}>
              <h3>
                <span className={`line-badge l${g.line}`}>{g.line}</span> {g.dir?.[lang] ?? ''}
              </h3>
              <ul>
                {g.list.map((d) => (
                  <li key={d.name.ko}>
                    <button
                      type="button"
                      role="option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(d.name[lang])
                        setOpen(false)
                      }}
                    >
                      <span>{d.name[lang]}</span>
                      <small>
                        {lang === 'ko' ? d.name.en : d.name.ko} · {d.stops}
                        {lang === 'ko' ? '정거장' : ' stops'}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
