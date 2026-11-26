import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const overview = new THREE.Vector3(.428, .324, .844);
const target = new THREE.Vector3(3, -7, 0);
const up = new THREE.Vector3(0, 1, 0);
const accent = 0x007e69;
const displayFloor = floor => floor.startsWith("M") ? "B1" : floor;

function partFloors(obj) {
  for (let item = obj; item; item = item.parent) {
    const data = item.userData;
    if (data.floor) return [displayFloor(data.floor)];
    if (data.lower && data.upper) {
      return [data.lower, data.upper].map(area => area.startsWith("Landing_") ? "B1" : area.split("_")[0]);
    }
    if (data.stops) return data.stops.split(", ").map(stop => stop.split("_")[0]);
    if ((data.name ?? item.name).startsWith("Exit")) return ["G"];
  }
  return [];
}

function isInteriorOnly(obj) {
  for (let item = obj; item; item = item.parent) {
    if (item.userData.interior_only) return true;
  }
  return false;
}

function mesh(geometry, material, container) {
  const object = new THREE.Mesh(geometry, material);
  container.add(object);
  return object;
}

export function samplePath(route, cumulative, treads, travel) {
  if (route.length === 1) {
    return { index: 0, portion: 0, center: route[0].clone(), pos: route[0].clone() };
  }
  const following = cumulative.findIndex(value => value > travel + .001);
  const index = following === -1 ? route.length - 1 : following;
  const span = cumulative[index] - cumulative[index - 1];
  const portion = span > 0 ? THREE.MathUtils.clamp((travel - cumulative[index - 1]) / span, 0, 1) : 0;
  const center = route[index - 1].clone().lerp(route[index], portion);
  const pos = center.clone();
  const profile = treads[index - 1];
  if (profile?.length) {
    const sample = portion * (profile.length - 1);
    pos.y = Math.max(profile[Math.floor(sample)], profile[Math.ceil(sample)]);
  }
  return { index, portion, center, pos };
}

export function createStationView(container, report) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-120, 120, 80, -80, .1, 1000);
  const eyes = new THREE.PerspectiveCamera(68, 1, .07, 550);
  const lookMatrix = new THREE.Matrix4();
  const heading = new THREE.Quaternion();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute("aria-label", "회전 가능한 군자역 3D 모델");
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = .6;
  controls.maxZoom = 8;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  const key = new THREE.DirectionalLight(0xfff5e6, 2.4);
  key.position.set(-90, 200, 85);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9dafaa, 2.15));

  const routeLayer = new THREE.Group();
  scene.add(routeLayer);
  const targetRing = mesh(new THREE.RingGeometry(.48, .79, 28),
    new THREE.MeshBasicMaterial({ color: 0xf1ae26, side: THREE.DoubleSide }), scene);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.visible = false;
  const person = new THREE.Group();
  scene.add(person);
  const personMaterial = new THREE.MeshStandardMaterial({ color: accent });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffe5be });
  const body = mesh(new THREE.CapsuleGeometry(.28, .74, 4, 9), personMaterial, person);
  body.position.y = .65;
  const head = mesh(new THREE.SphereGeometry(.22, 10, 7), headMaterial, person);
  head.position.y = 1.45;
  const nose = mesh(new THREE.ConeGeometry(.14, .21, 3), personMaterial, person);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, .9, .16);
  person.traverse(item => { item.renderOrder = 12; });
  person.visible = false;

  let model, floor = "all", route = [], cumulative = [];
  let treads = [];
  let distance = 0, playing = false, speed = 1, view = "character";
  let segmentStart = 0, segmentEnd = 0, firstPoint = 0, lastPoint = 0;
  let yaw = 0, pitch = 0, drag = null;
  let disposed = false;
  let frame, last = 0, lastReport = 0;
  const routeMaterial = new THREE.MeshBasicMaterial({ color: accent, depthTest: false });
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xf7fffb, depthTest: false });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const aspect = width / height;
    const half = Math.max(117, 72 * aspect);
    camera.left = -half;
    camera.right = half;
    camera.top = half / aspect;
    camera.bottom = -half / aspect;
    camera.updateProjectionMatrix();
    eyes.aspect = aspect;
    eyes.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function resetOverview() {
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(overview, 360);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  resetOverview();
  eyes.position.copy(camera.position);
  eyes.quaternion.copy(camera.quaternion);
  controls.enabled = false;

  function applyFloor() {
    const visibleFloor = view === "character" ? "all" : floor;
    model?.traverse(obj => {
      if (obj.isMesh) {
        const floors = partFloors(obj);
        obj.visible = (visibleFloor === "all" || floors.includes(visibleFloor))
          && (view === "character" || !isInteriorOnly(obj));
      }
    });
    routeLayer.children.forEach(obj => {
      obj.visible = (visibleFloor === "all" || obj.userData.floors.includes(visibleFloor))
        && obj.userData.pointIndex > firstPoint && obj.userData.pointIndex <= lastPoint
        && (view === "overview" || obj.renderOrder === 5 || obj.renderOrder === 6);
      if (obj.renderOrder === 5 || obj.renderOrder === 6) {
        const scale = view === "character" ? .34 : 1;
        obj.scale.set(scale, obj.renderOrder === 6 ? scale : 1, scale);
      }
    });
    routeMaterial.depthTest = view === "character";
    routeMaterial.depthWrite = view === "character";
    targetRing.visible = lastPoint > firstPoint
      && (visibleFloor === "all" || heightToFloor(route[lastPoint].y) === visibleFloor);
    if (targetRing.visible) targetRing.position.copy(route[lastPoint]).addScaledVector(up, .50);
  }

  const heightToFloor = height => height >= 20.8 ? "G" : height >= -.1 ? "B1"
    : height >= -21.03 ? "B2" : "B3";

  function tag(obj, heights, order, pointIndex) {
    const highest = Math.max(...heights);
    const lowest = Math.min(...heights);
    obj.userData.floors = Object.entries({ G: 20.93, B1: 0, B2: -20.93, B3: -41.86 })
      .filter(([, y]) => y >= lowest - .05 && y <= highest + .05).map(([key]) => key);
    if (highest > .05 && lowest < 20.88 && !obj.userData.floors.includes("B1")) {
      obj.userData.floors.push("B1");
    }
    obj.renderOrder = order;
    obj.userData.pointIndex = pointIndex;
  }

  function tube(start, end, radius, material, heights, order, index) {
    const delta = end.clone().sub(start);
    if (delta.lengthSq() <= 1e-8) return;
    const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
      material, routeLayer);
    object.position.copy(start).lerp(end, .5);
    object.quaternion.setFromUnitVectors(up, delta.normalize());
    tag(object, heights, order, index);
  }

  function setRoute(points, profiles) {
    for (const item of [...routeLayer.children]) {
      item.geometry.dispose();
      item.removeFromParent();
    }
    route = points.map(point => new THREE.Vector3(...point));
    treads = profiles;
    let lengthSoFar = 0;
    cumulative = [0];
    const raised = point => point.clone().addScaledVector(up, .62);
    route.forEach((point, i) => {
      if (i === 0 || i === route.length - 1) {
        const pin = mesh(new THREE.SphereGeometry(1.32, 14, 10),
          i === 0 ? routeMaterial : outlineMaterial, routeLayer);
        pin.position.copy(raised(point)).addScaledVector(up, .53);
        tag(pin, [point.y], 7, i);
      }
      if (!i) return;
      const start = route[i - 1];
      const length = start.distanceTo(point);
      lengthSoFar += length;
      cumulative.push(lengthSoFar);
      tube(raised(start), raised(point), .67, outlineMaterial, [start.y, point.y], 4, i);
      tube(raised(start), raised(point), .38, routeMaterial, [start.y, point.y], 5, i);
      for (let travel = 6; travel < length - 2; travel += 10) {
        const marker = mesh(new THREE.ConeGeometry(.83, 1.9, 4), routeMaterial, routeLayer);
        marker.position.copy(raised(start)).lerp(raised(point), travel / length);
        marker.quaternion.setFromUnitVectors(up, point.clone().sub(start).normalize());
        tag(marker, [start.y, point.y], 6, i);
      }
    });
    playing = false;
    distance = segmentStart = segmentEnd = 0;
    firstPoint = lastPoint = 0;
    yaw = pitch = 0;
    updatePerson(true);
    applyFloor();
  }

  function updatePerson(force = false, time = performance.now()) {
    if (!route.length) {
      person.visible = false;
      report.onProgress({ ratio: 0, index: 0, playing: false });
      return;
    }
    const { index, portion, center, pos } = samplePath(route, cumulative, treads, distance);
    const ahead = samplePath(route, cumulative, treads, Math.min(segmentEnd, distance + 3)).center;
    const delta = ahead.sub(center);
    if (delta.lengthSq() < .001 && lastPoint > 0) {
      delta.copy(route[lastPoint]).sub(route[lastPoint - 1]);
    }
    person.position.copy(pos);
    person.rotation.y = Math.atan2(delta.x, delta.z);
    person.visible = view === "overview" && (floor === "all" || floor === heightToFloor(pos.y));
    if (view === "character") {
      const azimuth = Math.atan2(delta.x, delta.z) + yaw;
      const elevation = THREE.MathUtils.clamp(
        Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) * .65 - .12 + pitch, -1.1, 1.1,
      );
      const forward = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation),
      );
      eyes.position.copy(center).addScaledVector(up, 1.58);
      lookMatrix.lookAt(eyes.position, eyes.position.clone().add(forward), up);
      heading.setFromRotationMatrix(lookMatrix);
      eyes.quaternion.slerp(heading, force ? 1 : 1 - Math.exp(-12 * Math.max(0, time - last) / 1000));
    }
    if (force || time - lastReport > 100) {
      lastReport = time;
      const length = segmentEnd - segmentStart;
      report.onProgress({ ratio: length ? (distance - segmentStart) / length : 0,
        index: portion > .999 ? index : Math.max(0, index - 1), playing });
    }
  }

  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (playing) {
      distance = Math.min(segmentEnd, distance + Math.min(.06, (now - (last || now)) / 1000) * 12 * speed);
      if (distance >= segmentEnd) {
        playing = false;
        updatePerson(true, now);
      } else {
        updatePerson(false, now);
      }
    }
    last = now;
    if (view === "overview") controls.update();
    renderer.render(scene, view === "character" && route.length ? eyes : camera);
  }
  frame = requestAnimationFrame(animate);

  const canvas = renderer.domElement;
  function startLook(event) {
    if (view !== "character" || event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }
  function moveLook(event) {
    if (drag?.id !== event.pointerId) return;
    yaw += (drag.x - event.clientX) * .006;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .005, -1, 1);
    Object.assign(drag, { x: event.clientX, y: event.clientY });
    updatePerson(true);
  }
  function endLook(event) {
    if (drag?.id === event.pointerId) drag = null;
  }
  canvas.addEventListener("pointerdown", startLook);
  canvas.addEventListener("pointermove", moveLook);
  canvas.addEventListener("lostpointercapture", endLook);

  new GLTFLoader().load(report.modelUrl, ({ scene: loaded }) => {
    if (disposed) {
      disposeModel(loaded);
      return;
    }
    model = loaded;
    scene.add(model);
    applyFloor();
    report.onLoad();
  }, event => {
    if (!disposed && event.total) report.onLoading(Math.round(event.loaded / event.total * 100));
  }, () => { if (!disposed) report.onError(); });

  return {
    setRoute,
    setFloor(value) { floor = value; applyFloor(); updatePerson(true); },
    setSegment(from, to) {
      firstPoint = from;
      lastPoint = to;
      segmentStart = cumulative[from];
      segmentEnd = cumulative[to];
      distance = segmentStart;
      playing = false;
      yaw = pitch = 0;
      applyFloor();
      updatePerson(true);
    },
    setPlaying(value) {
      if (segmentStart === segmentEnd) return;
      if (value && distance >= segmentEnd) distance = segmentStart;
      playing = value;
      updatePerson(true);
    },
    seek(ratio) {
      distance = THREE.MathUtils.lerp(segmentStart, segmentEnd, THREE.MathUtils.clamp(ratio, 0, 1));
      updatePerson(true);
    },
    setSpeed(value) { speed = value; },
    setView(value) {
      view = value;
      controls.enabled = view === "overview";
      yaw = pitch = 0;
      applyFloor();
      updatePerson(true);
    },
    zoom(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
    },
    resetView() {
      if (view === "overview") resetOverview();
      else {
        yaw = pitch = 0;
        updatePerson(true);
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      controls.dispose();
      observer.disconnect();
      disposeModel(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function disposeModel(root) {
  const materials = new Set();
  root.traverse(object => {
    object.geometry?.dispose();
    if (object.material) {
      for (const material of [object.material].flat()) materials.add(material);
    }
  });
  materials.forEach(material => material.dispose());
}
