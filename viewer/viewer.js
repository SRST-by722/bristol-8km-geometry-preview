// Bristol 8 km viewer - web preview build. Local frame: x = grid east, y = up, z = -grid north (glTF Y-up).
// Loading: terrain overview first, then whole-area building blocks in parts; near detail streams by distance from the view target
// through one priority queue (bounded concurrency, retries, stale requests cancelled). Progress shown is real bytes from the manifest.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

window.__viewerStarted = true;
const LAYERS = [
  ['terrain', 'Terrain', '#d4d2c0'], ['buildings', 'Buildings', '#b9a690'], ['facade', 'Facade detail (near)', '#2f3b47'],
  ['roads', 'Roads', '#666'], ['rail', 'Railways', '#7a6b60'], ['bridges', 'Bridges', '#8d8a85'],
  ['water', 'Water', '#6a8ca8'], ['waterways', 'Streams & drains', '#6a8ca8'], ['veg_areas', 'Woodland, grass & parks', '#7da35a'],
  ['hedges', 'Hedges (mapped lines)', '#3d6638'], ['trees_mapped', 'Mapped tree / asset points', '#4c7a3d'],
  ['trees_rows', 'Tree rows (illustrative spacing)', '#4c7a3d'], ['canopy_illustrative', 'Illustrative woodland crowns', '#385e33']];
const GROUP_TO_LAYER = { terrain: 'terrain', buildings_b0: 'buildings', buildings_b1: 'buildings', buildings_b2: 'buildings', roads: 'roads', rail: 'rail',
  bridges: 'bridges', water: 'water', waterways: 'waterways', veg_areas: 'veg_areas', hedges: 'hedges', trees_mapped: 'trees_mapped', trees_rows: 'trees_rows', canopy_illustrative: 'canopy_illustrative' };
const R_BASE = 1400, R_B2 = 420;          // same detail radii as the first published version
const CONC = 4, RETRIES = 2;              // parallel downloads; automatic retries per file before it is reported as failed
const QS = new URLSearchParams(location.search);
const DIAG = QS.has('diag');
const state = { layers: Object.fromEntries(LAYERS.map(l => [l[0], true])), tiles: {}, manifest: null, pick: [], ov: {}, feat: {}, jobs: new Map(), log: [],
  net: { requests: 0, bytes: 0, retries: 0, failed: 0, cancelled: 0 } };
const $ = id => document.getElementById(id);
const mb = v => (v / 1e6).toFixed(v < 1e7 ? 1 : 0);

// ---- panel controls. Each card (layers/landmarks, feature record, loading activity, diagnostics) can be minimised to a small chip
// in the dock at the top left, and "Hide panels" puts all of them away at once. Only the user's clicks change these flags:
// picking a feature, jumping to a landmark or a progress update never reopens a card the user has put away.
const ui = { hideAll: QS.get('panels') === 'hidden', min: { panel: false, info: false, act: false, diag: false }, saved: null,
  infoOpen: false, infoTitle: '', act: { on: false, text: '', short: '', frac: 0, err: false, retry: false } };
function renderUI() {
  const h = ui.hideAll, m = ui.min, a = ui.act;
  $('panel').hidden = h || m.panel; $('chip-panel').hidden = h || !m.panel;
  $('info').hidden = !ui.infoOpen || h || m.info; $('chip-info').hidden = !ui.infoOpen || !(h || m.info); $('chip-info-text').textContent = 'Record: ' + ui.infoTitle;
  $('act').hidden = !a.on || h || m.act; $('chip-act').hidden = !a.on || !(h || m.act);
  $('act-text').textContent = a.text; $('act-fill').style.width = $('chip-act-fill').style.width = (a.frac * 100).toFixed(1) + '%'; $('chip-act-text').textContent = a.short;
  $('act-retry').hidden = !a.retry; $('act').classList.toggle('err', a.err); $('chip-act').classList.toggle('err', a.err || a.retry);
  $('chip-act').title = a.retry ? 'Some files did not load. Show the loading panel to retry' : 'Show the loading panel'; $('chip-act').setAttribute('aria-label', $('chip-act').title + ': ' + a.short);
  $('diag').hidden = !DIAG || h || m.diag; $('chip-diag').hidden = !DIAG || h || !m.diag; const dl = $('diagdl'); if (dl) dl.hidden = $('diag').hidden;
  $('foot').hidden = h;
  const tg = $('ui-toggle'); tg.textContent = h ? 'Show panels' : 'Hide panels'; tg.setAttribute('aria-pressed', String(h));
  tg.title = h ? 'Show the panels again (H)' : 'Hide all panels to see the model (H)'; tg.setAttribute('aria-label', h ? 'Show the panels again' : 'Hide all panels');
}
function setMin(k, v) { ui.min[k] = v; renderUI(); }
function toggleAll() { ui.hideAll = !ui.hideAll; renderUI(); }
// A chip opens its own card. While everything is hidden, that shows this one card and leaves the others minimised.
function openCard(k) { if (ui.hideAll) { ui.hideAll = false; for (const x of Object.keys(ui.min)) ui.min[x] = true; } ui.min[k] = false; renderUI(); }
function closeInfo() { ui.infoOpen = false; renderUI(); }
$('ui-toggle').onclick = toggleAll;
for (const k of ['panel', 'info', 'act', 'diag']) { $('min-' + k).onclick = () => setMin(k, true); $('chip-' + k).onclick = () => openCard(k); }
$('close-info').onclick = closeInfo;
addEventListener('keydown', e => { if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) toggleAll(); });
renderUI();   // apply ?panels=hidden before anything loads; the start-up panel is not part of these controls

// ---- start-up panel (in the page before this module loads) and activity bar
const boot = { el: $('boot'), msg: $('boot-msg'), bar: $('boot-bar'), fill: $('boot-fill'), sub: $('boot-sub'), retry: $('boot-retry') };
function bootSet(msg, frac, sub) { boot.msg.textContent = msg; boot.sub.textContent = sub || '';
  if (frac === null || frac === undefined) boot.bar.classList.add('ind'); else { boot.bar.classList.remove('ind'); boot.fill.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%'; } }
function bootFail(msg, onRetry) { boot.el.hidden = false; boot.el.classList.add('err'); boot.bar.hidden = true; boot.msg.textContent = msg; boot.sub.textContent = 'Check the connection, then retry.';
  boot.retry.hidden = false; boot.retry.onclick = () => { boot.el.classList.remove('err'); boot.bar.hidden = false; boot.retry.hidden = true; onRetry(); }; }

let renderer;
const canvas = $('c');
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); }
catch (e) { bootFail('This browser could not start WebGL, which the 3D view needs.', () => location.reload()); throw e; }
// Pixel ratio: ?pr=1.5 fixes it; otherwise start at min(device, 2) and step down only if the measured frame rate stays low while nothing is loading.
let PR = QS.has('pr') ? Math.max(0.5, Math.min(3, Number(QS.get('pr')) || 1)) : Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eeeb'); scene.fog = new THREE.Fog('#e9eeeb', 6000, 14000);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 30000);
scene.add(new THREE.HemisphereLight('#ffffff', '#8c9486', 1.25)); const sun = new THREE.DirectionalLight('#fff4e6', 1.4); sun.position.set(-3000, 5000, 2500); scene.add(sun);
const controls = new MapControls(camera, canvas); controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 20; controls.maxDistance = 16000; controls.enableDamping = true;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
// Terrain keeps its stored normals. Everything else has no stored normals in the preview files and is shaded flat from the triangle itself.
const matSmooth = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const matFlat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function shown(o) { for (let p = o; p; p = p.parent) { if (!p.visible) return false; } return true; }
function originOf(gltf) { const j = gltf.parser.json; let o = (j.scenes || [])[0]?.extras?.origin_local_zup_m;
  if (!o) for (const n of (j.nodes || [])) if (n.extras?.origin_local_zup_m) { o = n.extras.origin_local_zup_m; break; }
  o = o || [0, 0, 0]; return new THREE.Vector3(o[0], o[2], -o[1]); }
function namedParent(o) { for (let p = o; p; p = p.parent) if (p.name && !/^mesh_\d+$/.test(p.name)) return p.name; return o.name; }

// Meshes are used as decoded (quantised integer positions + the node's scale/offset matrix): no per-vertex conversion on the main thread.
function buildScene(gltf, kind, tileId) {
  const root = new THREE.Group(); root.position.copy(originOf(gltf)); root.userData.kind = kind; gltf.scene.updateMatrixWorld(true);
  for (const g of gltf.scene.children) g.traverse(o => { if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, o.geometry.attributes.normal ? matSmooth : matFlat); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld);
    if (kind === 'ov') { m.name = namedParent(o); m.userData = { layer: GROUP_TO_LAYER[g.name] || g.name, ov: true, tile: m.name.slice(0, 6) }; state.ov[m.name] = m; }
    else { m.name = g.name; m.userData = { layer: (kind === 'b2' && g.name === 'buildings_b2') ? 'facade' : (GROUP_TO_LAYER[g.name] || g.name), tile: tileId, file: kind, group: g.name }; }
    root.add(m); state.pick.push(m); });
  return root;
}
function applyLayers() {
  for (const [id, s] of Object.entries(state.tiles)) {   // overview stand-ins give way to the detail that replaces them
    const a = state.ov[id + '_terrain_b0'], b = state.ov[id + '_buildings_b0']; if (a) a.userData.hidden = !!s.base; if (b) b.userData.hidden = !!(s.b1 || s.b2);
    if (s.b1) s.b1.visible = !(s.b2 && state.layers.facade); }
  for (const m of state.pick) { const L = m.userData.layer; m.visible = !m.userData.hidden && (L === 'facade' ? (state.layers.facade && state.layers.buildings) : !!state.layers[L]); }
}
function dispose(root) { if (!root) return; scene.remove(root); const gone = new Set(); root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); gone.add(o); } }); state.pick = state.pick.filter(p => !gone.has(p)); }

// ---- download queue
async function download(job) {
  const r = await fetch(job.url, { signal: job.ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); job.got = b.byteLength; return b; }
  const rd = r.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; job.got = n; }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out.buffer;
}
function addJob(key, url, bytes, kind, tile, prio, onDone) {
  const job = { key, url, bytes: bytes || 0, kind, tile, prio, onDone, state: 'queued', got: 0, tries: 0, ctrl: null, wait: 0 }; state.jobs.set(key, job); return job;
}
function cancel(job) { if (job.ctrl) job.ctrl.abort(); job.state = 'cancelled'; state.jobs.delete(job.key); state.net.cancelled++; }
async function run(job) {
  job.state = 'loading'; job.ctrl = new AbortController(); job.got = 0; const t0 = performance.now(); state.net.requests++;
  try {
    const buf = await download(job); const t1 = performance.now(); state.net.bytes += buf.byteLength;
    if (job.state === 'cancelled') return; job.state = 'decoding';
    const gltf = await loader.parseAsync(buf, ''); if (job.state === 'cancelled') return;
    const root = buildScene(gltf, job.kind === 'ov' ? 'ov' : job.kind, job.tile); const t2 = performance.now();
    job.state = 'done'; job.got = job.bytes || buf.byteLength; if (job.key !== 'ov:terrain') { batch.bytes += job.bytes; batch.files++; } state.log.push({ key: job.key, bytes: buf.byteLength, download_ms: Math.round(t1 - t0), decode_ms: Math.round(t2 - t1), at_ms: Math.round(t2 - __diag.t0), tries: job.tries + 1 });
    job.onDone(root);
  } catch (e) {
    if (job.state === 'cancelled' || (e && e.name === 'AbortError')) return;
    job.tries++;
    if (job.tries <= RETRIES) { state.net.retries++; job.state = 'queued'; job.wait = performance.now() + 700 * job.tries; }
    else { job.state = 'failed'; job.error = String(e && e.message || e); state.net.failed++; diagError('file_load', e, { file: job.url, tile: job.tile, attempts: job.tries }); console.error('file failed', job.url, e); }
  } finally { pump(); showActivity(); }
}
function pump() {
  let running = 0; for (const j of state.jobs.values()) if (j.state === 'loading' || j.state === 'decoding') running++;
  const now = performance.now(), q = [...state.jobs.values()].filter(j => j.state === 'queued' && j.wait <= now).sort((a, b) => a.prio - b.prio);
  while (running < CONC && q.length) { run(q.shift()); running++; }
}
function retryFailed() { for (const j of state.jobs.values()) if (j.state === 'failed') { j.state = 'queued'; j.tries = 0; j.wait = 0; } pump(); showActivity(); }

// ---- what the current view needs
function plan() {
  const mf = state.manifest; if (!mf) return; const t = controls.target, camH = camera.position.y - t.y;
  for (const ti of mf.tiles) {
    const cx = (ti.bbox[0] + ti.bbox[2]) / 2, cz = -(ti.bbox[1] + ti.bbox[3]) / 2, d = Math.hypot(cx - t.x, cz - t.z), s = state.tiles[ti.id] ||= {};
    const want = { base: d < R_BASE && camH < 3500, b1: d < R_BASE && camH < 3500, b2: d < R_B2 && camH < 900 };
    const keep = { base: d < R_BASE * 1.15 && camH < 3850, b1: d < R_BASE * 1.15 && camH < 3850, b2: d < R_B2 * 1.25 && camH < 1000 };   // a little slack so tiles do not flicker at the edge
    for (const L of ['base', 'b1', 'b2']) {
      const key = ti.id + ':' + L, job = state.jobs.get(key), url = ti.files[L]; if (!url) continue;
      // nearest tile first; its facade detail comes before the outer ring of mid-distance tiles
      const prio = d + (L === 'b1' ? 1 : L === 'b2' ? 250 : 0);
      if (want[L]) { if (!s[L] && !job) addJob(key, url, ti.bytes?.[L], L, ti.id, prio, root => { s[L] = root; scene.add(root); state.jobs.delete(key); applyLayers(); mark(ti.id + '_' + L + '_ready_ms'); }); else if (job) job.prio = prio; }
      else {
        if (job && job.state !== 'done' && !keep[L]) cancel(job);            // the view moved on: drop requests nobody is waiting for
        if (s[L] && !keep[L]) { dispose(s[L]); s[L] = null; applyLayers(); }
      }
    }
  }
  pump(); showActivity();
  const n = Object.values(state.tiles); $('status').textContent = `Loaded tiles: ${n.filter(x => x.base).length} near, ${n.filter(x => x.b2).length} with facade detail · draw calls ${renderer.info.render.calls}`;
}
const batch = { bytes: 0, files: 0, active: false }; let hideTimer = 0;
function pending() { const j = [...state.jobs.values()]; return { live: j.filter(x => x.state === 'queued' || x.state === 'loading' || x.state === 'decoding'), failed: j.filter(x => x.state === 'failed') }; }
// Activity bar: bytes are real (finished files + bytes received so far, against the manifest sizes of everything this view still needs).
// The total changes when the view moves, because the list of needed files changes.
function showActivity() {
  if (!state.terrainReady) return; const p = pending(), live = p.live, A = ui.act;
  if (!live.length && !p.failed.length) {
    if (batch.active) { batch.active = false; Object.assign(A, { on: true, text: `Ready: everything for this view is loaded (${batch.files} files, ${mb(batch.bytes)} MB)`, short: 'Ready', frac: 1, err: false, retry: false }); renderUI();
      clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!batch.active) { A.on = false; batch.bytes = 0; batch.files = 0; renderUI(); } }, 2500); }
    return;
  }
  batch.active = true; clearTimeout(hideTimer);
  const ov = live.filter(j => j.kind === 'ov').length, det = live.length - ov, dec = live.filter(j => j.state === 'decoding').length, dl = live.filter(j => j.state === 'loading').length;
  const left = live.reduce((n, j) => n + j.bytes, 0), got = live.reduce((n, j) => n + Math.min(j.got, j.bytes || j.got), 0), total = batch.bytes + left;
  const parts = []; if (det) parts.push(`detail near the view: ${det} file${det > 1 ? 's' : ''} left`); if (ov) parts.push(`whole-area building blocks: ${ov} part${ov > 1 ? 's' : ''} left`);
  let txt = live.length ? `Loading ${parts.join(' · ')} · ${mb(batch.bytes + got)} of ${mb(total)} MB` + (dl ? ` · downloading ${dl}` : '') + (dec ? ` · decoding ${dec}` : '') : '';
  const nf = p.failed.length, ftxt = nf ? `${nf} file${nf > 1 ? 's' : ''} did not load` : '';
  if (nf) txt += (txt ? ' · ' : '') + ftxt + ` after ${RETRIES + 1} attempts`;
  Object.assign(A, { on: true, text: txt, short: (live.length ? `Loading ${mb(batch.bytes + got)} of ${mb(total)} MB` : '') + (nf ? (live.length ? ' · ' : '') + ftxt : ''), frac: total ? Math.min(1, (batch.bytes + got) / total) : 0, err: !!nf && !live.length, retry: !!nf });
  renderUI();
}

// ---- feature records (separate .features.json per tile file; fetched only when a feature is picked)
function features(tileId, file) { const k = tileId + ':' + file; if (state.feat[k]) return state.feat[k];
  const ti = state.manifest.tiles.find(t => t.id === tileId), url = ti?.features?.[file]; if (!url) return Promise.resolve(null);
  return state.feat[k] = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(e => { delete state.feat[k]; throw e; }); }
function infoBox(title, layer, rows, noteText) {   // fills the record card; whether the card or its chip is shown is the user's choice (renderUI)
  $('info-title').textContent = title; $('info-note').textContent = layer + (noteText ? ' · ' + noteText : '');
  const tb = $('info-table'); tb.textContent = ''; for (const [k, v] of rows) { const tr = tb.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = typeof v === 'object' ? JSON.stringify(v) : v; }
  ui.infoOpen = true; ui.infoTitle = title; renderUI(); }
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let pickSeq = 0;
canvas.addEventListener('dblclick', async e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(state.pick.filter(shown), false)[0]; const seq = ++pickSeq;
  if (!hit) { closeInfo(); return; }
  const u = hit.object.userData;
  if (u.ov) { infoBox(hit.object.name, u.layer, [['level', 'B0 overview'], ['tile', u.tile]], 'zoom in for the detailed model and its record'); return; }
  const uv = hit.object.geometry.attributes.uv, fid = uv ? Math.round(uv.getX(hit.face.a)) : 0;
  infoBox(u.group + ' #' + fid, u.layer, [['tile', u.tile]], 'loading record…');
  try {
    const fs = await features(u.tile, u.file); if (seq !== pickSeq) return; const f = fs?.[u.group]?.[fid]; if (!f) { infoBox(u.group + ' #' + fid, u.layer, [['tile', u.tile]], 'no record found'); return; }
    let ex = Object.assign({}, f[1]); const id = ex.id || f[0];
    if (u.file === 'b2') { const b1 = await features(u.tile, 'b1').catch(() => null); if (seq !== pickSeq) return; const rec = b1?.buildings_b1?.find(x => (x[1].id || x[0]) === id); if (rec) ex = Object.assign({}, rec[1], ex); }
    infoBox(id, u.layer, Object.entries(ex).filter(([k, v]) => v !== null && v !== undefined));
  } catch (err) { if (seq === pickSeq) infoBox(u.group + ' #' + fid, u.layer, [['tile', u.tile]], 'the record file did not load (' + err.message + '); double-click again to retry'); }
});

// ---- start
function fly(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); plan(); }
async function init() {
  bootSet('Reading the list of model files…', null);
  const r = await fetch('manifest.json?v=perf001-20261110'); if (!r.ok) throw new Error('manifest.json: HTTP ' + r.status); const mf = state.manifest = await r.json();
  $('sub').textContent = mf.subtitle; $('stats').innerHTML = mf.stats.map(s => `<div><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  $('note').textContent = mf.note; $('foot').textContent = mf.attribution;
  $('layers').innerHTML = LAYERS.map(([k, n, c]) => `<label><input type="checkbox" id="layer-${k}" data-k="${k}" checked><span class="sw" style="background:${c}"></span>${n}</label>`).join('');
  document.querySelectorAll('#layers input').forEach(i => i.onchange = () => { state.layers[i.dataset.k] = i.checked; applyLayers(); });
  const views = { 'Overview': [0, 5200, 6800, 0, 0, 0], 'Top view': [0, 11000, 1, 0, 0, 0], 'City centre': [-150, 650, 900, 0, 0, 0] };
  $('views').innerHTML = Object.keys(views).map(k => `<button data-v="${k}">${k}</button>`).join('');
  document.querySelectorAll('#views button').forEach(b => b.onclick = () => fly(...views[b.dataset.v]));
  $('landmarks').innerHTML = (mf.landmarks || []).map((l, i) => `<button data-i="${i}"${l.tier === 'priority' ? ' class="pri"' : ''}>${l.name}</button>`).join('') || '<span class="note">None listed</span>';
  document.querySelectorAll('#landmarks button').forEach(b => b.onclick = () => { const l = mf.landmarks[+b.dataset.i]; const z = l.z || 20; fly(l.x + 160, z + 140, -l.y + 220, l.x, z, -l.y); closeInfo(); });
  $('act-retry').onclick = retryFailed; renderUI();
  camera.position.set(...views['Overview'].slice(0, 3)); controls.target.set(0, 0, 0); controls.update(); if (!state.ticking) { state.ticking = true; tick(); }
  // 1. terrain overview: the first picture
  const ov = mf.overview, tj = addJob('ov:terrain', ov.terrain.file, ov.terrain.bytes, 'ov', null, -1e9, root => { scene.add(root); state.jobs.delete('ov:terrain'); state.terrainReady = true; applyLayers(); mark('terrain_ready_ms'); boot.el.hidden = true; renderUI(); startBuildings(); });
  const watchTerrain = () => { const w = setInterval(() => {
    if (tj.state === 'queued') bootSet('Downloading the terrain overview', 0, tj.tries ? `retrying, attempt ${tj.tries + 1} of ${RETRIES + 1}` : `0 of ${mb(tj.bytes)} MB`);
    else if (tj.state === 'loading') bootSet('Downloading the terrain overview', tj.bytes ? tj.got / tj.bytes : null, `${mb(tj.got)} of ${mb(tj.bytes)} MB` + (tj.tries ? ` · attempt ${tj.tries + 1} of ${RETRIES + 1}` : ''));
    else if (tj.state === 'decoding') bootSet('Preparing the terrain…', 1, `${mb(tj.bytes)} MB downloaded`);
    else if (tj.state === 'failed') { clearInterval(w); bootFail(`The terrain overview did not load after ${RETRIES + 1} attempts (${tj.error}).`, () => { tj.state = 'queued'; tj.tries = 0; tj.wait = 0; bootSet('Downloading the terrain overview', 0); watchTerrain(); pump(); }); }
    else clearInterval(w);
  }, 120); };
  watchTerrain();
  pump();
  // 2. whole-area building blocks, nearest part to the view first; near detail (lower priority numbers) always goes ahead of them
  function startBuildings() { let left = ov.buildings.length;
    for (const p of ov.buildings) { const key = 'ov:' + p.file; addJob(key, p.file, p.bytes, 'ov', null, 1e5 + Math.hypot(p.centre[0] - controls.target.x, -p.centre[1] - controls.target.z), root => { scene.add(root); state.jobs.delete(key); applyLayers(); if (--left === 0) mark('overview_ready_ms'); }); }
    plan(); }
  if (!state.planTimer) { state.planTimer = setInterval(plan, 400); controls.addEventListener('end', plan); }
  // Optional inspection views (inspect_views.json next to this file): fixed cameras for reproducible checks.
  try { const ri = await fetch('./inspect_views.json'); if (ri.ok) { const iv = await ri.json(); const host = $('landmarks');
      const h = document.createElement('h2'); h.textContent = 'Inspection views'; const box = document.createElement('div'); box.id = 'inspect'; box.className = host.className;
      box.innerHTML = iv.views.map((v, i) => `<button data-i="${i}">${i + 1}. ${v.label}</button>`).join('');
      host.parentNode.insertBefore(h, host.nextSibling); h.parentNode.insertBefore(box, h.nextSibling);
      box.querySelectorAll('button').forEach(bn => bn.onclick = () => { const v = iv.views[+bn.dataset.i]; fly(...v.cam);
        infoBox(v.label, 'inspection view ' + (+bn.dataset.i + 1), Object.entries(v).filter(([k, x]) => k !== 'label' && x !== null && x !== undefined)); }); } } catch (e) { /* no inspection file */ }
  const cp = QS.get('cam'); if (cp) { const c = cp.split(',').map(Number); if (c.length === 6 && c.every(Number.isFinite)) fly(...c); }
}
let frames = 0, fpsT = performance.now(), fps = 0, lowFps = 0, first = true;
function tick() { requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); frames++;
  if (first) { first = false; mark('first_frame_ms'); }
  const now = performance.now(); if (now - fpsT >= 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    if (!QS.has('pr') && state.terrainReady && !pending().live.length && document.visibilityState === 'visible') { lowFps = fps < 24 ? lowFps + 1 : 0;
      if (lowFps >= 4 && PR > 1) { PR = Math.max(1, PR - 0.5); renderer.setPixelRatio(PR); lowFps = 0; __diag.marks['pixel_ratio_lowered_to_' + PR + '_ms'] = Math.round(now - __diag.t0); } }
    if (DIAG) showDiag(); } }
// ---- read-only diagnostics (?diag=1): frame rate, ready times, network counts, captured page errors. Not the full browser console.
function mark(k) { if (window.__diag && !(k in __diag.marks)) __diag.marks[k] = Math.round(performance.now() - __diag.t0); }
function stats() { const p = pending(); return { net: state.net, pending: p.live.length, failed: p.failed.length, files: state.log.slice(), marks: __diag.marks, errors: __diag.errors.length, pixel_ratio: PR, fps: +fps.toFixed(1) }; }
function showDiag() { const d = window.__diag || { marks: {}, errors: [] }, el = $('diag-text'); if (!el) return;
  const i = renderer.info.render, n = state.net, dl = state.log.reduce((s, x) => s + x.download_ms, 0), dc = state.log.reduce((s, x) => s + x.decode_ms, 0);
  el.textContent = `Diagnostics (read-only; page errors captured since load - not the full browser console)\n` +
    `FPS ${fps.toFixed(1)} · draw calls ${i.calls} · triangles ${(i.triangles / 1e6).toFixed(2)} M · pixel ratio ${PR}\n` +
    `Network: ${n.requests} requests · ${mb(n.bytes)} MB · retries ${n.retries} · failed ${n.failed} · cancelled ${n.cancelled}\n` +
    `Summed per-file times: download ${(dl / 1000).toFixed(1)} s · decode ${(dc / 1000).toFixed(1)} s (downloads overlap, so this is not wall-clock time)\n` +
    `Camera [eye x, up, z, target x, up, z]: ${[camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z].map(v => v.toFixed(1)).join(', ')}\n` +
    `Ready times since page start (ms):\n` + Object.entries(d.marks).slice(0, 40).map(([k, v]) => `  ${k}: ${v}`).join('\n') +
    `\nErrors captured: ${d.errors.length}\n` + d.errors.slice(-20).map(e => `  [${e.t_ms} ms] ${e.type}${e.tile ? ' tile ' + e.tile : ''}${e.file ? ' file ' + e.file : ''}: ${e.msg} ${e.src || ''}${e.stack ? '\n    ' + e.stack.split('\n').join('\n    ') : ''}`).join('\n');
  if (!$('diagdl')) { const b = document.createElement('button'); b.id = 'diagdl'; b.textContent = 'Download diagnostics (JSON)';
    b.onclick = () => { const blob = new Blob([JSON.stringify({ captured: window.__diag, stats: stats(), renderer: renderer.info.render, ua: navigator.userAgent, url: location.href, note: 'page-captured errors only; not the full browser console' }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uwm_viewer_diagnostics.json'; a.click(); };
    $('diag').parentNode.insertBefore(b, $('diag').nextSibling); renderUI(); } }
function diagError(type, e, ctx) { if (window.__diag) __diag.errors.push(Object.assign({ t_ms: Math.round(performance.now()), type, msg: String(e && e.message || e), stack: String(e && e.stack || '') }, ctx)); }
window.uwmViewer = { fly, state, camera, controls, renderer, stats, idle: () => !!state.terrainReady && !pending().live.length };   // hook for automated screenshots / checks
const start = () => init().catch(e => { console.error(e); diagError('init', e, {}); bootFail('The viewer could not start (' + e.message + ').', start); });
start();
