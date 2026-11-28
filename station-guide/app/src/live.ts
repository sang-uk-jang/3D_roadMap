// 서버(/api/*)에서 받는 실시간 데이터. 서버에 키가 없으면(501) 조용히 꺼진다.
import { useEffect, useState } from 'react'

export type FacilityStatus = { unavailable: string[]; status: Record<string, string>; updatedAt: string }
export type Arrival = { destination: string; message: string; seconds: number | null }
export type ArrivalBoard = { byBoarding: Record<string, Arrival[]>; updatedAt: string }

function usePolling<T>(url: string, intervalMs: number, enabled = true): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${url}`)
        if (res.ok && alive) setData((await res.json()) as T)
        // 501(키 없음)이면 더 묻지 않는다
        if (res.status === 501) return
      } catch {
        /* 지하에서 연결이 끊겨도 앱은 계속 동작 */
      }
      if (alive) timer = setTimeout(load, intervalMs)
    }
    load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [url, intervalMs, enabled])
  return data
}

/** 엘리베이터·에스컬레이터 가동 상태(원본이 5분마다 갱신) */
export const useFacilityStatus = (stationId = 'gunja') =>
  usePolling<FacilityStatus>(stationId === 'gunja' ? 'api/facilities' : `api/facilities?station=${stationId}`, 5 * 60 * 1000)

/** 열차 도착정보(안내 중일 때만 30초마다) */
export const useArrivals = (enabled: boolean) => usePolling<ArrivalBoard>('api/arrivals', 30 * 1000, enabled)

export function formatArrival(a: Arrival, lang: 'ko' | 'en'): string {
  if (a.seconds != null) {
    const m = Math.floor(a.seconds / 60)
    const s = a.seconds % 60
    const t = lang === 'ko' ? (m > 0 ? `${m}분 ${s}초 후` : `${s}초 후`) : m > 0 ? `in ${m} min ${s}s` : `in ${s}s`
    return `${a.destination} · ${t}`
  }
  return `${a.destination} · ${a.message}`
}
