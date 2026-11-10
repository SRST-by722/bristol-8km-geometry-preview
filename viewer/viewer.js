// Bristol 8 km viewer. Local frame: x = grid east, y = up, z = -grid north (glTF Y-up). Tiles stream by distance.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const LAYERS = [
  ['terrain', 'Terrain', '#d4d2c0'], ['buildings', 'Buildings', '#b9a690'], ['facade', 'Facade detail (near)', '#2f3b47'],
  ['roads', 'Roads', '#666'], ['rail', 'Railways', '#7a6b60'], ['bridges', 'Bridges', '#8d8a85'],
  ['water', 'Water', '#6a8ca8'], ['waterways', 'Streams & drains', '#6a8ca8'], ['veg_areas', 'Woodland, grass & parks', '#7da35a'],
  ['hedges', 'Hedges (mapped lines)', '#3d6638'], ['trees_mapped', 'Mapped tree / asset points', '#4c7a3d'],
  ['trees_rows', 'Tree rows (illustrative spacing)', '#4c7a3d'], ['canopy_illustrative', 'Illustrative woodland crowns', '#385e33']];
const GROUP_TO_LAYER = { terrain: 'terrain', buildings_b0: 'buildings', buildings_b1: 'buildings', buildings_b2: 'buildings', roads: 'roads', rail: 'rail',
  bridges: 'bridges', water: 'water', waterways: 'waterways', veg_areas: 'veg_areas', hedges: 'hedges', trees_mapped: 'trees_mapped', trees_rows: 'trees_rows', canopy_illustrative: 'canopy_illustrative' };
const R_BASE = 1400, R_B2 = 420;
const state = { layers: Object.fromEntries(LAYERS.map(l => [l[0], true])), tiles: {}, manifest: null, pick: [], info: {} };
const DIAG = new URLSearchParams(location.search).has('diag');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eeeb'); scene.fog = new THREE.Fog('#e9eeeb', 6000, 14000);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 30000);
scene.add(new THREE.HemisphereLight('#ffffff', '#8c9486', 1.25)); const sun = new THREE.DirectionalLight('#fff4e6', 1.4); sun.position.set(-3000, 5000, 2500); scene.add(sun);
const controls = new MapControls(camera, canvas); controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 20; controls.maxDistance = 16000; controls.enableDamping = true;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function shown(o) { for (let p = o; p; p = p.parent) { if (!p.visible) return false; } return true; }
function originOf(gltf) { const j = gltf.parser.json; let o = (j.scenes || [])[0]?.extras?.origin_local_zup_m;   // empty glTF files are valid: no nodes
  if (!o) for (const n of (j.nodes || [])) if (n.extras?.origin_local_zup_m) { o = n.extras.origin_local_zup_m; break; }
  o = o || [0, 0, 0]; return new THREE.Vector3(o[0], o[2], -o[1]); }
// Web tiles are meshopt-compressed with quantized (int) attributes; convert to Float32 before baking node transforms.
function toFloat(ge) { for (const k of Object.keys(ge.attributes)) { const a = ge.attributes[k]; if (a.array instanceof Float32Array && !a.normalized) continue;
  const n = a.count, s = a.itemSize, d = new Float32Array(n * s);
  for (let i = 0; i < n; i++) { d[i * s] = a.getX(i); if (s > 1) d[i * s + 1] = a.getY(i); if (s > 2) d[i * s + 2] = a.getZ(i); if (s > 3) d[i * s + 3] = a.getW(i); }
  ge.setAttribute(k, new THREE.BufferAttribute(d, s)); } return ge; }
function featureOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.id) return [p.userData.id, p.userData];
  for (let p = o; p; p = p.parent) if (p.name && !/^mesh_\d+$/.test(p.name) && !p.userData?.group) return [p.name, p.userData]; return [o.name, o.userData]; }

// Merge each group's meshes into one draw call; keep a face->feature lookup for picking.
function mergeScene(gltf, kind) {
  const root = new THREE.Group(); root.position.copy(originOf(gltf)); root.userData.kind = kind;
  gltf.scene.updateMatrixWorld(true);
  if (kind === 'b0') {  // overview: keep one mesh per tile so detail tiles can hide their overview stand-ins
    state.ov = {};
    for (const g of gltf.scene.children) g.traverse(o => { if (!o.isMesh) return; const m = new THREE.Mesh(toFloat(o.geometry.clone()), mat);
      m.applyMatrix4(o.matrixWorld); m.name = featureOf(o)[0]; m.userData.layer = GROUP_TO_LAYER[g.name] || g.name; m.userData.ranges = [[0, 1e12, m.name, { level: 'B0 overview', tile: m.name.slice(0, 6) }]];
      root.add(m); state.pick.push(m); state.ov[m.name] = m; });
    return root;
  }
  for (const g of gltf.scene.children) {
    const geoms = [], ranges = []; let tri = 0;
    g.traverse(o => { if (!o.isMesh) return; const ge = toFloat(o.geometry.clone()); ge.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(ge.attributes)) if (!['position', 'normal', 'color'].includes(k)) ge.deleteAttribute(k);
      if (!ge.attributes.color) { const c = new Float32Array(ge.attributes.position.count * 4).fill(0.7); ge.setAttribute('color', new THREE.BufferAttribute(c, 4)); }
      if (ge.attributes.color.itemSize === 3) { const s = ge.attributes.color.array, d = new Float32Array(s.length / 3 * 4); for (let i = 0, j = 0; i < s.length; i += 3, j += 4) { d[j] = s[i]; d[j + 1] = s[i + 1]; d[j + 2] = s[i + 2]; d[j + 3] = 1; } ge.setAttribute('color', new THREE.BufferAttribute(d, 4)); }
      const n = ge.index ? ge.index.count / 3 : ge.attributes.position.count / 3; const [fid, fex] = featureOf(o); ranges.push([tri, tri + n, fid, fex]); if (fex && fex.height_m !== undefined) state.info[fid] = fex; tri += n; geoms.push(ge); });
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms, false); const m = new THREE.Mesh(merged, mat); m.name = g.name; m.userData.ranges = ranges;
    m.userData.layer = (kind === 'b2' && g.name === 'buildings_b2') ? 'facade' : (GROUP_TO_LAYER[g.name] || g.name);
    root.add(m); state.pick.push(m);
  }
  return root;
}
function applyLayers() {
  for (const m of state.pick) { const L = m.userData.layer; m.visible = !m.userData.hiddenByTile && (L === 'facade' ? (state.layers.facade && state.layers.buildings) : !!state.layers[L]); }
  for (const t of Object.values(state.tiles)) { if (t.b1) t.b1.visible = !(t.b2 && state.layers.facade); }
}
async function load(url, kind) { const g = await loader.loadAsync(url); return mergeScene(g, kind); }
function dispose(root) { if (!root) return; scene.remove(root); root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); state.pick = state.pick.filter(p => p !== o); } }); }

async function init() {
  const mf = state.manifest = await (await fetch('manifest.json')).json();
  document.getElementById('sub').textContent = mf.subtitle;
  document.getElementById('stats').innerHTML = mf.stats.map(s => `<div><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  document.getElementById('note').textContent = mf.note;
  document.getElementById('foot').innerHTML = mf.attribution;
  document.getElementById('layers').innerHTML = LAYERS.map(([k, n, c]) => `<label><input type="checkbox" data-k="${k}" checked><span class="sw" style="background:${c}"></span>${n}</label>`).join('');
  document.querySelectorAll('#layers input').forEach(i => i.onchange = () => { state.layers[i.dataset.k] = i.checked; applyLayers(); });
  const views = { 'Overview': [0, 5200, 6800, 0, 0, 0], 'Top view': [0, 11000, 1, 0, 0, 0], 'City centre': [-150, 650, 900, 0, 0, 0] };
  document.getElementById('views').innerHTML = Object.keys(views).map(k => `<button data-v="${k}">${k}</button>`).join('');
  document.querySelectorAll('#views button').forEach(b => b.onclick = () => fly(...views[b.dataset.v]));
  document.getElementById('landmarks').innerHTML = (mf.landmarks || []).map((l, i) => `<button data-i="${i}"${l.tier === 'priority' ? ' class="pri"' : ''}>${l.name}</button>`).join('') || '<span class="note">None listed</span>';
  document.querySelectorAll('#landmarks button').forEach(b => b.onclick = () => { const l = mf.landmarks[+b.dataset.i]; const z = l.z || 20; fly(l.x + 160, z + 140, -l.y + 220, l.x, z, -l.y); document.getElementById('info').style.display = 'none'; });
  state.overview = await load(mf.overview, 'b0'); scene.add(state.overview); applyLayers(); mark('overview_ready_ms');
  fly(...views['Overview']); tick(); setInterval(stream, 600);
  // Optional inspection views (inspect_views.json next to this file; absent in normal copies): fixed cameras for reproducible checks.
  try { const r = await fetch('./inspect_views.json'); if (r.ok) { const iv = await r.json(); const host = document.getElementById('landmarks');
      const h = document.createElement('h2'); h.textContent = 'Inspection views'; const box = document.createElement('div'); box.id = 'inspect'; box.className = host.className;
      box.innerHTML = iv.views.map((v, i) => `<button data-i="${i}">${i + 1}. ${v.label}</button>`).join('');
      host.parentNode.insertBefore(h, host.nextSibling); h.parentNode.insertBefore(box, h.nextSibling);
      box.querySelectorAll('button').forEach(bn => bn.onclick = () => { const v = iv.views[+bn.dataset.i]; fly(...v.cam); const ib = document.getElementById('info');
        ib.innerHTML = `<b>${v.label}</b><div class="note">inspection view ${+bn.dataset.i + 1}</div><table>` + Object.entries(v).filter(([k, x]) => k !== 'label' && x !== null && x !== undefined).map(([k, x]) => `<tr><td>${k}</td><td>${typeof x === 'object' ? JSON.stringify(x) : x}</td></tr>`).join('') + '</table>'; ib.style.display = 'block'; }); } } catch (e) { /* no inspection file */ }
  const cp = new URLSearchParams(location.search).get('cam'); if (cp) { const c = cp.split(',').map(Number); if (c.length === 6 && c.every(Number.isFinite)) fly(...c); }
  window.uwmViewer = { fly, state, camera, controls, renderer };  // hook for automated screenshots / checks
}
function fly(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); }
let busy = false;
async function stream() {
  if (busy) return; busy = true;
  try {
    const t = controls.target, camH = camera.position.y - t.y, mf = state.manifest; let loading = 0;
    const want = mf.tiles.map(ti => { const cx = (ti.bbox[0] + ti.bbox[2]) / 2, cz = -(ti.bbox[1] + ti.bbox[3]) / 2; const d = Math.hypot(cx - t.x, cz - t.z);
      return { ti, d, lvl: d < R_B2 && camH < 900 ? 2 : (d < R_BASE && camH < 3500 ? 1 : 0) }; }).sort((a, b) => a.d - b.d);
    for (const { ti, lvl } of want) {
      const s = state.tiles[ti.id] ||= {};
      if ((s.failed || 0) >= 2) continue;   // recorded twice in diagnostics; not retried
      try {
        if (lvl >= 1 && !s.base && loading < 2) { loading++; s.cur = ti.files.base; s.base = await load(ti.files.base, 'base'); scene.add(s.base);
          if (ti.files.b1) { s.cur = ti.files.b1; s.b1 = await load(ti.files.b1, 'b1'); scene.add(s.b1); }   // null = tile has no buildings
          applyLayers(); mark(ti.id + '_base_b1_ready_ms'); }
        if (lvl === 2 && !s.b2 && s.base && ti.files.b2 && loading < 3) { loading++; s.cur = ti.files.b2; s.b2 = await load(ti.files.b2, 'b2'); scene.add(s.b2); applyLayers(); mark(ti.id + '_b2_ready_ms'); }
      } catch (e) {
        s.failed = (s.failed || 0) + 1; diagError('tile_load', e, { tile: ti.id, file: s.cur, attempt: s.failed }); console.error('tile load failed', ti.id, s.cur, e);
      }
      if (lvl < 2 && s.b2) { dispose(s.b2); s.b2 = null; applyLayers(); }
      if (lvl < 1 && s.base) { dispose(s.base); dispose(s.b1); s.base = s.b1 = null; }
      for (const k of ['_terrain_b0', '_buildings_b0']) { const m = state.ov?.[ti.id + k]; if (m) m.userData.hiddenByTile = !!s.base; }
    }
    applyLayers();
    const n = Object.values(state.tiles); document.getElementById('status').textContent =
      `Loaded tiles: ${n.filter(x => x.base).length} near, ${n.filter(x => x.b2).length} with facade detail · draw calls ${renderer.info.render.calls}`;
  } catch (e) { diagError('stream', e, {}); console.error(e); } finally { busy = false; }
}
// picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
canvas.addEventListener('dblclick', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(state.pick.filter(shown), false)[0]; const box = document.getElementById('info');
  if (!hit) { box.style.display = 'none'; return; }
  const r = hit.object.userData.ranges.find(r => hit.faceIndex >= r[0] && hit.faceIndex < r[1]);
  const ex = r ? Object.assign({}, state.info[r[2]] || {}, r[3]) : {};
  const rows = Object.entries(ex).filter(([k, v]) => v !== null && v !== undefined && k !== 'name').map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === 'object' ? JSON.stringify(v) : v}</td></tr>`).join('');
  box.innerHTML = `<b>${r ? r[2] : hit.object.name}</b><div class="note">${hit.object.userData.layer}</div><table>${rows}</table>`; box.style.display = 'block';
});
let frames = 0, fpsT = performance.now(), fps = 0;
function tick() { requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); frames++;
  const now = performance.now(); if (now - fpsT >= 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; if (DIAG) showDiag(); } }
// ---- read-only diagnostics (?diag=1): FPS, ready times, captured page errors. Not the full browser console.
function mark(k) { if (window.__diag && !(k in __diag.marks)) __diag.marks[k] = Math.round(performance.now() - __diag.t0); }
function showDiag() { const d = window.__diag || { marks: {}, errors: [] }, el = document.getElementById('diag'); if (!el) return; el.style.display = 'block';
  const i = renderer.info.render;
  el.textContent = `Diagnostics (read-only; page errors captured since load - not the full browser console)\n` +
    `FPS ${fps.toFixed(1)} · draw calls ${i.calls} · triangles ${(i.triangles / 1e6).toFixed(2)} M · pixel ratio ${renderer.getPixelRatio()}\n` +
    `Camera [eye x, up, z, target x, up, z]: ${[camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z].map(v => v.toFixed(1)).join(', ')}\n` +
    `Ready times since page start (ms):\n` + Object.entries(d.marks).map(([k, v]) => `  ${k}: ${v}`).join('\n') +
    `\nErrors captured: ${d.errors.length}\n` + d.errors.slice(-20).map(e => `  [${e.t_ms} ms] ${e.type}${e.tile ? ' tile ' + e.tile : ''}${e.file ? ' file ' + e.file : ''}: ${e.msg} ${e.src || ''}${e.stack ? '\n    ' + e.stack.split('\n').join('\n    ') : ''}`).join('\n');
  if (!document.getElementById('diagdl')) { const b = document.createElement('button'); b.id = 'diagdl'; b.textContent = 'Download diagnostics (JSON)';
    b.onclick = () => { const blob = new Blob([JSON.stringify({ captured: window.__diag, fps, renderer: renderer.info.render, ua: navigator.userAgent, url: location.href, note: 'page-captured errors only; not the full browser console' }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uwm_viewer_diagnostics.json'; a.click(); };
    el.parentNode.insertBefore(b, el.nextSibling); } }
function diagError(type, e, ctx) { if (window.__diag) __diag.errors.push(Object.assign({ t_ms: Math.round(performance.now()), type, msg: String(e && e.message || e), stack: String(e && e.stack || '') }, ctx)); }
init().catch(e => { document.getElementById('status').textContent = 'Error: ' + e.message; console.error(e); });
