// Illustrative traffic for the Bristol viewer (task 17): replay of a SUMO run with random demand on the OSM road network
// (task 17 code/traffic/; method after the framework's white_city run_sumo.py / build_traffic.py @587f3d9).
// Display follows the framework's South Kensington traffic replay (src/visualization/legacy/viewer/3d/traffic.js and
// agents/demo_rev02/actors/actor-layer.js @587f3d9): the same procedural 4.5 m sedan (sedan_4p5m.glb, body paint tinted per
// vehicle from the same palette, true size, merged per material into instanced meshes), linear position / shortest-angle
// heading interpolation between the one-second records, SUMO heading -> world yaw = PI - heading, and an overhead "traffic map"
// of screen-space dots (white = moving, amber = stopped) for distant views. Bristol adaptation: heights from the task-14 road and
// bridge-deck surfaces (stored per record), int16 records in the local frame, dots instead of models when the camera is far.
// Data: web/traffic/traffic.bin, int16 [vehicle, x*4, y*4, z*10, heading*10000, speed*100] per second, sorted by vehicle.
// Not observed traffic and not the TSM model.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAR_COLORS = ['#dae0e5', '#33516e', '#878b8c', '#48474a', '#842f2c', '#bcc4cd', '#d2c6a5', '#377175'];   // framework DEFAULT_CAR_COLORS
const DOTS_FROM = 1600, MODELS_UNTIL = 2600;   // camera distance to the view target (m): dots beyond, models below (both in between)
const V = 'ext007-20261112';

function dotTexture() {   // as the framework's traffic map dots
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

async function sedanBatches(capacity) {   // actor-layer.js instantiateModel(): bake to bottom contact at the horizontal centre, merge by material
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/sedan_4p5m.glb?v=' + V, import.meta.url).href);
  const src = gltf.scene; src.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(src), c = bb.getCenter(new THREE.Vector3());
  const groups = new Map();
  src.traverse(o => { if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.translate(-c.x, -bb.min.y, -c.z);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals(); if (g.index) g = g.toNonIndexed();
    const k = o.material.uuid; if (!groups.has(k)) groups.set(k, { material: o.material, geoms: [] }); groups.get(k).geoms.push(g); });
  const meshes = []; let paint = null;
  for (const e of groups.values()) {
    const geo = e.geoms.length === 1 ? e.geoms[0] : mergeGeometries(e.geoms, false);
    const m = new THREE.InstancedMesh(geo, e.material.clone(), capacity); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
    if (e.material.name === 'Body paint') { m.setColorAt(0, new THREE.Color('#ffffff')); m.instanceColor.setUsage(THREE.DynamicDrawUsage); paint = m; }
    meshes.push(m);
  }
  return { meshes, paint, size: bb.getSize(new THREE.Vector3()) };
}

export function createCars({ scene, camera, controls, base = '../web/traffic/' }) {
  const S = { loaded: false, loading: null, on: false, t: 0, n: 0, counts: [], offs: [], rec: null, man: null, mode: 'models', moving: 0, speed: 1 };
  const group = new THREE.Group(); group.name = 'traffic (illustrative SUMO run)'; group.visible = false; scene.add(group);
  let batches = null, dots = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const cols = CAR_COLORS.map(c => new THREE.Color(c)), WHITE = new THREE.Color('#ffffff'), AMBER = new THREE.Color('#ffb400');

  async function load() {
    if (S.loaded) return; if (S.loading) return S.loading;
    S.loading = (async () => {
      const r = await fetch(base + 'manifest.json?v=' + V); if (!r.ok) throw new Error('traffic manifest: HTTP ' + r.status); const man = await r.json();
      const [rb, bt] = await Promise.all([fetch(base + man.file + '?v=' + V), sedanBatches(Math.max(...man.counts))]);
      if (!rb.ok) throw new Error(man.file + ': HTTP ' + rb.status);
      S.rec = new Int16Array(await rb.arrayBuffer()); S.man = man; S.counts = man.counts; S.n = man.counts.length;
      let o = 0; S.offs = S.counts.map(c => { const v = o; o += c; return v; });
      if (o * 6 !== S.rec.length) throw new Error('traffic file size does not match its manifest');
      batches = bt; batches.meshes.forEach(m => group.add(m));
      const cap = Math.max(...S.counts), dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: dotTexture(), alphaTest: 0.3, vertexColors: true, depthTest: false, transparent: true }));
      dots.frustumCulled = false; dots.renderOrder = 21; group.add(dots);
      S.loaded = true;
    })();
    try { await S.loading; } finally { S.loading = null; }
  }

  function update() {
    if (!S.loaded || !S.on) return;
    const n = S.n, k = Math.floor(S.t) % n, f = S.t - Math.floor(S.t), k2 = k + 1 < n ? k + 1 : -1;
    const R = S.rec, a0 = S.offs[k] * 6, an = S.counts[k];
    let b = k2 >= 0 ? S.offs[k2] * 6 : 0; const bEnd = k2 >= 0 ? b + S.counts[k2] * 6 : 0;
    const d = camera.position.distanceTo(controls.target), showM = d < MODELS_UNTIL, showD = d > DOTS_FROM;
    S.mode = showM && showD ? 'models+dots' : showM ? 'models' : 'dots';
    const dp = dots.geometry.attributes.position, dc = dots.geometry.attributes.color; let moving = 0;
    for (let i = 0; i < an; i++) {
      const o = a0 + i * 6, id = R[o];
      let x = R[o + 1] / 4, y = R[o + 2] / 4, z = R[o + 3] / 10, h = R[o + 4] / 10000, sp = R[o + 5] / 100;
      while (b < bEnd && R[b] < id) b += 6;
      if (b < bEnd && R[b] === id) {
        const x2 = R[b + 1] / 4, y2 = R[b + 2] / 4;
        if (Math.abs(x2 - x) + Math.abs(y2 - y) < 80) {   // no interpolation across a SUMO teleport
          x += (x2 - x) * f; y += (y2 - y) * f; z += (R[b + 3] / 10 - z) * f; sp += (R[b + 5] / 100 - sp) * f;
          let dh = R[b + 4] / 10000 - h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); h += dh * f; }
      }
      if (sp > 0.1) moving++;
      if (showM) { pos.set(x, z + 0.015, -y); q.setFromAxisAngle(UP, Math.PI - h); m4.compose(pos, q, one);
        for (const m of batches.meshes) m.setMatrixAt(i, m4);
        batches.paint.setColorAt(i, cols[id % cols.length]); }
      if (showD) { dp.setXYZ(i, x, z + 2, -y); const c = sp > 0.1 ? WHITE : AMBER; dc.setXYZ(i, c.r, c.g, c.b); }
    }
    for (const m of batches.meshes) { m.count = showM ? an : 0; m.instanceMatrix.needsUpdate = true; }
    if (showM && batches.paint.instanceColor) batches.paint.instanceColor.needsUpdate = true;
    dots.visible = showD; if (showD) { dots.geometry.setDrawRange(0, an); dp.needsUpdate = true; dc.needsUpdate = true; }
    S.moving = moving;
  }

  return {
    S, load, update,
    async setOn(on) { S.on = on; if (on) await load(); group.visible = S.on; if (S.on) update(); },   // S.on, not on: it may have been switched off while loading
    setTime(t) { if (!S.n) return; S.t = ((t % S.n) + S.n) % S.n; },
    setSpeed(v) { S.speed = v; },
    advance(dt) { if (S.n) S.t = (S.t + dt * S.speed) % S.n; },
    info: () => ({ t: S.t, seconds: S.n, count: S.loaded ? S.counts[Math.floor(S.t) % S.n] : 0, moving: S.moving, mode: S.mode, speed: S.speed, loaded: S.loaded }),
    manifest: () => S.man,
  };
}
