// UAV deliveries for the Bristol viewer (task 21): replay of one result of the MFMU UAV scheduler
// (https://github.com/MMMaikouyebohan/mfmu-uwm-integration-preview) on a demonstration station layout.
// Data: web/uav/uav_replay.json (export_uav_replay.py): stations (hub / collection / drop-off) with coordinates, and per UAV the
// flight legs of its scheduled journeys [slot_from, slot_to, from, to]. Nothing is scheduled or routed in the browser.
// Display: a flight leg is a straight line between two stations, position linear in time over its slots; outside flight legs a UAV
// stands at its station, on its own spot near the pad (spots come with the replay file, so standing UAVs do not overlap). Flight height is a
// display choice: a fixed clearance above the highest ground under the line, with a climb and a descent at the ends. No obstacle
// or airspace check. UAV model: hexacopter_cargo.glb of the framework's South Kensington demo, true size, merged per material into
// instanced meshes (as agents/demo_rev02/actors/actor-layer.js); dots mark UAVs in flight at any distance.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = 'ext007-20261112';
export const UAV_TYPES = { hub: { color: '#1f4e8c', letter: 'H', name: 'Hub (UAV base, battery swap)' }, collection: { color: '#d9822b', letter: 'C', name: 'Collection station' }, dropoff: { color: '#2e8b57', letter: 'D', name: 'Drop-off station' } };
const MODELS_WITHIN = 1500;   // UAV models are drawn within this distance of the camera (m); dots mark flying UAVs everywhere
const POLE = 30;              // height of the station marker above the ground (m)

function badge(letter, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = `bold ${letter.length > 2 ? 23 : letter.length > 1 ? 28 : 34}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
async function uavBatches(capacity) {   // bake to bottom contact at the horizontal centre, merge by material
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/hexacopter_cargo.glb?v=' + V, import.meta.url).href);
  const src = gltf.scene; src.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(src), c = bb.getCenter(new THREE.Vector3()), groups = new Map();
  src.traverse(o => { if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.translate(-c.x, -bb.min.y, -c.z);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals(); if (g.index) g = g.toNonIndexed();
    const k = o.material.uuid; if (!groups.has(k)) groups.set(k, { material: o.material, geoms: [] }); groups.get(k).geoms.push(g); });
  const meshes = [];
  for (const e of groups.values()) {
    const geo = e.geoms.length === 1 ? e.geoms[0] : mergeGeometries(e.geoms, false);
    const m = new THREE.InstancedMesh(geo, e.material.clone(), capacity); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; meshes.push(m);
  }
  return { meshes, size: bb.getSize(new THREE.Vector3()) };
}

export function createUav({ scene, camera, base = '../web/uav/' }) {
  const S = { loaded: false, loading: null, on: false, t: 0, speed: 1, data: null, airborne: 0, delivered: 0, collected: 0, modelsDrawn: 0 };
  const group = new THREE.Group(); group.name = 'UAV deliveries (scheduler replay)'; group.visible = false; scene.add(group);
  let batches = null, dots = null, dotPos = null, done = null, picked = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function stationMarkers(st) {   // pad on the ground, pole, badge with the station's short name (H1, C3, D12) at constant screen size
    const g = new THREE.Group(); g.name = 'UAV stations (demonstration layout)';
    for (const s of st) {
      const T = UAV_TYPES[s.type], r = s.type === 'hub' ? 14 : 9, name = `${s.label} · ${T.name} · demonstration position`;
      const padG = new THREE.CylinderGeometry(r, r, 0.4, 32), poleG = new THREE.CylinderGeometry(0.5, 0.5, POLE, 6);
      // each part twice: solid where it is in view, and faint through trees and buildings so a station under a canopy can still be found
      for (const [op, depth, ro] of [[0.85, true, 0], [0.28, false, 7]]) {
        const mat = new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: op, depthTest: depth, depthWrite: depth });
        const pad = new THREE.Mesh(padG, mat); pad.position.set(s.x, s.z + 0.5, -s.y); const pole = new THREE.Mesh(poleG, mat); pole.position.set(s.x, s.z + POLE / 2, -s.y);
        pad.renderOrder = pole.renderOrder = ro; pad.name = pole.name = name; g.add(pad, pole);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badge(T.letter + parseInt(s.id.split('-')[1], 10), T.color), sizeAttenuation: false, depthTest: false })); sp.scale.set(0.038, 0.038, 1); sp.position.set(s.x, s.z + POLE, -s.y); sp.renderOrder = 9; sp.name = name; g.add(sp);
    }
    return g;
  }
  async function load() {
    if (S.loaded) return; if (S.loading) return S.loading;
    S.loading = (async () => {
      const r = await fetch(base + 'manifest.json?v=' + V); if (!r.ok) throw new Error('UAV manifest: HTTP ' + r.status); const man = await r.json();
      const rd = await fetch(base + man.file + '?v=' + V); if (!rd.ok) throw new Error(man.file + ': HTTP ' + rd.status);
      const d = await rd.json(); if (d.schema !== 'bristol-uav-replay.v1') throw new Error('unknown UAV replay format');
      const n = d.fleet.total; batches = await uavBatches(n); batches.meshes.forEach(m => group.add(m));
      group.add(stationMarkers(d.stations));
      dotPos = new Float32Array(n * 3); const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dotPos, 3)); dg.setDrawRange(0, 0);
      dots = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTexture(), size: 9, sizeAttenuation: false, transparent: true, alphaTest: 0.3, depthTest: false, color: '#ffe14a' })); dots.frustumCulled = false; dots.renderOrder = 8; group.add(dots);
      done = d.jobs.map(j => j[4]).sort((a, b) => a - b); picked = d.jobs.map(j => j[3]).sort((a, b) => a - b);
      S.data = d; S.loaded = true; update(true);
    })();
    try { await S.loading; } finally { S.loading = null; }
  }
  const countLE = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };
  const park = (u, si) => { const q = S.data.park[si][u]; return [q[0], q[1], q[2] + 0.05]; };   // where UAV u stands at station si: its own spot near the pad (display only; from the replay file)
  function update(force) {
    if (!S.loaded || (!S.on && !force)) return; const d = S.data, t = S.t, st = d.stations, H = d.display.clearance_above_highest_ground_m; let air = 0, drawn = 0;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let u = 0; u < d.fleet.total; u++) {
      const L = d.legs[u]; let si = d.fleet.start_station[u], x, y, z, yaw = 0, flying = false;
      for (let k = 0; k < L.length; k++) { const l = L[k]; if (t >= l[1]) { si = l[3]; continue; } if (t < l[0]) break;
        const a = st[l[2]], b = st[l[3]], s = (t - l[0]) / (l[1] - l[0]), w = smooth(0, 0.12, s) * smooth(1, 0.88, s), top = d.highest_ground_under_line_m[l[2]][l[3]] + H;
        x = a.x + (b.x - a.x) * s; y = a.y + (b.y - a.y) * s; z = (1 - w) * (a.z + (b.z - a.z) * s) + w * Math.max(top, a.z + 20, b.z + 20); yaw = Math.atan2(b.x - a.x, -(b.y - a.y)); flying = true; break; }
      if (!flying) [x, y, z] = park(u, si);
      if (flying) { dotPos[3 * air] = x; dotPos[3 * air + 1] = z; dotPos[3 * air + 2] = -y; air++; }
      if ((x - cx) ** 2 + (z - cy) ** 2 + (-y - cz) ** 2 < MODELS_WITHIN ** 2) { pos.set(x, z, -y); q.setFromAxisAngle(UP, yaw); m4.compose(pos, q, one); for (const m of batches.meshes) m.setMatrixAt(drawn, m4); drawn++; }
    }
    for (const m of batches.meshes) { m.count = drawn; m.instanceMatrix.needsUpdate = true; }
    dots.geometry.setDrawRange(0, air); dots.geometry.attributes.position.needsUpdate = true;
    S.airborne = air; S.modelsDrawn = drawn; S.delivered = countLE(done, t); S.collected = countLE(picked, t);
  }
  return {
    S, load, update,
    async setOn(on) { S.on = on; if (on) await load(); group.visible = S.on && S.loaded; if (S.on) update(true); },   // S.on, not the argument: the layer may have been switched off while it was loading
    visible: () => group.visible,
    setTime(t) { if (S.loaded) S.t = Math.max(0, Math.min(S.data.horizon_slots, t)); },
    setSpeed(v) { S.speed = v; },
    advance(dt) { if (!S.loaded) return; S.t += dt * S.speed; if (S.t >= S.data.horizon_slots) S.t = 0; },   // S.speed = slots per second of screen time
    info() { const d = S.data; return d ? { loaded: true, t: S.t, slots: d.horizon_slots, slot_seconds: d.slot_seconds, airborne: S.airborne, delivered: S.delivered, collected: S.collected, requests: d.counts.requests, fleet: d.fleet.total,
      used: d.fleet.used, max_airborne: d.counts.max_airborne_at_once, stations: d.stations.length, backend: d.scheduler.backend, guided: d.scheduler.mean_field_policy_consumed_count, modelsDrawn: S.modelsDrawn } : { loaded: false }; },
    stations: () => S.data?.stations ?? [], scheduler: () => S.data?.scheduler ?? null,
  };
}
