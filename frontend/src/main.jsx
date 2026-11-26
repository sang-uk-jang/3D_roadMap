import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describeRoute, findRoute, routeCheckpoints } from "./routes.js";
import { createStationView } from "./station-view.js";
import "./style.css";

const defaultStart = "connector-4-upper";
const defaultEnd = "l5-acha";
const asset = name => globalThis.metroLensAsset?.(name) ?? `./${name}`;
const floorButtons = [["all", "전체"], ["B1", "B1"], ["B2", "B2"], ["B3", "B3"]];
const stationApi = "/api/stations/gunja";

async function getRoute(graph, start, end, api, signal) {
  if (!api) return findRoute(graph, start, end);
  const response = await fetch(`${stationApi}/routes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ startNodeId: start, endNodeId: end }),
  });
  if (response.status === 422) return null;
  if (!response.ok) throw new Error("경로 요청을 처리하지 못했습니다.");
  const result = await response.json();
  return describeRoute(graph, start, result.segments);
}

async function loadGraph(signal) {
  let api = false;
  if (location.protocol !== "file:") {
    const response = await fetch(stationApi, { signal }).catch(() => null);
    if (response?.ok && response.headers.get("Content-Type")?.startsWith("application/json")) {
      api = (await response.json()).stationId === "gunja";
    }
  }
  const response = await fetch(api ? `${stationApi}/navigation` : asset("navigation.json"), { signal });
  if (!response.ok) throw new Error("길 안내 데이터를 불러오지 못했습니다.");
  return [await response.json(), api];
}

function PlaceSelect({ label, value, onChange, places, destination = false }) {
  return <label className="place">
    <span className={`place-label ${destination ? "destination" : ""}`}><i />{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)} disabled={!places.length}>
      {["출구", "승강장", "시설"].map(group => <optgroup label={group} key={group}>
        {places.filter(place => place.group === group).map(place =>
          <option key={place.id} value={place.id}>{place.name} · {place.floorId === "G" ? "지상" : place.floorId}</option>)}
      </optgroup>)}
    </select>
  </label>;
}

function DiagramFallback({ points, active }) {
  const factor = 1800 / (223 * 10.56);
  const coords = points.map(([x, y, z]) => [
    900 + (10 * x - 5.062 * z - 2.9 * 10.56) * factor,
    625 + (1.64 * x + 3.24 * z - 10.56 * y - 6 * 10.56) * factor,
  ]);
  return <div className="fallback">
    <img src={asset("gunja-map.png")} alt="군자역 B1~B3 역사 구조" />
    <svg viewBox="0 0 1800 1250" aria-hidden="true">
      <polyline points={coords.join(" ")} fill="none" stroke="#fff" strokeWidth="15" strokeLinejoin="round" />
      <polyline points={coords.join(" ")} fill="none" stroke="#007e69" strokeWidth="9" strokeLinejoin="round" />
      {coords.length > 1 && <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="15"
        fill="none" stroke="#e5a51e" strokeWidth="6" />}
      {coords[active] && <circle cx={coords[active][0]} cy={coords[active][1]} r="12"
        fill="#007e69" stroke="#fff" strokeWidth="4" />}
    </svg>
  </div>;
}

function App() {
  const [graph, setGraph] = useState(null);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");
  const [planning, setPlanning] = useState(false);
  const [floor, setFloor] = useState("all");
  const [stage, setStage] = useState("loading");
  const [load, setLoad] = useState(0);
  const [progress, setProgress] = useState({ ratio: 0, index: 0, playing: false });
  const [confirmed, setConfirmed] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [view, setView] = useState("character");
  const container = useRef(null);
  const viewer = useRef(null);
  const useApi = useRef(false);
  const places = graph?.places ?? [];
  const startPlace = places.find(item => item.id === route?.start);
  const endPlace = places.find(item => item.id === route?.end);
  const checkpoints = useMemo(() => routeCheckpoints(route, endPlace?.name), [route, endPlace]);
  const checkpoint = checkpoints[confirmed];
  const fromIndex = checkpoints[confirmed - 1]?.index ?? 0;
  const completed = checkpoints.length > 0 && confirmed === checkpoints.length;

  useEffect(() => {
    const controller = new AbortController();
    loadGraph(controller.signal).then(async ([data, api]) => {
      useApi.current = api;
      const example = await getRoute(data, defaultStart, defaultEnd, api, controller.signal);
      setGraph(data);
      if (example) setRoute({ ...example, start: defaultStart, end: defaultEnd });
    }).catch(err => { if (err.name !== "AbortError") setError("길 안내 데이터를 불러오지 못했습니다."); });
    try {
      viewer.current = createStationView(container.current, {
        modelUrl: asset("gunja-guide.glb"),
        onLoad: () => setStage("ready"),
        onLoading: setLoad,
        onError: () => setStage("fallback"),
        onProgress: setProgress,
      });
    } catch {
      setStage("fallback");
    }
    return () => {
      controller.abort();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => { viewer.current?.setRoute(route?.points ?? [], route?.treads ?? []); }, [route]);
  useEffect(() => {
    if (!checkpoint) return;
    setProgress({ ratio: 0, index: fromIndex, playing: false });
    viewer.current?.setSegment(fromIndex, checkpoint.index);
  }, [route, fromIndex, checkpoint]);
  useEffect(() => { viewer.current?.setFloor(floor); }, [floor]);
  useEffect(() => { viewer.current?.setSpeed(Number(speed)); }, [speed]);
  useEffect(() => { viewer.current?.setView(view); }, [view]);

  async function plan(event) {
    event.preventDefault();
    if (!graph || planning) return;
    if (start === end) {
      setError("출발지와 목적지를 다르게 선택해 주세요.");
      return;
    }
    setPlanning(true);
    setError("");
    try {
      const next = await getRoute(graph, start, end, useApi.current);
      if (!next) {
        setRoute(null);
        setError("이 두 지점을 잇는 경로를 찾지 못했습니다.");
        return;
      }
      setProgress({ ratio: 0, index: 0, playing: false });
      setConfirmed(0);
      setRoute({ ...next, start, end });
      setFloor("all");
      viewer.current?.resetView();
    } catch {
      setError("경로 요청을 처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPlanning(false);
    }
  }

  function confirmArrival() {
    if (!checkpoint) return;
    viewer.current?.setPlaying(false);
    viewer.current?.seek(1);
    setConfirmed(current => current === confirmed ? current + 1 : current);
  }

  const loading = stage === "loading";
  const is3d = stage === "ready";

  return <>
    <header className="top">
      <div className="header-inner">
        <div className="wordmark"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>MetroLens</div>
        <div className="station-heading">
          <div className="routes-badges"><span>5</span><span>7</span></div>
          <div><h1>군자역 길 안내</h1><p>Gunja Station</p></div>
        </div>
      </div>
    </header>
    <main className="workspace">
      <section className="map-card" aria-label="역사 지도">
        <div className="map-top">
          <div><h2>역사 지도</h2><p>{startPlace?.name ?? "군자역"}{route ? "에서 출발" : ""}</p></div>
          <div className="view-controls">
            <div className="floor-switch" aria-label="시점 선택">
              <button type="button" aria-pressed={view === "character"} disabled={!is3d}
                onClick={() => setView("character")}>캐릭터 시점</button>
              <button type="button" aria-pressed={view === "overview"} disabled={!is3d}
                onClick={() => setView("overview")}>전체 지도</button>
            </div>
            {view === "overview" && <div className="floor-switch" aria-label="층별 보기">
              {floorButtons.map(([id, label]) => <button key={id} type="button"
                onClick={() => { setFloor(id); viewer.current?.resetView(); }}
                aria-pressed={floor === id} disabled={!is3d}>{label}</button>)}
            </div>}
          </div>
        </div>
        <div className="checkpoint-bar">
          <div className="checkpoint-copy" aria-live="polite">
            {checkpoint ? <>
              <span>확인 지점 {confirmed + 1} / {checkpoints.length}</span>
              <strong>{checkpoint.title}</strong>
              <p>{checkpoint.detail}</p>
            </> : <strong>{completed ? "목적지 도착 확인 완료" : "출발지와 목적지를 선택해 주세요"}</strong>}
          </div>
          {checkpoint && <button type="button" className="arrival" onClick={confirmArrival}>도착했어요</button>}
        </div>
        <div className="stage">
          <div className="three-view" ref={container} style={{ visibility: is3d ? "visible" : "hidden" }} />
          {!is3d && <DiagramFallback points={route?.points.slice(fromIndex, (checkpoint?.index ?? fromIndex) + 1) ?? []}
            active={Math.max(0, progress.index - fromIndex)} />}
          {loading && <span className="map-message" role="status">3D 모델 불러오는 중{load ? ` · ${load}%` : ""}</span>}
          {stage === "fallback" && <span className="map-message" role="status">3D를 열 수 없어 안내도 이미지로 표시 중</span>}
          <div className="zoom" aria-label="지도 조작">
            {view === "overview" && <>
              <button type="button" title="확대" aria-label="확대" disabled={!is3d} onClick={() => viewer.current?.zoom(1.23)}>+</button>
              <button type="button" title="축소" aria-label="축소" disabled={!is3d} onClick={() => viewer.current?.zoom(1 / 1.23)}>−</button>
            </>}
            <button type="button" title="시점 초기화" aria-label="시점 초기화" disabled={!is3d} onClick={() => viewer.current?.resetView()}>⟲</button>
          </div>
          <span className="gesture">{is3d ? (view === "character"
            ? "드래그로 둘러보기" : "드래그로 회전 · 스크롤로 확대") : "안내도 보기"}</span>
        </div>
        <div className="map-legend">
          <span><i className="swatch path" />이동 경로</span>
          <span><i className="swatch checkpoint" />확인 지점</span>
          <span><i className="swatch line5" />5호선 승강장</span>
          <span><i className="swatch line7" />7호선 승강장</span>
          <span><i className="swatch walls" />외곽 벽·차단벽</span>
        </div>
        <div className="simulation">
          <div className="simulation-copy">
            <strong>이동 시뮬레이션</strong>
            <span>{completed ? "모든 지점을 확인했습니다."
              : progress.ratio >= 1 ? "실제로 도착하면 ‘도착했어요’를 눌러주세요." : "현재 확인 지점까지 재생합니다."}</span>
          </div>
          <div className="playback">
            <button type="button" className="play" disabled={!checkpoint || !is3d}
              onClick={() => viewer.current?.setPlaying(!progress.playing)}>{progress.playing ? "일시정지" : "재생"}</button>
            <button type="button" disabled={!checkpoint || !is3d} onClick={() => {
              viewer.current?.setPlaying(false); viewer.current?.seek(0);
            }}>이 구간 처음</button>
            <select aria-label="재생 속도" value={speed} onChange={event => setSpeed(event.target.value)} disabled={!is3d}>
              <option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
            </select>
          </div>
          <input className="scrub" aria-label="재생 위치" type="range" min="0" max="1000"
            value={Math.round(progress.ratio * 1000)} disabled={!checkpoint || !is3d}
            onChange={event => viewer.current?.seek(Number(event.target.value) / 1000)} />
        </div>
      </section>
      <aside className="guide">
        <section className="card trip">
          <h2>경로 찾기</h2>
          <form onSubmit={plan}>
            <PlaceSelect label="출발지" value={start} onChange={setStart} places={places} />
            <button className="swap" type="button" onClick={() => { setStart(end); setEnd(start); }}
              disabled={!places.length} aria-label="출발지와 목적지 바꾸기" title="출발지와 목적지 바꾸기">⇅</button>
            <PlaceSelect label="목적지" value={end} onChange={setEnd} places={places} destination />
            <button className="submit" type="submit" disabled={!graph || planning}>{planning ? "경로 찾는 중" : "경로 보기"}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
        <section className="card instructions" aria-label="이동 순서">
          <h2>확인한 지점</h2>
          {route && startPlace && endPlace ? <>
            <p className="journey">{startPlace.name}<span>에서</span><br />{endPlace.name}<span>까지</span></p>
            {confirmed > 0 ? <ol>
              {checkpoints.slice(0, confirmed).map(item => <li key={item.index} className="terminal">
                <span className="step-number" aria-hidden="true">✓</span><strong>{item.title}</strong>
              </li>)}
            </ol> : <p className="empty">도착을 확인한 지점이 여기에 표시됩니다.</p>}
          </> : <p className="empty">출발지와 목적지를 선택하면 이동 순서가 표시됩니다.</p>}
        </section>
        <details className="provenance">
          <summary>모델과 경로의 기준</summary>
          <p>층별 연결과 출구 위치는 역사 안내도에 맞췄습니다. 4번 출구 계단·난간과 대합실의 타일, 점자블록, 개찰구 외형은 촬영 영상을 참고했습니다.</p>
          <p>층간 높이와 시설물 세부 위치는 추정치입니다. 에스컬레이터 방향과 시설 이용 가능 여부는 현장에서 확인해 주세요.</p>
        </details>
      </aside>
    </main>
    <footer>안내도 기반 경로 시뮬레이션 · 실제 위치 및 운행 정보는 역사 표지판을 확인하세요.</footer>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
