"""Build the Gunja station diagram as editable Blender geometry and glTF."""

import argparse
from collections import Counter
import json
from math import atan2, ceil, cos, radians, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt


parser = argparse.ArgumentParser()
parser.add_argument("--layout", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--preview-dir", type=Path, required=True)
parser.add_argument("--quick", action="store_true")
parser.add_argument("--details", type=Path)
parser.add_argument("--modules", type=Path)
parser.add_argument("--basename", default="gunja")
parser.add_argument("--no-preview", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
args.output = args.output.resolve()
args.preview_dir = args.preview_dir.resolve()
layout = json.loads(args.layout.read_text(encoding="utf-8"))
elevations = layout["floors"]
areas = {area["id"]: area for area in layout["areas"]}
connectors = layout["connectors"]
video_details = None
if args.details:
    video_details = json.loads(args.details.read_text(encoding="utf-8"))
    selected = next(item for item in connectors if item["id"] == video_details["connector"])
    selected.update(bend=video_details["bend"], upperKind=video_details["upperKind"],
                    lowerKind=video_details["lowerKind"])
    landing = next(area for area in layout["areas"] if area["id"] == selected["lower"][0])
    landing["polygons"].append(video_details["landingPolygon"])
modules = json.loads(args.modules.read_text(encoding="utf-8")) if args.modules else None
if modules:
    revised = {item["id"]: item for item in modules["facilities"]}
    layout["facilities"] = [item for item in layout["facilities"] if item["id"] not in revised]
    layout["facilities"].extend(revised.values())
    layout["facilityDestinations"] = modules["destinations"]
    for connector in connectors:
        if connector["id"] in modules["connectorClearance"]:
            connector["lower"][1:] = modules["connectorClearance"][connector["id"]]
    for landing in modules["landingPolygons"]:
        areas[landing["area"]]["polygons"].append(landing["polygon"])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene["Reference"] = layout["source"]
scene["Scale"] = "Relative diagram geometry; survey dimensions unavailable"
scene["Boundary interpretation"] = layout["boundaryPolicy"]
scene["Navigation layout"] = json.dumps(layout, ensure_ascii=False)


def collection(name, parent=None):
    group = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(group)
    return group


floor_groups = {level: collection(level) for level in elevations}
floor_meshes = {level: collection(f"{level} · Slabs", group)
               for level, group in floor_groups.items()}
walls = {level: collection(f"{level} · Estimated walls and barriers", group)
         for level, group in floor_groups.items()}
fittings = {level: collection(f"{level} · Facilities", group)
            for level, group in floor_groups.items()}
rail_group = collection("Tracks and trains")
circulation = collection("Stairs, escalators and elevators")
elevator_group = collection("Module · Elevators", circulation) if modules else circulation
exit_group = collection("Exits 1–8", floor_groups["G"])
studio = collection("Preview cameras and lighting")


def linear(n):
    return n / 12.92 if n <= .04045 else ((n + .055) / 1.055) ** 2.4


def material(name, color, metallic=0, roughness=.65):
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


palette = {
    "concourse": ("Concourse · limestone", "d9d8d1"),
    "line5": ("Line 5 · lavender platform", "b7add2"),
    "line7": ("Line 7 · sage platforms", "a9bd9e"),
    "slab": ("Slab edges", "9b9e99"),
    "wall": ("Estimated exterior walls", "687774"),
    "cap": ("Wall coping", "c0c9c3"),
    "screen": ("Platform barriers · glazing panels", "779597"),
    "frame": ("Platform barriers · dark framing", "3f5457"),
    "concrete": ("Stair concrete", "a4a9a7"),
    "tread": ("Stair nosing", "e5e6de"),
    "yellow": ("Escalator sides and tactile strips", "e8c84d"),
    "yellowSide": ("Escalator side panels", "e8c84d"),
    "exit": ("Exit number signs", "ffdc39"),
    "ink": ("Wayfinding lettering", "182627"),
    "lift": ("Elevator shafts", "9aba74"),
    "liftDark": ("Elevator framing", "465c3c"),
    "bed": ("Track beds", "484b4c"),
    "sleeper": ("Sleepers", "6c716d"),
    "rail": ("Rails", "a8afae"),
    "train": ("Train shells", "e8ebe7"),
    "window": ("Train windows", "344f61"),
    "stripe5": ("Train stripe · Line 5", "7b4da3"),
    "stripe7": ("Train stripe · Line 7", "738832"),
    "bench": ("Benches", "868f91"),
    "facility": ("Facilities", "a7b7b2"),
    "marking": ("Platform markings", "e8e5d1"),
    "tile": ("Video reference · white ceramic tile", "e5e3da"),
    "steel": ("Video reference · stainless steel", "acb4b3"),
    "rib": ("Video reference · escalator tread", "444946"),
    "glass": ("Video reference · tinted balustrade", "a4c3ba"),
    "gateGo": ("Gate status · green", "408971"),
    "gateStop": ("Gate status · red", "a1524a"),
    "blue": ("Video reference · blue equipment housing", "344e8b"),
    "bezel": ("Video reference · equipment display", "729cbb"),
    "signWhite": ("Facility lettering", "fcfbf0"),
    "signBlue": ("Restroom wayfinding blue", "17668b"),
    "signOlive": ("Lift wayfinding olive", "3b6347"),
    "gateGlass": ("Fare gate swing panels", "588e85"),
}
mats = {key: material(*value) for key, value in palette.items()}


class Geometry:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.keys = []

    def face(self, indices, key):
        self.faces.append(tuple(indices))
        self.keys.append(key)

    def box(self, center, size, key, angle=0):
        x, y, z = center
        dx, dy, dz = (dim / 2 for dim in size)
        offset = len(self.verts)
        for local_z in (-dz, dz):
            for u, v in ((-dx, -dy), (dx, -dy), (dx, dy), (-dx, dy)):
                self.verts.append((x + u * cos(angle) - v * sin(angle),
                                   y + u * sin(angle) + v * cos(angle), z + local_z))
        for face in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face((offset + i for i in face), key)

    def create(self, name, group, status, **metadata):
        if not self.faces:
            return None
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        if mesh.validate():
            raise ValueError(f"Invalid generated mesh: {name}")
        mesh.update()
        keys = list(dict.fromkeys(self.keys))
        indices = {key: i for i, key in enumerate(keys)}
        for key in keys:
            mesh.materials.append(mats[key])
        for face, key in zip(mesh.polygons, self.keys):
            face.material_index = indices[key]
        obj = bpy.data.objects.new(name, mesh)
        group.objects.link(obj)
        obj["status"] = status
        for key, value in metadata.items():
            obj[key] = value
        return obj


def point(xz, height):
    return Vector((xz[0], -xz[1], height))


def aspect(a, b):
    return atan2(a.y - b.y, a.x - b.x)


def strip(a, b, width, start=0, end=None):
    a, b = Vector(a), Vector(b)
    unit = (b - a).normalized()
    side = Vector((-unit.y, unit.x)) * width / 2
    end = (b - a).length if end is None else end
    return [tuple(a + unit * t + side * sign)
            for t, sign in [(start, 1), (start, -1), (end, -1), (end, 1)]]


def in_polygon(p, poly):
    inside = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a[1] > p[1]) != (b[1] > p[1]):
            if p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
                inside = not inside
    return inside


def distance_to_segment(point, a, b):
    edge = b - a
    fraction = min(1, max(0, (point - a).dot(edge) / edge.length_squared))
    return (point - a - fraction * edge).length


slots = {level: [] for level in elevations}
mouths = {level: [] for level in elevations}
tunnel_steps = []
for start, direction in ((-108, -1), (100, 1)):
    for side in (-17, -3.5):
        top = (start, side)
        end = (start + direction * 3.4, side)
        tunnel_steps.append((top, end))
        mouths["B3"].append((Vector(top), Vector(end), 2.45))


def level_of(area_id):
    return areas[area_id]["floor"] if area_id != "G" else "G"


for connector in connectors:
    upper, lower = connector["upper"], connector["lower"]
    width = connector["width"]
    for endpoint, other in ((upper, connector.get("bend", lower[1:])[:2]),
                            (lower, connector.get("bend", upper[1:])[:2])):
        area_id, *xz = endpoint
        if area_id == "G":
            continue
        level = level_of(area_id)
        areas[area_id]["polygons"].append(strip(xz, other, width + .7, -2.9, .22))
        mouths[level].append((Vector(xz), Vector(other), width))
        if endpoint is upper:
            separation = (Vector(other) - Vector(xz)).length
            vertical = elevations[level] - elevations[level_of(lower[0])]
            if "bend" in connector:
                vertical *= 1 - connector["bend"][2]
            opening = min(separation * .62, max(1.35, 4.4 * separation / vertical))
            slots[level].append(strip(xz, other, width + .26, .08, opening))


def slab(verts, triangles, geometry, height, finish):
    used = sorted({i for face in triangles for i in face})
    mapping = {i: index for index, i in enumerate(used)}
    count = len(used)
    geometry.verts.extend(point(verts[i], height) for i in used)
    geometry.verts.extend(point(verts[i], height - .55) for i in used)
    counts = Counter()
    directed = {}
    for tri in triangles:
        a, b, c = [geometry.verts[mapping[i]] for i in tri]
        if (b - a).cross(c - a).z < 0:
            tri = tri[::-1]
        top = [mapping[i] for i in tri]
        geometry.face(top, finish)
        geometry.face([i + count for i in reversed(top)], "slab")
        for start, end in zip(tri, tri[1:] + tri[:1]):
            key = tuple(sorted((start, end)))
            counts[key] += 1
            directed[key] = (start, end)
    return {key: directed[key] for key, count in counts.items() if count == 1}


def track_edge(level, a, b):
    for track in layout["railways"]:
        if track["floor"] != level:
            continue
        across = 0 if track["axis"] == "z" else 1
        if abs(a[across] - b[across]) > (b - a).length * .33:
            continue
        if min(abs((a[across] + b[across]) / 2 - offset)
               for offset in track["offsets"]) < (5.1 if track["axis"] == "z" else 3.3):
            return True
    return False


def boundaries(level, verts, edges, hole_edges):
    y = elevations[level]
    enclosure, barrier, guard = Geometry(), Geometry(), Geometry()
    for key, (start, end) in edges.items():
        a, b = verts[start], verts[end]
        length = (b - a).length
        if length < .04:
            continue
        runs = ceil(length / 1.2)
        segments = []
        for i in range(runs):
            p = a.lerp(b, (i + .5) / runs)
            is_open = False
            for port, other, width in mouths[level]:
                direction = (other - port).normalized()
                depth = (p - port).dot(direction)
                side = abs((p - port).cross(direction))
                if -.3 < depth < 7.4 and side < width * .47:
                    is_open = True
                    break
            if not is_open:
                if segments and segments[-1][1] == i:
                    segments[-1][1] = i + 1
                else:
                    segments.append([i, i + 1])
        is_screen = track_edge(level, a, b)
        rail_only = key in hole_edges
        for start_i, end_i in segments:
            start_p = point(a.lerp(b, start_i / runs), y)
            end_p = point(a.lerp(b, end_i / runs), y)
            mid = (start_p + end_p) / 2
            span = (end_p - start_p).length
            angle = aspect(end_p, start_p)
            if rail_only:
                guard.box(mid + Vector((0, 0, .82)), (span, .18, .15), "cap", angle)
                for i in range(max(1, ceil(span / 2.3))):
                    p = start_p.lerp(end_p, (i + .5) / max(1, ceil(span / 2.3)))
                    guard.box(p + Vector((0, 0, .41)), (.13, .15, .83), "wall")
            elif is_screen:
                barrier.box(mid + Vector((0, 0, .85)), (span, .23, 1.7), "screen", angle)
                barrier.box(mid + Vector((0, 0, 1.74)), (span, .36, .16), "frame", angle)
                barrier.box(mid + Vector((0, 0, .16)), (span, .3, .32), "frame", angle)
                count = max(1, ceil(span / 2.9))
                for i in range(count):
                    p = start_p.lerp(end_p, (i + .5) / count)
                    barrier.box(p + Vector((0, 0, .87)), (.13, .28, 1.7), "frame", angle)
            else:
                enclosure.box(mid + Vector((0, 0, 1.29)), (span + .04, .43, 2.58), "wall", angle)
                enclosure.box(mid + Vector((0, 0, 2.61)), (span + .06, .48, .10), "cap", angle)
    enclosure.create(f"{level} · Enclosure walls", walls[level], "estimated", floor=level)
    barrier.create(f"{level} · Platform track barriers", walls[level], "estimated", floor=level)
    guard.create(f"{level} · Opening guardrails", walls[level], "estimated", floor=level)


def make_floor(level):
    floor_areas = [area for area in areas.values() if area["floor"] == level]
    fixed_holes = [poly for area in floor_areas for poly in area.get("holes", [])]
    holes = fixed_holes + slots[level]
    vertices, edges, keys = [], [], {}
    for poly in [poly for area in floor_areas for poly in area["polygons"]] + holes:
        indices = []
        for point_xy in poly:
            key = tuple(point_xy)
            if key not in keys:
                keys[key] = len(vertices)
                vertices.append(Vector(key))
            indices.append(keys[key])
        edges.extend(zip(indices, indices[1:] + indices[:1]))
    verts, _, faces, *_ = delaunay_2d_cdt(vertices, list(dict.fromkeys(edges)), [], 0, .0001)
    triangles = {area["id"]: [] for area in floor_areas}
    for tri in faces:
        center = sum((verts[i] for i in tri), Vector((0, 0))) / 3
        if any(in_polygon(center, poly) for poly in holes):
            continue
        for area in floor_areas:
            if any(in_polygon(center, poly) for poly in area["polygons"]):
                triangles[area["id"]].append(tri)
                break
    edge_counts, directed = Counter(), {}
    for area in floor_areas:
        geometry = Geometry()
        edges = slab(verts, triangles[area["id"]], geometry, elevations[level], area["material"])
        edge_counts.update(edges.keys())
        directed.update(edges)
        assert geometry.create(area["id"], floor_meshes[level], area["status"], floor=level)
    outline = {key: directed[key] for key, count in edge_counts.items() if count == 1}
    hole_edges = set()
    for key in outline:
        a, b = (verts[i] for i in key)
        mid = a.lerp(b, .5)
        for poly in holes:
            if any(distance_to_segment(mid, Vector(p), Vector(q)) < .06
                   for p, q in zip(poly, poly[1:] + poly[:1])):
                hole_edges.add(key)
                break
    boundaries(level, verts, outline, hole_edges)
    for connector in connectors:
        for endpoint in (connector["lower"], connector["upper"]):
            area_id, *xz = endpoint
            if level_of(area_id) != level:
                continue
            covered = any(all((verts[b] - verts[a]).cross(Vector(xz) - verts[a]) >= -.01
                              for a, b in zip(tri, tri[1:] + tri[:1]))
                          for tri in triangles[area_id])
            if not covered:
                raise ValueError(f"Connector landing has no slab: {connector['id']} / {area_id}")


for level in ("B1", "B2", "B3"):
    make_floor(level)


def stairs(geometry, lower, upper, width, kind, filmed=False, open_lower=False, open_upper=False):
    delta = upper - lower
    run = Vector((delta.x, delta.y, 0))
    direction = run.normalized()
    side = Vector((-direction.y, direction.x, 0))
    angle = aspect(upper, lower)
    count = max(4, ceil(delta.z / .48), ceil(run.length / 1.02))
    tread = run.length / count
    escalator = kind.startswith("escalator")
    pairs = [-width / 4, width / 4] if kind == "escalator-pair" else [0]
    lane_width = width / len(pairs)
    for i in range(count):
        pos = lower + direction * ((i + .5) * tread)
        pos.z += delta.z * ((i + 1) / count)
        step = delta.z / count
        step_material = "rib" if filmed and escalator else "concrete"
        geometry.box(pos - Vector((0, 0, (step + .48) / 2)),
                     (tread + .018, width, step + .48), step_material, angle)
        geometry.box(pos - direction * tread * .39 + Vector((0, 0, .018)),
                     (min(.16, tread * .2), width - .12, .036),
                     "yellow" if escalator else "tread", angle)
        for shift in pairs:
            for edge in (-1, 1):
                offset = shift + edge * (lane_width / 2 - .10)
                if abs(offset) < .15 and ((open_lower and i * tread < 1.9)
                                         or (open_upper and (count - i - 1) * tread < 1.9)):
                    continue
                edge_pos = pos + side * offset
                if escalator:
                    geometry.box(edge_pos + Vector((0, 0, .36)),
                                 (tread + .035, .20, .87), "glass" if filmed else "yellowSide", angle)
                    geometry.box(edge_pos + Vector((0, 0, .83)),
                                 (tread + .035, .12, .11), "frame", angle)
                else:
                    geometry.box(edge_pos + Vector((0, 0, -.12)),
                                 (tread + .025, .14, .69), "cap", angle)


def mesh_text(name, body, location, rotation, size, key, group):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body, curve.align_x, curve.align_y = body, "CENTER", "CENTER"
    curve.size, curve.extrude = size, .012
    obj = bpy.data.objects.new(name, curve)
    group.objects.link(obj)
    obj.location, obj.rotation_euler = location, rotation
    obj.data.materials.append(mats[key])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def module_point(origin, local, angle):
    x, y, z = local
    return origin + Vector((x * cos(angle) - y * sin(angle), x * sin(angle) + y * cos(angle), z))


def module_label(name, body, center, angle, size, group, **metadata):
    obj = mesh_text(name, body, center, (radians(90), 0, angle), size, "signWhite", group)
    for key, value in metadata.items():
        obj[key] = value


exit_points = {}
connector_count = 0
for connector in connectors:
    upper, lower = connector["upper"], connector["lower"]
    top = point(upper[1:], elevations[level_of(upper[0])])
    bottom = point(lower[1:], elevations[level_of(lower[0])])
    width = connector["width"]
    kind = connector["kind"]
    filmed = video_details is not None and connector["id"] == video_details["connector"]
    geometry = Geometry()
    if "bend" in connector:
        *xz, fraction = connector["bend"]
        mid = point(xz, bottom.z + (top.z - bottom.z) * fraction)
        stairs(geometry, bottom, mid, width, connector.get("lowerKind", kind), filmed, open_upper=True)
        stairs(geometry, mid, top, width, connector.get("upperKind", kind), filmed, open_lower=True)
        geometry.box(mid - Vector((0, 0, .22)), (width * .83, width * .83, .44), "concrete")
    else:
        stairs(geometry, bottom, top, width, kind)
    geometry.create(connector["id"], circulation,
                    "map anchors; video-informed appearance" if filmed else "map-derived; dimensions estimated",
                    lower=lower[0], upper=upper[0], connector_type=kind)
    connector_count += 1
    if "exit" in connector:
        number = connector["exit"]
        direction = Vector((top.x - bottom.x, top.y - bottom.y, 0)).normalized()
        platform = Geometry()
        angle = aspect(top, bottom)
        platform.box(top + direction * 1.35 - Vector((0, 0, .26)),
                     (2.75, width + .46, .52), "concrete", angle)
        location = top + direction * 1.8 + Vector((0, 0, 2.04))
        platform.box(location - Vector((0, 0, 1.1)), (.19, .2, 2.2), "frame")
        platform.box(location, (3.15, .19, 3.15), "exit", radians(27))
        platform.create(f"Exit {number} · Entrance landing and sign", exit_group, "map-derived")
        sign_face = Vector((sin(radians(27)), -cos(radians(27)), 0))
        mesh_text(f"Exit {number} numeral", str(number), location + sign_face * .12,
                  (radians(90), 0, radians(27)), 2.46, "ink", exit_group)
        exit_points[number] = location

for index, (top, end) in enumerate(tunnel_steps, start=1):
    geometry = Geometry()
    stairs(geometry, point(end, elevations["B3"] - 1.1),
           point(top, elevations["B3"]), 2.45, "stairs")
    geometry.create(f"B3 · Tunnel end steps {index}", circulation,
                    "map-derived; tunnel interior outside diagram", floor="B3")


for elevator in layout["elevators"]:
    stops = sorted(elevations[level_of(area)] for area in elevator["stops"])
    base = point(elevator["point"], stops[0])
    height = stops[-1] - stops[0] + 2.75
    geometry = Geometry()
    geometry.box(base + Vector((0, 0, height / 2)), (2.44, 2.3, height), "lift")
    for x in (-1.17, 1.17):
        for y in (-1.10, 1.10):
            geometry.box(base + Vector((x, y, height / 2)), (.12, .12, height), "liftDark")
    for stop in stops:
        start = point(elevator["point"], stop)
        geometry.box(start + Vector((0, 0, .10)), (2.65, 2.52, .19), "liftDark")
        geometry.box(start + Vector((0, -1.18, 1.08)), (1.48, .11, 2.15), "liftDark")
        for x in (-.35, .35):
            geometry.box(start + Vector((x, -1.245, 1.06)), (.66, .025, 1.94), "facility")
        geometry.box(start + Vector((0, 0, 2.23)), (2.60, 2.45, .11), "liftDark")
        if modules:
            floor = next(key for key, elevation in elevations.items() if elevation == stop)
            geometry.box(start + Vector((0, -1.27, 2.40)), (1.68, .19, .40), "signOlive")
            geometry.box(start + Vector((.94, -1.24, 1.19)), (.26, .12, .62), "steel")
            geometry.box(start + Vector((.94, -1.31, 1.17)), (.11, .03, .11), "gateGo")
            geometry.box(start + Vector((0, -1.37, .053)), (1.53, .41, .09), "steel")
            module_label(f"{elevator['id']} · {floor} sign", f"LIFT {floor}",
                         start + Vector((0, -1.38, 2.40)), 0, .30, elevator_group, floor=floor)
    geometry.create(elevator["id"], elevator_group, elevator["status"],
                    stops=", ".join(elevator["stops"]), module="elevator")


def railway(track):
    floor = track["floor"]
    base = elevations[floor] - .64
    axis = track["axis"]
    start, end = track["span"]
    along = Vector((1, 0, 0)) if axis == "x" else Vector((0, -1, 0))
    side = Vector((-along.y, along.x, 0))
    angle = atan2(along.y, along.x)
    line5 = track["line"] == "line5"
    for i, (offset, train_position) in enumerate(zip(track["offsets"], track["trainPositions"]), 1):
        across = side * (offset if axis == "z" else -offset)
        orig = across + Vector((0, 0, base))
        mid = orig + along * ((start + end) / 2)
        geom = Geometry()
        geom.box(mid - Vector((0, 0, .15)), (end - start, 2.05, .3), "bed", angle)
        for step in range(ceil(end - start)):
            geom.box(orig + along * (start + step), (.25, 1.82, .15), "sleeper", angle)
        for shift in (-.65, .65):
            geom.box(mid + side * shift + Vector((0, 0, .14)),
                     (end - start, .11, .14), "rail", angle)
        geom.create(f"{floor} · Track {i}", rail_group, "map-derived; dimensions estimated", floor=floor)
        train = Geometry()
        for car_index in (-1, 0, 1):
            car = orig + along * (train_position + car_index * 7.95)
            train.box(car + Vector((0, 0, 1.28)), (7.67, 1.91, 2.21), "train", angle)
            train.box(car + Vector((0, 0, 2.40)), (7.48, 1.74, .17), "slab", angle)
            for sign in (-1, 1):
                panel = car + side * .962 * sign
                train.box(panel + Vector((0, 0, .73)), (7.52, .032, .22),
                          "stripe5" if line5 else "stripe7", angle)
                for j in (-3, -2, -1, 0, 1, 2, 3):
                    train.box(panel + along * j * 1.02 + Vector((0, 0, 1.58)),
                              (.73, .049, .69), "window", angle)
            for nose_sign in (-1, 1):
                train.box(car + along * 3.85 * nose_sign + Vector((0, 0, 1.59)),
                          (.04, 1.41, .69), "window", angle)
        train.create(f"{floor} · Line {'5' if line5 else '7'} train {i}", rail_group,
                     "schematic train illustration", floor=floor)


for track in layout["railways"]:
    railway(track)

module_groups = {}
for facility in layout["facilities"]:
    level = level_of(facility["area"])
    pos = point(facility["point"], elevations[level])
    geo = Geometry()
    kind = facility["kind"]
    group = fittings[level]
    if modules and kind in ("gates", "toilet", "tickets"):
        key = (level, kind)
        if key not in module_groups:
            module_groups[key] = collection(f"Module · {kind.title()}", group)
        group = module_groups[key]
    if kind == "gates":
        rotation = radians(90) if facility.get("rotate") else 0
        lane = Vector((-sin(rotation), cos(rotation), 0))
        for i in range(-2, 3):
            gate = pos + lane * i * 2.03
            finish = "steel" if video_details and not facility.get("rotate") else "facility"
            geo.box(gate + Vector((0, 0, .58)), (1.55, .45, 1.16), finish, rotation)
            geo.box(gate + Vector((0, 0, 1.19)), (1.31, .37, .10), "frame", rotation)
            if finish == "steel":
                geo.box(gate + Vector((.79, 0, .89)), (.08, .27, .22),
                        "gateStop" if i in (-2, 2) else "gateGo")
            if modules:
                geo.box(gate + Vector((0, 0, .11)), (1.62, .50, .22), "frame", rotation)
                top = module_point(gate, (-.35, 0, 1.27), rotation)
                geo.box(top, (.38, .31, .11), "signBlue", rotation)
                geo.box(top + Vector((0, 0, .061)), (.17, .16, .015), "bezel", rotation)
                geo.box(module_point(gate, (0, .29, .68), rotation),
                        (.44, .16, .45), "gateGlass", rotation)
    elif modules and kind in ("toilet", "tickets"):
        angle = radians(facility.get("face", 0))

        def part(local, size, finish):
            geo.box(module_point(pos, local, angle), size, finish, angle)

        if kind == "toilet":
            part((0, .42, 1.30), (5.0, 3.1, 2.60), "tile")
            part((0, -.99, .11), (5.0, .18, .22), "frame")
            for x, caption in ((-1.19, "WC"), (1.19, "WC")):
                part((x, -1.13, 1.04), (1.76, .13, 2.10), "signBlue")
                part((x, -1.21, 1.08), (1.38, .045, 1.93), "steel")
                part((x + .52, -1.25, .99), (.11, .08, .35), "frame")
            part((0, -1.18, 2.27), (4.52, .24, .39), "signBlue")
            module_label("Toilet block · sign", "WC  RESTROOM", module_point(pos, (0, -1.31, 2.27), angle),
                         angle, .32, group, floor=level)
        else:
            part((0, .45, 1.25), (5.40, .40, 2.50), "blue")
            for x in (-1.68, 0, 1.68):
                part((x, -.30, 1.0), (1.35, 1.16, 2.0), "blue")
                part((x, -.89, 1.06), (1.16, .08, 1.82), "steel")
                part((x, -.96, 1.48), (.89, .13, .63), "window")
                part((x, -1.03, 1.51), (.68, .03, .40), "bezel")
                part((x, -.96, .86), (.43, .10, .14), "frame")
                part((x, -.96, .48), (.67, .10, .17), "frame")
            part((0, -.43, 2.30), (5.38, .31, .45), "signBlue")
            module_label(f"{facility['id']} · sign", "TICKETS  /  TOP-UP",
                         module_point(pos, (0, -.59, 2.31), angle), angle, .34, group, floor=level)
    elif kind == "benches":
        for i in (-1, 0, 1):
            geo.box(pos + Vector((i * 1.3, 0, .38)), (1.11, .64, .76), "bench")
    else:
        size = (6.5, 3.1, 2.6) if kind == "information" else (4.3, 5.1, 2.6)
        geo.box(pos + Vector((0, 0, 1.3)), size, "facility")
        geo.box(pos + Vector((0, -size[1] / 2, 1.66)), (size[0] * .76, .10, .53),
                "window" if kind == "information" else "frame")
    geo.create(facility["id"], group, "map landmarks; dimensions and placement estimated"
               if modules else "schematic placement", floor=level, module=kind)

if video_details:
    finishes = collection("B1 · Video reference finishes", floor_groups["B1"])
    appearance = "observed appearance; approximate placement"
    tiles = Geometry()
    for x in (-32, -27, -22):
        for row in range(5):
            for col in range(9):
                tiles.box((x + col * .53, 15.72, .28 + row * .51),
                          (.51, .12, .49), "tile")
    tiles.create("B1 · Tile facing near exit approach", finishes, appearance, floor="B1")
    markings = Geometry()
    for a, b in (((-38, -7.1), (-16, -7.1)), ((-12, -21), (-9, -9)),
                 ((-15, -7.1), (23, -7.1))):
        start, end = point(a, 0), point(b, 0)
        pieces = ceil((end - start).length / .85)
        for i in range(pieces):
            center = start.lerp(end, (i + .5) / pieces)
            for shift in (-.22, 0, .22):
                markings.box((center.x, center.y + shift, .022),
                             (.66, .14, .043), "yellow", aspect(end, start))
    markings.create("B1 · Tactile paving", finishes, appearance, floor="B1")
    if not modules:
        equipment = Geometry()
        for x in (30.4, 32.1, 33.8):
            equipment.box((x, 9.17, 1), (1.42, .91, 2), "blue")
            equipment.box((x, 8.69, 1.44), (1.16, .08, .55), "steel")
            equipment.box((x, 8.64, 1.49), (.60, .023, .25), "bezel")
        equipment.create("B1 · Ticket and recharge equipment", finishes, appearance, floor="B1")


def add_camera(name, direction, target, scale):
    data = bpy.data.cameras.new(name)
    camera = bpy.data.objects.new(name, data)
    studio.objects.link(camera)
    camera.location = target + direction.normalized() * 340
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    data.type, data.ortho_scale, data.clip_end = "ORTHO", scale, 850
    return camera


def aim_light(name, position, energy, size, target):
    data = bpy.data.lights.new(name, "AREA")
    light = bpy.data.objects.new(name, data)
    studio.objects.link(light)
    light.location = position
    light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    data.energy, data.shape, data.size = energy, "DISK", size


direction = Vector((.428, -.844, .324))
right = Vector((.892, .452, 0))
up = Vector((-.146, .289, .946))
target = right * 2.9 - up * 6
camera = add_camera("Map view", direction, target, 223)
inspection = add_camera("Higher wall inspection", Vector((.415, -.50, .76)),
                        Vector((0, 5, -16)), 256)
scene.camera = camera
aim_light("Key", (-70, -55, 145), 310000, 175, Vector((0, 0, -5)))
aim_light("Fill", (72, 100, 100), 175000, 155, Vector((0, 0, -15)))
world = bpy.data.worlds.new("Soft neutral studio")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs[0].default_value = (.77, .82, .87, 1)
world.node_tree.nodes.get("Background").inputs[1].default_value = .6
scene.world = world
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.render.engine = "BLENDER_WORKBENCH" if args.quick else "CYCLES"
if args.quick:
    shading = scene.display.shading
    shading.light, shading.color_type = "STUDIO", "MATERIAL"
    shading.show_shadows, shading.show_cavity = True, True
    shading.cavity_type = "BOTH"
else:
    scene.cycles.samples, scene.cycles.use_denoising = 16, True
    scene.cycles.max_bounces = 5

for screen in bpy.data.screens:
    for space in [area.spaces.active for area in screen.areas if area.type == "VIEW_3D"]:
        space.region_3d.view_location = target
        space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
        space.region_3d.view_distance = 228
        space.region_3d.view_perspective = "ORTHO"
        space.shading.color_type = "MATERIAL"
        space.overlay.show_floor = False
        space.overlay.show_axis_x = space.overlay.show_axis_y = False
        space.clip_end = 850

scene.render.resolution_percentage = 100
scene.render.resolution_x = 1800
scene.render.resolution_y = 1250
args.output.mkdir(parents=True, exist_ok=True)
args.preview_dir.mkdir(parents=True, exist_ok=True)
studio.hide_viewport = True
if not args.quick:
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / f"{args.basename}.blend"))
    for obj in scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=str(args.output / f"{args.basename}.glb"), export_format="GLB",
                              use_selection=True, export_extras=True, export_yup=True)
studio.hide_viewport = False

for view, preview_camera in (() if args.no_preview else (("map", camera), ("inspection", inspection))):
    scene.camera = preview_camera
    scene.render.filepath = str(args.preview_dir / f"{args.basename}-{view}.png")
    bpy.ops.render.render(write_still=True)

print(json.dumps({
    "meshObjects": sum(obj.type == "MESH" for obj in scene.objects),
    "sourceAreas": len(areas),
    "stairsAndEscalators": connector_count,
    "elevators": len(layout["elevators"]),
    "exitSigns": len(exit_points),
    "checks": "All stair and escalator landing points sit on their specified slabs."
}))
