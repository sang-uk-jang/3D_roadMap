import assert from "node:assert/strict";
import { describeRoute, findRoute } from "../src/routes.js";

const base = process.env.METROLENS_TEST_URL ?? "http://127.0.0.1:8080";
const api = new URL("/api/stations/gunja", base).href;
const get = async suffix => {
  const response = await fetch(api + suffix);
  assert.equal(response.status, 200);
  return response.json();
};
const post = params => fetch(api + "/routes", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
});

const station = await get("");
const graph = await get("/navigation");
assert.equal(station.stationId, "gunja");
assert.deepEqual(await get("/floors"), graph.floors);
assert.deepEqual(await get("/facilities"), graph.places);
assert.equal((await fetch(new URL(station.modelUrl, base))).status, 200);

const length = points => points.slice(1).reduce((sum, b, index) => {
  const a = points[index];
  return sum + Math.hypot(...b.map((value, axis) => value - a[axis]));
}, 0);
let routes = 0;
for (const { id: start } of graph.places) {
  for (const { id: end } of graph.places) {
    if (start === end) continue;
    const local = findRoute(graph, start, end);
    const response = await post({ startNodeId: start, endNodeId: end });
    assert.equal(response.status, 200);
    const server = await response.json();
    assert.deepEqual(server.polyline[0], local.points[0]);
    assert.deepEqual(server.polyline.at(-1), local.points.at(-1));
    assert.ok(Math.abs(length(server.polyline) - length(local.points)) < .01);
    const described = describeRoute(graph, start, server.segments);
    assert.deepEqual(described.points, server.polyline);
    assert.equal(described.treads.length, described.points.length - 1);
    routes++;
  }
}
assert.equal((await post({})).status, 400);
assert.equal((await post({ startNodeId: "unknown", endNodeId: "l5-acha" })).status, 404);
assert.equal((await post({ startNodeId: "connector-4-upper", endNodeId: "l5-acha",
  accessibleOnly: true })).status, 422);
const stair = await (await post({ startNodeId: "connector-4-upper", endNodeId: "connector-4-lower" })).json();
assert.deepEqual(describeRoute(graph, stair.nodeIds[0], stair.segments).treads,
  findRoute(graph, stair.nodeIds[0], stair.nodeIds.at(-1)).treads);
console.log(`PASS: station, floor, facility and graph endpoints, GLB response, ${routes} routes, and error responses.`);
