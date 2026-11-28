// 시간표 기준 다음 열차. 실시간 도착정보(키 필요)가 없을 때 쓴다.
// 목적지까지 가지 않는 열차(중간 종착)와 다른 갈래로 가는 열차는 뺀다.
import { DESTINATIONS, type Destination } from '../data/lines'
import { DOBONGSAN_DESTINATIONS } from '../data/lines-dobongsan'
import timetable from '../data/timetable.json'
import timetableDobongsan from '../data/timetable-dobongsan.json'

export type Departure = { time: string; terminus: string; minutes: number }
type Day = 'weekday' | 'saturday' | 'holiday'
type Table = { days: Record<Day, Record<string, string[]>> }
// 타는 곳 id는 역끼리 겹치지 않으므로 두 역 시간표를 한 표로 합친다
const TT: Table = { days: { weekday: {}, saturday: {}, holiday: {} } }
for (const t of [timetable as Table, timetableDobongsan as Table])
  for (const day of Object.keys(TT.days) as Day[]) Object.assign(TT.days[day], t.days[day] ?? {})
const ALL_DESTINATIONS = [...DESTINATIONS, ...DOBONGSAN_DESTINATIONS]

/** 새벽 4시 이전은 전날 운행의 연장으로 본다(시간표의 24·25시 표기와 맞춤) */
function serviceClock(now: Date): { day: Day; minutes: number } {
  const d = new Date(now)
  let minutes = d.getHours() * 60 + d.getMinutes()
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1)
    minutes += 24 * 60
  }
  const wd = d.getDay()
  // 공휴일 달력은 없어서 일요일만 공휴일 시간표로 본다
  return { day: wd === 0 ? 'holiday' : wd === 6 ? 'saturday' : 'weekday', minutes }
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h < 4 ? h + 24 : h) * 60 + m
}

/** 이 종착역 열차가 목적지까지 가는지 */
export function reaches(terminus: string, dest: Destination | undefined): boolean {
  if (!dest) return true
  const t = ALL_DESTINATIONS.find((d) => d.name.ko === terminus && d.boarding === dest.boarding)
  if (!t) return true // 목록에 없는 종착역은 판단하지 않고 보여준다
  if (dest.branch && t.branch && t.branch !== dest.branch) return false
  if (dest.branch && !t.branch) return false // 강동 이전 종착은 갈래 역까지 못 감
  return t.stops >= dest.stops
}

/** 이 타는 곳의 시간표가 있는지(코레일 1호선 등은 없음) */
export function hasTimetable(boarding: string): boolean {
  boarding = boarding.split('@')[0]
  return Object.values(TT.days).some((d) => !!d[boarding])
}

export function nextDepartures(boarding: string, dest?: Destination, now = new Date(), count = 2): Departure[] {
  boarding = boarding.split('@')[0] // 문 앞 임시 타는 곳도 같은 시간표
  const { day, minutes } = serviceClock(now)
  const list = TT.days[day]?.[boarding] ?? []
  const out: Departure[] = []
  for (const entry of list) {
    const [time, terminus] = entry.split('|')
    const m = toMin(time)
    if (m < minutes || !reaches(terminus, dest)) continue
    out.push({ time: `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${time.split(':')[1]}`, terminus, minutes: m - minutes })
    if (out.length >= count) break
  }
  return out
}
