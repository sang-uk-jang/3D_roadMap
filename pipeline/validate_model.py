"""Re-import the exported model and check its objects and stair centerlines."""

import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


model, annotation, *detail_files = map(Path, sys.argv[sys.argv.index("--") + 1:])
layout = json.loads(annotation.read_text(encoding="utf-8"))
if detail_files:
    details = json.loads(detail_files[0].read_text(encoding="utf-8"))
    connector = next(item for item in layout["connectors"] if item["id"] == details["connector"])
    connector["bend"] = details["bend"]
modules = json.loads(detail_files[1].read_text(encoding="utf-8")) if len(detail_files) > 1 else None
if modules:
    for connector in layout["connectors"]:
        if connector["id"] in modules["connectorClearance"]:
            connector["lower"][1:] = modules["connectorClearance"][connector["id"]]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model.resolve()))
meshes = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == "MESH"}
required = {area["id"] for area in layout["areas"]}
required.update(item["id"] for item in layout["connectors"] + layout["elevators"])
required.update(f"Exit {n} numeral" for n in range(1, 9))
required.update(f"{level} · Enclosure walls" for level in ("B1", "B2", "B3"))
assert required <= meshes.keys(), f"Missing model objects: {required - meshes.keys()}"
assert all(obj.data.polygons for obj in meshes.values())
if modules:
    counts = {kind: sum(obj.get("module") == kind for obj in meshes.values())
              for kind in ("elevator", "tickets", "toilet", "gates")}
    assert counts == {"elevator": 4, "tickets": 2, "toilet": 1, "gates": 3}, counts
    assert meshes["Toilet block"].get("floor") == "B1"
    assert meshes["Central ticket and recharge"].get("floor") == "B1"
    print(f"PASS: Editable facility modules found: {counts}.")
estimated_boundaries = [obj for name, obj in meshes.items() if any(
    role in name for role in ("Enclosure walls", "Opening guardrails", "Platform track barriers")
)]
assert all(obj.get("status") == "estimated" for obj in estimated_boundaries)
areas = {area["id"]: area["floor"] for area in layout["areas"]}
elevations = layout["floors"]


def anchor(endpoint):
    area, x, z = endpoint
    return Vector((x, -z, elevations[areas.get(area, area)]))


collisions = []
for connector in layout["connectors"]:
    bottom, top = (anchor(connector[key]) for key in ("lower", "upper"))
    path = [bottom, top]
    if "bend" in connector:
        x, z, fraction = connector["bend"]
        path.insert(1, Vector((x, -z, bottom.z + fraction * (top.z - bottom.z))))
    for start, end in zip(path, path[1:]):
        lift = Vector((0, 0, 1.1))
        direction = end - start
        for obj in estimated_boundaries:
            inverse = obj.matrix_world.inverted()
            hit, *_ = obj.ray_cast(inverse @ (start + lift),
                                  inverse.to_3x3() @ direction.normalized(),
                                  distance=direction.length)
            if hit:
                collisions.append((connector["id"], obj.name))
assert not collisions, f"Stair centerlines intersect modeled boundaries: {collisions}"

print(f"PASS: GLB imported with {len(meshes)} editable mesh objects.")
print(f"PASS: {len(required)} required areas, connectors, signs and wall objects are present.")
print("PASS: Boundary objects carry estimated status.")
print(f"PASS: Checked {len(layout['connectors'])} stair/escalator centerlines against walls and barriers.")
