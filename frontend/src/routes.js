export const floorNames = {
  G: "지상", B1: "지하 1층", B2: "지하 2층", B3: "지하 3층",
  M2: "2번 출구 중간참", M3: "3번 출구 중간참", M7: "7번 출구 중간참",
  M12: "1·2번 출구 합류부", M34: "3·4번 출구 합류부", M56: "5·6번 출구 합류부",
};

export function findRoute(graph, start, end, { stepFree = false } = {}) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (!nodes.has(start) || !nodes.has(end)) throw new Error("출발지와 목적지를 확인해 주세요.");
  if (start === end) return { nodes: [start], points: [nodes.get(start).position], treads: [], steps: [] };
  const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    if (edge.status !== "diagram-model" || (stepFree && edge.kind !== "walk")) continue;
    adjacency.get(edge.from).push({ ...edge });
    adjacency.get(edge.to).push({
      ...edge, from: edge.to, to: edge.from, geometry: [...edge.geometry].reverse(),
      treads: edge.treads?.slice().reverse().map(profile => profile && [...profile].reverse()),
    });
  }
  const distance = new Map([[start, 0]]);
  const previous = new Map();
  const queue = new Set([start]);
  while (queue.size) {
    const current = [...queue].reduce((best, id) => distance.get(id) < distance.get(best) ? id : best);
    queue.delete(current);
    if (current === end) break;
    for (const next of adjacency.get(current)) {
      const candidate = distance.get(current) + next.cost;
      if (candidate < (distance.get(next.to) ?? Infinity)) {
        distance.set(next.to, candidate);
        previous.set(next.to, next);
        queue.add(next.to);
      }
    }
  }
  if (!previous.has(end)) return null;
  const segments = [];
  for (let id = end; id !== start; id = previous.get(id).from) segments.push(previous.get(id));
  segments.reverse();
  return describeRoute(graph, start, segments);
}

export function describeRoute(graph, start, segments) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (!segments.length) return { nodes: [start], points: [nodes.get(start).position], treads: [], steps: [] };
  const result = { nodes: [start], points: [], treads: [], steps: [] };
  const kinds = {
    stairs: "계단", escalator: "에스컬레이터", "escalator-pair": "에스컬레이터",
    "stairs-escalator": "계단·에스컬레이터",
  };
  for (const segment of segments) {
    const from = nodes.get(segment.from);
    const to = nodes.get(segment.to);
    result.nodes.push(to.id);
    const startIndex = Math.max(0, result.points.length - 1);
    result.points.push(...(result.points.length ? segment.geometry.slice(1) : segment.geometry));
    for (let i = 0; i < segment.geometry.length - 1; i++) result.treads.push(segment.treads?.[i] ?? null);
    const endIndex = result.points.length - 1;
    const type = segment.kind === "walk" ? "walk" : "level";
    const prior = result.steps.at(-1);
    if (prior?.type === "walk" && type === "walk" && prior.to === to.floorId) {
      prior.endIndex = endIndex;
      continue;
    }
    result.steps.push({
      type, startIndex, endIndex, from: from.floorId, to: to.floorId, kind: segment.kind,
      title: type === "walk" ? `${floorNames[to.floorId]} 통로 따라 이동` : segment.label,
      detail: type === "walk" ? "지도에 표시된 경로를 따라가세요."
        : `${kinds[segment.kind]}로 ${floorNames[to.floorId]} 이동`,
      video: segment.videoAppearance,
    });
  }
  const destination = graph.places.find(place => place.id === result.nodes.at(-1));
  result.steps.forEach((step, index) => {
    if (step.type === "walk") {
      const landmark = result.steps[index + 1]?.title ?? destination?.name;
      if (landmark) step.detail = `${landmark} 쪽으로 이동하세요.`;
    }
    if (step.kind === "stairs-escalator") step.detail += step.from === "G"
      ? " 에스컬레이터 뒤에 계단이 이어집니다." : " 계단 뒤에 에스컬레이터가 이어집니다.";
  });
  return result;
}

export function routeCheckpoints(route, destination, landmark) {
  if (!route?.points.length || route.points.length < 2) return [];
  const points = route.points;
  const checkpoints = new Map();
  const add = (index, item) => { if (index > 0) checkpoints.set(index, { index, ...item }); };
  const smallLandings = new Set(["M2", "M3", "M7"]);
  const distance = [0];
  const turns = [];
  for (let i = 1; i < points.length; i++) {
    distance.push(distance[i - 1] + Math.hypot(...points[i].map((axis, j) => axis - points[i - 1][j])));
  }

  for (const step of route.steps) {
    if (step.type === "walk") {
      if (step.to.startsWith("M")) continue;
      for (let i = Math.max(1, step.startIndex); i < Math.min(points.length - 1, step.endIndex); i++) {
        const [x, , z] = points[i];
        const ax = x - points[i - 1][0], az = z - points[i - 1][2];
        const bx = points[i + 1][0] - x, bz = points[i + 1][2] - z;
        if (points[i - 1][1] !== points[i][1] || Math.min(Math.hypot(ax, az), Math.hypot(bx, bz)) < 3) continue;
        const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
        if (Math.abs(turn) < Math.PI / 3) continue;
        const direction = Math.abs(turn) > Math.PI * .83 ? "뒤로" : turn > 0 ? "오른쪽으로" : "왼쪽으로";
        turns.push({ index: i, kind: "turn", title: `${direction} 도는 지점`,
          detail: `${floorNames[step.to]} 통로에서 방향을 바꾸는 지점까지 이동하세요.`,
          depart: `${direction} 돌아` });
      }
      continue;
    }
    if (smallLandings.has(step.to) || step.to === "G") continue;
    const flights = [];
    for (let i = step.startIndex + 1; i <= step.endIndex; i++) {
      if (Math.abs(points[i][1] - points[i - 1][1]) > .01) flights.push(i);
    }
    if (!flights.length) continue;
    const mixed = step.kind === "stairs-escalator";
    const departure = step.kind === "stairs" || (mixed && step.from !== "G") ? "계단" : "에스컬레이터";
    const arrival = mixed && step.from === "G" ? "계단" : mixed ? "에스컬레이터" : departure;
    const via = name => name === "계단" ? "계단으로" : "에스컬레이터로";
    const motion = points[flights[0]][1] < points[flights[0] - 1][1] ? "내려" : "올라";
    add(flights.at(-1), {
      kind: "landing", title: step.to.startsWith("M") ? floorNames[step.to] : `${floorNames[step.to]} 도착 지점`,
      detail: `${via(arrival)} ${motion}가 ${floorNames[step.to]}에 도착하면 확인하세요.`,
    });
  }
  add(points.length - 1, { kind: "destination", title: destination,
    detail: landmark ? `${landmark} 앞에 도착하면 확인하세요.` : "목적지에 도착하면 확인하세요." });
  for (const turn of turns) {
    if (distance[turn.index] < 8 || [...checkpoints.keys()]
      .some(index => Math.abs(distance[index] - distance[turn.index]) < 8)) continue;
    checkpoints.set(turn.index, turn);
  }
  const ordered = [...checkpoints.values()].sort((a, b) => a.index - b.index);
  return ordered.map((item, i) => {
    const previous = ordered[i - 1];
    const crossesLanding = route.steps.some(step => smallLandings.has(step.to)
      && step.endIndex > (previous?.index ?? 0) && step.endIndex < item.index);
    const hints = [];
    if (previous?.kind === "turn") hints.push(`${previous.depart} 이동하세요.`);
    if (crossesLanding) hints.push("계단 사이의 평평한 중간참을 걸어서 지나가세요.");
    if (route.steps[0]?.video && previous?.title === floorNames.M34 && item.title === "지하 1층 도착 지점") {
      return { ...item, detail: "합류부에서 직진해 정면 공용 계단을 내려가세요." };
    }
    return { ...item, detail: [...hints, item.detail].join(" ") };
  });
}
