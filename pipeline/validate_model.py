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
if len(detail_files) > 2:
    entrances = json.loads(detail_files[2].read_text(encoding="utf-8"))
    layout["areas"].extend(entrances["areas"])
    layout["floors"].update(entrances["floors"])
    for connector in layout["connectors"]:
        if connector["id"] in entrances["lowerAnchors"]:
            connector["lower"] = entrances["lowerAnchors"][connector["id"]]
            connector.pop("bend", None)
        connector.update(entrances.get("exitOverrides", {}).get(connector["id"], {}))
    layout["connectors"].extend(entrances["connectors"])
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
    assert counts == {"elevator": 4, "tickets": 1, "toilet": 1, "gates": 3}, counts
    assert meshes["Toilet block"].get("floor") == "B1"
    assert meshes["Central ticket and recharge"].get("floor") == "B1"
    columns = [item for item in modules["facilities"] if item["kind"] == "column"]
    for column in columns:
        obj = meshes[column["id"]]
        assert obj.get("module") == "column" and obj.get("video_reference") == column["reference"]
        expected = "Video reference · glazed white column panels" if column.get("style") == "glossy" else "Station wall ceramic"
        assert expected in {slot.material.name for slot in obj.material_slots}
    print(f"PASS: {len(columns)} video-referenced column objects.")
    if any(item["kind"] == "convenience-store" for item in modules["facilities"]):
        [shop] = [item for item in modules["facilities"] if item["kind"] == "convenience-store"]
        store = meshes[shop["id"]]
        assert store.get("module") == "convenience-store" and store["video_reference"] == shop["reference"]
        for label in ("GS", "25"):
            assert f"{shop['id']} · {label} sign" in meshes
        print("PASS: GS25 glass storefront and both sign elements are present.")
    print(f"PASS: Editable facility modules found: {counts}.")
    for level in ("B1", "B2", "B3"):
        enclosure = meshes[f"{level} · Enclosure walls"]
        assert enclosure.get("height_diagram_units", 0) >= 4
        assert {"Station wall ceramic", "Grey granite wall base"} <= {
            slot.material.name for slot in enclosure.material_slots
        }
    stair_walls = [obj for obj in meshes.values() if obj.get("wall") == "stair"]
    assert len(stair_walls) >= len(layout["connectors"])
    print(f"PASS: Full-height tiled walls on three floors and {len(stair_walls)} stair wall runs.")
if len(detail_files) > 2 and "Exit 7 · Lower flight" in meshes:
    assert meshes["Exit 7"].get("bicycle_guide")
    assert meshes["Exit 7 · Lower flight"].get("bicycle_guide")
    assert meshes["Exit 8"].get("connector_type") == "escalator-pair"
    print("PASS: Exit 7 bicycle guides and split staircase, Exit 8 paired escalators.")
if "B1 · Suspended ceiling and strip lights" in meshes:
    assert meshes["B1 · Suspended ceiling and strip lights"].get("interior_only")
    for name in ("Gunja video · concourse granite", "Stair concrete", "Station wall ceramic"):
        material = bpy.data.materials[name]
        assert any(node.type == "TEX_IMAGE" and node.image for node in material.node_tree.nodes), name
    print("PASS: Video surface textures and concourse ceiling included in GLB.")
if len(detail_files) > 3:
    station_details = json.loads(detail_files[3].read_text(encoding="utf-8"))
    for item in station_details["facilities"]:
        obj = meshes[item["id"]]
        assert obj.get("module") == item["kind"] and obj.get("video_reference") == item["reference"]
    for item in station_details["transferMarkings"]:
        assert meshes[item["id"]].get("module") == "transfer-marking"
    materials = {slot.material.name for slot in meshes["Exit 4"].material_slots}
    assert "Video reference · tinted balustrade" in materials
    print(f"PASS: {len(station_details['facilities'])} marked fixtures, two transfer floor guides and Exit 4 glass rails.")
    if "B1 · Exit 7 and 8 wall directory · printed station map" in meshes:
        obj = meshes["B1 · Exit 7 and 8 wall directory · printed station map"]
        assert obj.data.uv_layers
        material = obj.material_slots[0].material
        assert any(node.type == "TEX_IMAGE" and node.image for node in material.node_tree.nodes)
        print("PASS: The wall directory contains the user's station diagram texture.")
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
    stair = meshes[connector["id"]]
    assert "Continuous stair underside and stringer" in {
        slot.material.name for slot in stair.material_slots
    }, connector["id"]
    path = [bottom, top]
    if "bend" in connector:
        x, z, fraction = connector["bend"]
        path.insert(1, Vector((x, -z, bottom.z + fraction * (top.z - bottom.z))))
    for start, end in zip(path, path[1:]):
        lift = Vector((0, 0, 1.1))
        direction = end - start
        inverse = stair.matrix_world.inverted()
        up = Vector((0, 0, 1))
        for fraction in (.2, .5, .8):
            center = start.lerp(end, fraction)
            hit, location, *_ = stair.ray_cast(inverse @ (center - up * .80),
                                               inverse.to_3x3() @ up, distance=.55)
            assert hit and abs((stair.matrix_world @ location).z - center.z + .35) < .02, connector["id"]
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
print("PASS: Continuous stair undersides cover every modeled flight.")
print(f"PASS: Checked {len(layout['connectors'])} stair/escalator centerlines against walls and barriers.")
