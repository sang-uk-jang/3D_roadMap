import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findRoute, routeCheckpoints } from "../src/routes.js";
import { samplePath } from "../src/station-view.js";
import { Vector3 } from "three";

const graph = JSON.parse(readFileSync(new URL("../../artifacts/navigation/navigation.json", import.meta.url)));
const nodes = new Map(graph.nodes.map(node => [node.id, node]));

test("a continuous, modeled route connects every pair of public destinations", () => {
  for (const start of graph.places) {
    for (const end of graph.places) {
      if (start.id === end.id) continue;
      const route = findRoute(graph, start.id, end.id);
      assert.ok(route);
      assert.deepEqual(route.points[0], nodes.get(start.id).position);
      assert.deepEqual(route.points.at(-1), nodes.get(end.id).position);
      const checkpoints = routeCheckpoints(route, end.name);
      assert.equal(checkpoints.at(-1).index, route.points.length - 1);
      assert.equal(checkpoints.at(-1).kind, "destination");
      assert.ok(checkpoints.every((point, index) => point.index > (checkpoints[index - 1]?.index ?? 0)));
      for (let i = 1; i < route.nodes.length; i++) {
        const a = route.nodes[i - 1];
        const b = route.nodes[i];
        const edge = graph.edges.find(item =>
          (item.from === a && item.to === b) || (item.from === b && item.to === a));
        assert.ok(edge);
        assert.equal(edge.kind === "walk", nodes.get(a).floorId === nodes.get(b).floorId);
      }
    }
  }
});

test("Exit 3 walks across a flat landing and joins Exit 4 before the common B1 stair", () => {
  const route = findRoute(graph, "connector-4-upper", "l5-acha");
  assert.ok(route.steps[0].video);
  assert.equal(route.steps[0].from, "G");
  assert.equal(route.steps[0].to, "M34");
  assert.equal(route.steps[0].kind, "escalator");
  const from3 = findRoute(graph, "connector-3-upper", "l5-acha");
  assert.deepEqual(from3.steps.filter(step => step.kind === "stairs").slice(0, 3)
    .map(step => [step.from, step.to]), [["G", "M3"], ["M3", "M34"], ["M34", "B1"]]);
  const landing = from3.steps.find(step => step.kind === "walk" && step.to === "M3");
  assert.ok(landing.endIndex > landing.startIndex);
  const flat = from3.points.slice(landing.startIndex, landing.endIndex + 1);
  assert.ok(flat.every(point => point[1] === flat[0][1]));
  assert.ok(Math.hypot(flat.at(-1)[0] - flat[0][0], flat.at(-1)[2] - flat[0][2]) > 1);
  const checkpoints = routeCheckpoints(from3, "5호선 아차산 방면");
  assert.ok(checkpoints.every(checkpoint => checkpoint.title !== "3번 출구 중간참"));
  assert.match(checkpoints[0].detail, /중간참을 걸어서/);
  assert.ok(checkpoints.some(checkpoint => checkpoint.title === "3·4번 출구 합류부"));
  const cross = findRoute(graph, "connector-3-upper", "connector-4-upper");
  assert.ok(cross.nodes.every(id => nodes.get(id).floorId !== "B1"));
});

test("other paired exits share their landings", () => {
  for (const [start, end, floor] of [[1, 2, "M12"], [5, 6, "M56"], [7, 8, "B1"]]) {
    const pair = findRoute(graph, `connector-${start}-upper`, `connector-${end}-upper`);
    assert.ok(pair.steps.some(step => step.kind === "walk" && step.to === floor));
    assert.ok(pair.nodes.every(id => ["G", floor, "M2", "M7"].includes(nodes.get(id).floorId)));
  }
  const route = findRoute(graph, "connector-7-upper", "connector-8-upper");
  assert.deepEqual(route.steps.filter(step => step.type === "level").map(step => step.kind),
    ["stairs", "stairs", "escalator-pair"]);
  assert.ok(route.steps.some(step => step.type === "walk" && step.to === "M7"));
  assert.equal(routeCheckpoints(route, "8번 출구").length, 2);
  const cross = findRoute(graph, "connector-4-upper", "l5-acha");
  assert.deepEqual(routeCheckpoints(cross, "5호선 아차산 방면").map(point => point.title),
    ["3·4번 출구 합류부", "지하 1층 도착 지점", "지하 2층 도착 지점", "5호선 아차산 방면"]);
});

test("Exit 4 continues straight through the shared landing and down the common stairs", () => {
  const route = findRoute(graph, "connector-4-upper", "l5-acha");
  const [upper, joint, lower] = route.steps;
  assert.equal(joint.type, "walk");
  assert.equal(joint.from, "M34");
  const delta = step => new Vector3(...route.points[step.endIndex])
    .sub(new Vector3(...route.points[step.startIndex])).setY(0).normalize();
  assert.ok(delta(upper).dot(delta(joint)) > .995);
  assert.ok(delta(joint).dot(delta(lower)) > .995);
  assert.equal(joint.endIndex - joint.startIndex, 1);
  assert.match(routeCheckpoints(route, "5호선")[1].detail, /직진해 정면 공용 계단/);
});

test("no unconfirmed step-free vertical links are offered", () => {
  assert.equal(findRoute(graph, "connector-4-upper", "l5-acha", { stepFree: true }), null);
  assert.ok(findRoute(graph, "l5-jang", "l5-acha", { stepFree: true }));
});

test("facility entrances and sampled stair treads are available in both travel directions", () => {
  for (const id of ["toilet", "tickets-central", "gates-west", "gates-east", "gates-5", "lift-b1"]) {
    assert.equal(graph.places.find(place => place.id === id)?.floorId, "B1");
    assert.ok(findRoute(graph, "connector-4-upper", id));
  }
  const edge = graph.edges.find(edge => edge.from === "connector-4-lower");
  assert.equal(edge.treads.length, edge.geometry.length - 1);
  for (const profile of edge.treads.filter(Boolean)) {
    assert.ok(profile.length > 1);
    assert.ok(profile.every(Number.isFinite));
  }
  const ascending = findRoute(graph, edge.from, edge.to);
  const descending = findRoute(graph, edge.to, edge.from);
  assert.deepEqual(ascending.treads, edge.treads);
  assert.deepEqual(descending.treads, edge.treads.slice().reverse().map(flight => flight?.slice().reverse() ?? null));
});

test("the B1 ticket bank is the only ticket destination and is reached from Exit 4 outside the gates", () => {
  const ticketPlaces = graph.places.filter(place => /표 사는 곳/.test(place.name));
  assert.deepEqual(ticketPlaces.map(place => place.id), ["tickets-central"]);
  const route = findRoute(graph, "connector-4-upper", ticketPlaces[0].id);
  assert.deepEqual(route.points.at(-1), nodes.get("tickets-central").position);
  const [west] = nodes.get("gates-west").position;
  const [east] = nodes.get("gates-east").position;
  assert.ok(route.points.filter(([, y]) => Math.abs(y - graph.floors.B1) < .1)
    .every(([x]) => x > west && x < east));
});

test("recognizable B1 landmarks are valid starting points and destinations", () => {
  const landmarks = graph.places.filter(place => place.group === "현장 기준점");
  assert.deepEqual(new Set(landmarks.map(place => place.id)),
    new Set(["gs25-b1", "column-34", "column-56", "map-board-78"]));
  for (const place of landmarks) {
    assert.equal(place.floorId, "B1");
    assert.ok(findRoute(graph, place.id, "l5-acha"));
    const route = findRoute(graph, "connector-8-upper", place.id);
    assert.ok(routeCheckpoints(route, place.name, place.landmark).at(-1).detail.includes(place.landmark));
  }
  const gates = graph.places.find(place => place.id === "gates-east");
  assert.match(gates.landmark, /둥근 타일 기둥/);
  assert.doesNotMatch(gates.landmark, /GS25/);
  const shop = landmarks.find(place => place.id === "gs25-b1");
  const fromExit4 = findRoute(graph, "connector-4-upper", shop.id);
  const approach = fromExit4.steps.find(step => step.type === "walk" && step.from === "B1");
  const [x, y, z] = fromExit4.points[approach.startIndex];
  const before = fromExit4.points[approach.startIndex - 2];
  const after = fromExit4.points[approach.startIndex + 1];
  const along = new Vector3(x, y, z).sub(new Vector3(...before)).setY(0);
  const turn = new Vector3(...after).sub(new Vector3(x, y, z)).setY(0);
  assert.ok(along.x * turn.z - along.z * turn.x > 0);
  assert.ok(new Vector3(...nodes.get(shop.id).position).distanceTo(new Vector3(x, y, z)) < 10);
  assert.match(routeCheckpoints(fromExit4, shop.name, shop.landmark).at(-1).detail, /첫 우회전 코너/);
});

test("the first-person center descends evenly while the character follows individual treads", () => {
  const points = [new Vector3(0, 4, 0), new Vector3(8, 0, 0)];
  const cumulative = [0, points[0].distanceTo(points[1])];
  const stair = [[4, 4, 3, 3, 2, 2, 1, 1, 0]];
  const heights = [0, .25, .5, .75, 1].map(portion =>
    samplePath(points, cumulative, stair, portion * cumulative[1]).center.y);
  assert.deepEqual(heights, [4, 3, 2, 1, 0]);
  const sample = samplePath(points, cumulative, stair, .34 * cumulative[1]);
  assert.ok(sample.pos.y > sample.center.y);
});

test("unknown IDs and same-origin routes are handled", () => {
  assert.throws(() => findRoute(graph, "missing", "l5-acha"));
  assert.equal(findRoute(graph, "l5-acha", "l5-acha").points.length, 1);
});
