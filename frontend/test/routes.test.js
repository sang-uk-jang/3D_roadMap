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

test("the Exit 4 route includes its video-informed lower stair and upper escalator", () => {
  const route = findRoute(graph, "connector-4-upper", "l5-acha");
  assert.ok(route.steps[0].video);
  assert.equal(route.steps[0].from, "G");
  assert.equal(route.steps[0].to, "B1");
  assert.ok(route.steps[0].detail.includes("계단·에스컬레이터"));
  const checkpoints = routeCheckpoints(route, "5호선 아차산 방면");
  assert.deepEqual(checkpoints.map(point => point.kind),
    ["entry", "landing", "landing", "turn", "entry", "landing", "destination"]);
  assert.match(checkpoints[1].title, /계단으로 이어지는 중간참/);
  assert.match(checkpoints[2].detail, /계단으로 내려가 지하 1층/);
});

test("no unconfirmed step-free vertical links are offered", () => {
  assert.equal(findRoute(graph, "connector-4-upper", "l5-acha", { stepFree: true }), null);
  assert.ok(findRoute(graph, "l5-jang", "l5-acha", { stepFree: true }));
});

test("facility entrances and sampled stair treads are available in both travel directions", () => {
  for (const id of ["toilet", "tickets", "tickets-central", "gates-west", "gates-east", "gates-5", "lift-b1"]) {
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
