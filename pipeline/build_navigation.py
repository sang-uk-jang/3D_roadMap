"""Bake a compact route graph from the editable station slabs and obstacles."""

from collections import defaultdict
from functools import lru_cache
from heapq import heappop, heappush
from itertools import combinations
from math import ceil, dist, hypot
from pathlib import Path
import json
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


output = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
layout = json.loads(bpy.context.scene["Navigation layout"])
floors = layout["floors"]
areas = {area["id"]: area["floor"] for area in layout["areas"]}
nodes, edges, places = [], [], []


def add_node(node_id, floor, x, z):
    item = {"id": node_id, "floorId": floor, "position": [x, floors[floor], z]}
    nodes.append(item)
    return item


def add_place(node, name, english, group):
    places.append({"id": node["id"], "floorId": node["floorId"],
                   "name": name, "english": english, "group": group})


def add_edge(a, b, points, kind, **data):
    length = sum(dist(start, end) for start, end in zip(points, points[1:]))
    edges.append({"from": a["id"], "to": b["id"], "geometry": points, "cost": round(length, 3),
                  "kind": kind, "status": "diagram-model", **data})


def make_tree(objects, materials=None):
    vertices, triangles = [], []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ vert.co for vert in mesh.vertices)
        triangles.extend(tuple(offset + index for index in tri.vertices) for tri in mesh.loop_triangles
                         if materials is None or mesh.materials[tri.material_index].name in materials)
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True)


DOWN = Vector((0, 0, -1))
LEVELS = ("B1", "B2", "B3")
WALL_OBJECTS = [obj for level in LEVELS
                for obj in bpy.data.collections[f"{level} · Estimated walls and barriers"].objects]
FACILITY_OBJECTS = [obj for level in LEVELS + ("G",)
                    for obj in bpy.data.collections[f"{level} · Facilities"].all_objects]
LIFTS = [obj for obj in bpy.data.collections["Stairs, escalators and elevators"].all_objects
         if obj.get("module") == "elevator" or obj.name.startswith("Lift ")]
STAIR_OBJECTS = [obj for obj in bpy.data.collections["Stairs, escalators and elevators"].objects
                 if obj.get("connector_type")]
BLOCKERS = make_tree(WALL_OBJECTS + FACILITY_OBJECTS + LIFTS)
SUPPORT_MATERIALS = {"Stair concrete", "Video reference · escalator tread", "Stair nosing",
                     "Escalator sides and tactile strips"}
RAIL_MATERIALS = {"Wall coping", "Platform barriers · dark framing", "Video reference · tinted balustrade",
                 "Escalator side panels"}
STAIR_RAILS = make_tree(STAIR_OBJECTS, RAIL_MATERIALS)
STAIR_SOLIDS = make_tree(STAIR_OBJECTS)
BODY_RADIUS = .28
PROFILE_STEP = .095


def horizontal_offset(point, normal, offset):
    return [point[0] + normal[0] * offset, point[1], point[2] + normal[1] * offset]


def lane_path(points, offset):
    path = []
    for a, b in zip(points, points[1:]):
        dx, dz = b[0] - a[0], b[2] - a[2]
        length = hypot(dx, dz)
        normal = (-dz / length, dx / length)
        for point in (a, b):
            shifted = horizontal_offset(point, normal, offset)
            if not path or dist(path[-1], shifted) > .01:
                path.append(shifted)
    return path


def bpoint(p):
    return Vector((p[0], -p[2], p[1]))


def clear_body(p, obstacle, ceiling=3.2, radius=BODY_RADIUS):
    corner = radius * .7071
    for dx, dy in ((0, 0), (radius, 0), (-radius, 0), (0, radius), (0, -radius),
                   (corner, corner), (-corner, corner), (corner, -corner), (-corner, -corner)):
        start = p + Vector((dx, dy, ceiling))
        if obstacle.ray_cast(start, DOWN, ceiling - .07)[0] is not None:
            return False
    return True


def flight_profile(a, b, stairs, crossing_stairs, name, require_treads=True):
    start, end = bpoint(a), bpoint(b)
    delta = end - start
    span = hypot(delta.x, delta.y)
    across = Vector((-delta.y, delta.x, 0)).normalized() * BODY_RADIUS
    along = Vector((delta.x, delta.y, 0)).normalized() * BODY_RADIUS
    count = max(1, ceil(span / PROFILE_STEP))
    heights = []
    for i in range(count + 1):
        sample = start.lerp(end, i / count)
        elevations = []
        for origin in (sample, sample + across, sample - across, sample + along, sample - along):
            hit, *_ = stairs.ray_cast(origin + Vector((0, 0, .83)), DOWN, 1.36)
            if hit is not None:
                elevations.append(hit.z)
        if require_treads and not elevations and 0 < i < count:
            raise ValueError(f"{name}: missing stair tread near {tuple(sample)}")
        height = max(elevations, default=sample.z)
        if not require_treads:
            height = max(height, sample.z)
        contact = Vector((sample.x, sample.y, height + .065))
        if not clear_body(contact, BLOCKERS):
            raise ValueError(f"{name}: wall or facility intersects stair near {tuple(contact)}")
        if not clear_body(contact, crossing_stairs, 1.82):
            raise ValueError(f"{name}: another stair intersects this flight near {tuple(contact)}")
        if not clear_body(contact, STAIR_RAILS, 1.82):
            hits = [obj.name for obj in STAIR_OBJECTS
                    if not clear_body(contact, make_tree([obj], RAIL_MATERIALS), 1.82)]
            raise ValueError(f"{name}: stair rail near {tuple(contact)}: {hits}")
        heights.append(round(contact.z, 4))
    return heights


def approach(contacts, key, area):
    origin, flight = contacts[:2] if key == "lower" else [contacts[-1], contacts[-2]]
    floor = areas.get(area, area)
    dx, dz = origin[0] - flight[0], origin[2] - flight[2]
    gap = hypot(dx, dz)
    setback = .83 if floor != "G" else 1.35
    return floor, round(origin[0] + setback * dx / gap, 4), round(origin[2] + setback * dz / gap, 4)


def check_approach(origin, endpoint, crossing_stairs, name):
    floor, x, z = endpoint
    landing = bpoint((x, floors[floor], z))
    if not clear_body(landing, STAIR_SOLIDS, 1.82, radius=.36):
        objects = [obj.name for obj in STAIR_OBJECTS
                   if not clear_body(landing, make_tree([obj]), 1.82, radius=.36)]
        raise ValueError(f"{name}: stair overlaps landing near {tuple(landing)}: {objects}")
    for i in range(11):
        location = bpoint(origin).lerp(landing, i / 10)
        if (not clear_body(location, BLOCKERS) or not clear_body(location, STAIR_RAILS, 1.82)
                or not clear_body(location, crossing_stairs, 1.82)):
            raise ValueError(f"{name}: blocked landing near {tuple(location)}")

connector_labels = [
    "7호선 중곡 쪽 대합실", "7호선 중곡 방면 승강장", "7호선 어린이대공원 방면 승강장",
    "7호선 어린이대공원 쪽 대합실", "7호선 어린이대공원 방면 승강장",
    "7호선 중곡 방면 승강장", "5호선 장한평 쪽 계단", "5호선 아차산 쪽 계단",
    "장한평 쪽 환승통로", "아차산 쪽 환승통로",
]

for i, connector in enumerate(layout["connectors"]):
    contacts = []
    for key in ("lower", "upper"):
        area, x, z = connector[key]
        contacts.append([x, floors[areas.get(area, area)], z])
    points = contacts.copy()
    kind = connector["kind"]
    if "bend" in connector:
        a, b = points
        x, z, fraction = connector["bend"]
        points.insert(1, [x, round(a[1] + fraction * (b[1] - a[1]), 4), z])
    stairs_mesh = make_tree([bpy.data.objects[connector["id"]]], SUPPORT_MATERIALS)
    adjacent = make_tree([obj for obj in STAIR_OBJECTS if obj.name != connector["id"]], SUPPORT_MATERIALS)
    quarter = connector["width"] / 4
    lanes = (quarter, -quarter) if kind == "escalator-pair" else (0, .55, -.55, 1.1, -1.1)
    errors = []
    for offset in lanes:
        lane = lane_path(points, offset) if offset else points
        try:
            profiles = [flight_profile(a, b, stairs_mesh, adjacent, connector["id"]) for a, b in zip(lane, lane[1:])]
            lower_approach = approach(lane, "lower", connector["lower"][0])
            upper_approach = approach(lane, "upper", connector["upper"][0])
            check_approach(lane[0], lower_approach, adjacent, connector["id"])
            check_approach(lane[-1], upper_approach, adjacent, connector["id"])
            ground_endpoints = [[x, floors[floor], z] for floor, x, z in (lower_approach, upper_approach)]
            approach_profiles = [
                flight_profile(a, b, stairs_mesh, adjacent, connector["id"], require_treads=False)
                for a, b in ((ground_endpoints[0], lane[0]), (lane[-1], ground_endpoints[1]))
            ]
        except ValueError as failure:
            errors.append(str(failure))
        else:
            points = lane
            break
    else:
        raise ValueError("; ".join(errors))
    lower = add_node(f"connector-{i + 1}-lower", *lower_approach)
    upper = add_node(f"connector-{i + 1}-upper", *upper_approach)
    points = [lower["position"], *points, upper["position"]]
    if "exit" in connector:
        number = connector["exit"]
        add_place(upper, f"{number}번 출구", f"Exit {number}", "출구")
        label = f"{number}번 출구 연결부"
    else:
        label = connector_labels[i - 8]
    if "lowerKind" in connector:
        kind = "stairs-escalator"
    add_edge(lower, upper, points, kind, label=label, treads=[approach_profiles[0], *profiles, approach_profiles[1]],
             videoAppearance=connector["id"] == "Exit 4" and "lowerKind" in connector)

for id_, floor, x, z, name, english, group in [
    ("l5-jang", "B2", -3.6, 68, "5호선 장한평 방면", "Line 5 · Janghanpyeong", "승강장"),
    ("l5-acha", "B2", 3.6, -67, "5호선 아차산 방면", "Line 5 · Achasan", "승강장"),
    ("l7-jung", "B3", -43, -17.3, "7호선 중곡 방면", "Line 7 · Junggok", "승강장"),
    ("l7-park", "B3", 39, -3.5, "7호선 어린이대공원 방면", "Line 7 · Children’s Grand Park", "승강장"),
    ("help", "B1", -78.2, -7, "7호선 고객안전실 앞", "Line 7 · Information", "시설"),
]:
    add_place(add_node(id_, floor, x, z), name, english, group)

for item in layout.get("facilityDestinations", [
    {"id": "toilet", "floor": "B2", "point": [-.7, 14], "name": "화장실 앞", "english": "Restroom"},
]):
    add_place(add_node(item["id"], item["floor"], *item["point"]), item["name"], item["english"], "시설")


STEP = .82
CLEARANCE = .36
CHECK_SPACING = .15
OFFSETS = [(0, 0), (CLEARANCE, 0), (-CLEARANCE, 0), (0, CLEARANCE), (0, -CLEARANCE)]
NEIGHBORS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


class LevelGraph:
    def __init__(self, floor):
        self.y = floors[floor]
        self.slab = make_tree(bpy.data.collections[f"{floor} · Slabs"].objects)
        boundaries = list(bpy.data.collections[f"{floor} · Estimated walls and barriers"].objects)
        fittings = list(bpy.data.collections[f"{floor} · Facilities"].all_objects)
        boundaries.extend(LIFTS)
        if floor == "B1" and "B1 · Ticket and recharge equipment" in bpy.data.objects:
            fittings.append(bpy.data.objects["B1 · Ticket and recharge equipment"])
        self.obstacles = make_tree(boundaries + fittings)

    @lru_cache(maxsize=None)
    def usable(self, x, z):
        for dx, dz in OFFSETS:
            p = Vector((x + dx, -z - dz, self.y + 3))
            if self.slab.ray_cast(p, DOWN, 3.04)[0] is None:
                return False
            if self.obstacles.ray_cast(p, DOWN, 2.92)[0] is not None:
                return False
            p.z = self.y + 1.82
            if STAIR_SOLIDS.ray_cast(p, DOWN, 1.74)[0] is not None:
                return False
        return True

    def segment(self, a, b):
        count = max(1, ceil(dist(a, b) / CHECK_SPACING))
        return all(self.usable(round(a[0] + (b[0] - a[0]) * i / count, 4),
                               round(a[1] + (b[1] - a[1]) * i / count, 4))
                   for i in range(count + 1))

    def position(self, key):
        return round(key[0] * STEP, 4), round(key[1] * STEP, 4)

    def snapped(self, location):
        i, j = (round(value / STEP) for value in location)
        for radius in (1, 2, 3, 4):
            keys = [(i + a, j + b) for a in range(-radius, radius + 1)
                    for b in range(-radius, radius + 1)]
            keys.sort(key=lambda key: dist(location, self.position(key)))
            for key in keys:
                if self.segment(location, self.position(key)):
                    return key
        return None

    @lru_cache(maxsize=None)
    def grid_neighbors(self, key):
        i, j = key
        return [(other, hypot(di, dj) * STEP)
                for di, dj in NEIGHBORS
                if self.segment(self.position(key), self.position(other := (i + di, j + dj)))]

    def path(self, a, b, start, goal):
        if self.segment(a, b):
            return [a, b]
        heap = [(0, 0, start)]
        costs, previous = {start: 0}, {}
        while heap:
            _, cost, key = heappop(heap)
            if cost != costs[key]:
                continue
            if key == goal:
                keys = [goal]
                while keys[-1] != start:
                    keys.append(previous[keys[-1]])
                full = [a, *(self.position(key) for key in reversed(keys)), b]
                result = [a]
                index = 0
                while index < len(full) - 1:
                    far = len(full) - 1
                    while far > index + 1 and not self.segment(full[index], full[far]):
                        far -= 1
                    result.append(full[far])
                    index = far
                return result
            for other, weight in self.grid_neighbors(key):
                candidate = cost + weight
                if candidate < costs.get(other, float("inf")):
                    costs[other] = candidate
                    previous[other] = key
                    heappush(heap, (candidate + dist(other, goal) * STEP, candidate, other))
        return None


def xz(node):
    x, _, z = node["position"]
    return x, z


for floor in ("B1", "B2", "B3"):
    graph = LevelGraph(floor)
    terminals = [node for node in nodes if node["floorId"] == floor]
    snapped = {node["id"]: graph.snapped(xz(node)) for node in terminals}
    isolated = [node["id"] for node in terminals if snapped[node["id"]] is None]
    if isolated:
        raise RuntimeError(f"{floor} · Unreachable landings: {isolated}")
    for a, b in combinations(terminals, 2):
        points = graph.path(xz(a), xz(b), snapped[a["id"]], snapped[b["id"]])
        if points:
            assert all(graph.segment(p, q) for p, q in zip(points, points[1:]))
            add_edge(a, b, [[x, floors[floor], z] for x, z in points], "walk")
    graph.usable.cache_clear()
    graph.grid_neighbors.cache_clear()

neighbors = defaultdict(set)
for edge in edges:
    neighbors[edge["from"]].add(edge["to"])
    neighbors[edge["to"]].add(edge["from"])
seen, stack = set(), [places[0]["id"]]
while stack:
    node = stack.pop()
    if node not in seen:
        seen.add(node)
        stack.extend(neighbors[node] - seen)
assert len(seen) == len(nodes), f"Disconnected nodes: {set(neighbors) - seen}"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({
    "stationId": "gunja", "scaleStatus": "diagram", "upAxis": "Y",
    "floors": floors, "nodes": nodes, "edges": edges, "places": places,
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"PASS: {len(nodes)} connected nodes, {len(edges)} checked edges, {len(places)} route places.")
