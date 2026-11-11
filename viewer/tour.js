// Intro tour for the Bristol viewer (task 15). Plays once when the page opens, like a short film, with the order and
// camera transitions of the framework's South Kensington viewer (src/visualization/legacy/viewer/3d/main.js @587f3d9):
//   1. slow orbit of the whole area (elevation 32 deg, 0.09 rad/s, 16 s, starting at bearing -150 deg);
//   2. landmark shots: a 2.6 s eased flight to each, then a slow orbit (0.05 rad/s);
//   3. a 2.6 s climb to the near-overhead view (5 deg tilt to the south, framed on the simulation domain);
//   4. the fields in sequence, wind first, then flooding, 0.6 s cross-fade between them. Wind is shown as a speed map on
//      the ground with the tree layers hidden (the reference shows a wind-speed map and hides ground and trees); flooding
//      with ground and trees visible. Segment lengths follow CD's Safari timing of the public reference page;
//   5. instead of looping back to the start (the reference's auto mode), a flight back to the whole-area view and free
//      exploration. The tour only moves the camera and switches existing layers; it adds no data.
// Any drag, scroll or tap on the model hands control to the user at once.
const D2R = Math.PI / 180;
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // same easing as the reference flyTo
const FLY_SHOT = 2.6, FLY_OVERHEAD = 2.6, FADE = 0.6;   // seconds: flights as the reference's flyTo (2600 ms; CD saw the climb to overhead take about 2 s in Safari)
const OVERVIEW = { dist: 8300, el: 32, az0: -150, rate: 0.09 / D2R, dur: 11 };   // rate in deg/s; 11 s = the campus segment CD timed in Safari
const SHOT_RATE = 0.05 / D2R, SHOT_DUR = 8;
const WIND_DUR = 9.6, FLOOD_DUR = 9.5;   // s; CD timed wind about 9 s and flooding 9-10 s in Safari (16 and 61 frames here)
// Priority landmarks, west to east (short flights): [look-at height above the landmark's ground, distance m, start bearing deg].
// Bearing 0 puts the camera south of the landmark, looking north.
const LANDMARKS = [['Clifton Suspension Bridge', 62, 640, -20], ['Cabot Tower', 18, 360, 140], ['Wills Memorial Building', 26, 360, 200],
  ['Bristol Cathedral', 14, 360, 150], ['St Mary Redcliffe', 24, 400, 215]];
const GROUPS = ['Geometry', 'Landmarks', 'Wind', 'Flooding', 'Explore'];
const TREE_LAYERS = ['trees_mapped', 'trees_rows', 'canopy_illustrative', 'hedges'];

export function createTour({ camera, controls, state, fields, sim, loadingText, overviewReady, onActive, setFog = () => {} }) {
  const $ = id => document.getElementById(id);
  const el = { box: $('tour'), title: $('tour-title'), sub: $('tour-sub'), meta: $('tour-meta'), steps: $('tour-steps'), fill: $('tour-fill'),
    pause: $('tour-pause'), skip: $('tour-skip'), legend: $('tour-legend'), ramp: $('tour-ramp'), lo: $('tour-lo'), hi: $('tour-hi') };
  el.steps.innerHTML = GROUPS.map(g => `<span>${g}</span>`).join('');
  const T = { active: false, paused: false, stages: [], i: -1, t: 0, from: null, last: 0, hintTimer: 0, total: 1, done: 0, skipped: [], holdEnd: 0,
    fade: { wind: { v: 0, to: 0 }, flood: { v: 0, to: 0 } } };

  // ---- camera poses {tx, ty, tz, dist, el (rad), az (rad)} -> position + target
  const pos = p => { const ce = Math.cos(p.el); return [p.tx + p.dist * ce * Math.sin(p.az), p.ty + p.dist * Math.sin(p.el), p.tz + p.dist * ce * Math.cos(p.az)]; };
  const now3 = () => ({ pos: camera.position.toArray(), tgt: controls.target.toArray() });
  function put(P, G) { camera.position.set(P[0], P[1], P[2]); controls.target.set(G[0], G[1], G[2]); camera.lookAt(controls.target); }
  const orbit = (tx, ty, tz, dist, elDeg, azDeg, rateDeg) => u => ({ tx, ty, tz, dist, el: elDeg * D2R, az: (azDeg + rateDeg * u) * D2R });
  function overhead() {   // reference overheadPose(): 5 deg tilt to the south, distance that fits the simulation domain in the window
    const vf = camera.fov * D2R, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), span = 8000;
    const d = 1.08 * Math.max(span / 2 / Math.tan(vf / 2), span / 2 / Math.tan(hf / 2));
    return () => ({ tx: 0, ty: 0, tz: 0, dist: d, el: 85 * D2R, az: 0 });
  }
  const focusOf = p => ({ x: p.tx, z: p.tz, h: p.dist * Math.sin(p.el) });
  function tileReady(x, z) { const c = Math.floor((x + 4000) / 500), r = Math.floor((-z + 4000) / 500), s = state.tiles['t' + String(c).padStart(2, '0') + '_' + String(r).padStart(2, '0')];
    return !!(s && s.base && (s.b1 || s.b2)); }
  function fadeTo(k, v) { T.fade[k].to = v; }

  // ---- the film. Each stage: fly (s) eased flight from wherever the camera is to pose(0); then dur (s) of motion pose(u).
  function build(mf, fm) {
    const S = [];
    S.push({ group: 0, title: 'Bristol · 8 km × 8 km', sub: 'Buildings, terrain and landscape built from open map and height data. Stage preview: roof shapes and facade detail are inferred, not surveyed.',
      fly: 0, dur: OVERVIEW.dur, pose: orbit(0, 0, 0, OVERVIEW.dist, OVERVIEW.el, OVERVIEW.az0, OVERVIEW.rate),
      hold: () => !overviewReady(), holdMax: 25, holdText: 'Loading the whole-area building blocks…' });
    const lms = LANDMARKS.map(([n, h, d, az]) => [(mf.landmarks || []).find(l => l.name === n), h, d, az]).filter(x => x[0]);
    lms.forEach(([l, h, d, az], k) => S.push({ group: 1, title: l.name, sub: `Landmark ${k + 1} of ${lms.length}`, fly: FLY_SHOT, dur: SHOT_DUR,
      pose: orbit(l.x, (l.z || 0) + h, -l.y, d, 32, az, SHOT_RATE), ready: () => tileReady(l.x, -l.y), readyMax: 8 }));
    const top = overhead();
    if (fm.wind) S.push({ group: 2, title: 'Wind speed · seen from above', sub: 'Learned surrogate model (SCALED) on the Bristol buildings, 12 m above the ground. Illustrative: flat terrain, the model\'s own wind direction, not validated.',
      legend: ['wind', 'slow', 'fast'], fly: FLY_OVERHEAD, dur: WIND_DUR, pose: top,
      ready: () => fields.S.wind.loaded, readyMax: 20, readyText: 'Loading the wind results…',
      enter: async () => { sim.trees(false); fields.setWindMode('map'); sim.windFrame(0); await sim.set('wind', true); fadeTo('wind', 1); },
      tick: u => { const n = fields.windInfo().n || 1; sim.windFrame(Math.min(n - 1, Math.floor(u / WIND_DUR * n))); return sim.label('wind'); },
      exit: () => fadeTo('wind', 0) });
    if (fm.flood) { const end = 10800;
      S.push({ group: 3, title: 'Surface-water flooding · seen from above', sub: 'Design storm: 50 mm of rain in 90 minutes, then 90 minutes of drainage, on the 8 m terrain grid. Illustrative scenario, not a forecast; rivers and tides are not modelled.',
        legend: ['flood', '2 cm', '60 cm+'], fly: FLY_OVERHEAD, dur: FLOOD_DUR, pose: top,
        ready: () => fields.S.flood.loaded, readyMax: 25, readyText: 'Loading the flood results…',
        enter: async () => { sim.trees(true); sim.floodTime(0); await sim.set('flood', true); sim.floodTime(0); fadeTo('flood', 1); },
        tick: u => { sim.floodTime(end * clamp01(u / FLOOD_DUR)); return sim.label('flood'); },
        exit: () => fadeTo('flood', 0) }); }
    S.push({ group: 4, title: 'Explore freely', sub: 'Drag to move · scroll or pinch to zoom · right-drag or two fingers to turn · double-click a feature for its record.',
      fly: FLY_SHOT, dur: 0, pose: orbit(0, 0, 0, OVERVIEW.dist, OVERVIEW.el, OVERVIEW.az0, 0), last: true });
    // Files to fetch: what the view on screen needs and, at lower priority, what the next view needs.
    S.forEach((s, k) => { const nx = S[k + 1]; s.focus = u => [focusOf(s.pose(Math.max(0, u))), ...(nx && !(s.hold && s.hold()) ? [{ ...focusOf(nx.pose(0)), pr: 3000 }] : [])]; });
    return S;
  }

  function show() {
    const s = T.stages[T.i]; el.box.hidden = false; el.title.textContent = s.title; el.sub.textContent = s.sub; el.meta.textContent = '';
    [...el.steps.children].forEach((c, k) => { c.classList.toggle('on', k === s.group); c.classList.toggle('done', k < s.group); });
    el.legend.hidden = !s.legend; if (s.legend) { el.ramp.className = 'ramp ' + s.legend[0]; el.lo.textContent = s.legend[1]; el.hi.textContent = s.legend[2]; }
    el.pause.hidden = el.skip.hidden = !!s.last;
  }
  function enter(i) {
    const prev = T.stages[T.i]; if (prev) { T.done += prev.fly + prev.dur; if (prev.exit) prev.exit(); }
    T.i = i; T.t = 0; T.from = now3(); T.holdEnd = 0; const s = T.stages[i]; s.entered = false; show();
    setFog(s.group !== 2 && s.group !== 3);   // no distance haze in the overhead field views (camera about 10 km up)
    Promise.resolve(s.enter ? s.enter() : 0).catch(e => { T.skipped.push(s.title + ': ' + (e && e.message || e)); }).then(() => { s.entered = true; });
    state.planFocus = s.focus(0);
  }
  function restoreLayers(keep) {   // after the tour: tree layers back on; fields off unless the user took over during one
    sim.trees(true); fields.setWindMode('streaks');
    for (const k of ['wind', 'flood']) { if (k === keep) { T.fade[k].v = T.fade[k].to = 1; fields.setOpacity(k, 1); sim.play(k, true); }
      else { T.fade[k].v = T.fade[k].to = 0; fields.setOpacity(k, 1); sim.set(k, false); } }
  }
  function finish(how) {   // 'end' = played through; 'skip' = button or Esc; 'take' = the user grabbed the model
    if (!T.active) return; const s = T.stages[T.i]; T.active = false; state.planFocus = null; controls.enabled = true; controls.update(); setFog(true);
    restoreLayers(how === 'take' && s && !s.last ? (s.group === 2 ? 'wind' : s.group === 3 ? 'flood' : null) : null);
    onActive(false);
    el.title.textContent = 'Explore freely'; el.sub.textContent = T.stages[T.stages.length - 1].sub; el.meta.textContent = ''; el.legend.hidden = true; el.pause.hidden = el.skip.hidden = true;
    [...el.steps.children].forEach((c, k) => { c.classList.toggle('on', k === 4); c.classList.toggle('done', k < 4); }); el.fill.style.width = '100%';
    const hide = () => { clearTimeout(T.hintTimer); el.box.hidden = true; el.box.classList.remove('hint'); el.box.onclick = null; };
    el.box.classList.add('hint'); el.box.onclick = hide; clearTimeout(T.hintTimer); T.hintTimer = setTimeout(hide, 7000);
    if (window.__diag) window.__diag.marks['tour_' + how + '_ms'] = Math.round(performance.now() - window.__diag.t0);
  }
  function skip() {   // jump to the whole-area view and hand over
    if (!T.active) return; const p = T.stages[T.stages.length - 1].pose(0); put(pos(p), [p.tx, p.ty, p.tz]); finish('skip'); }

  async function start() {
    if (T.active) return; const mf = state.manifest; if (!mf) return;
    let fm = {}; try { fm = await fields.manifest(); } catch (e) { fm = {}; }
    clearTimeout(T.hintTimer); el.box.classList.remove('hint'); el.box.onclick = null;
    T.stages = build(mf, fm); T.total = T.stages.reduce((n, s) => n + s.fly + s.dur, 0); T.done = 0; T.i = -1; T.paused = false; T.skipped = []; T.active = true; T.last = performance.now();
    el.pause.textContent = 'Pause'; el.pause.setAttribute('aria-pressed', 'false');
    for (const k of ['wind', 'flood']) { T.fade[k].v = T.fade[k].to = 0; fields.setOpacity(k, 0); sim.play(k, false); }
    await sim.set('wind', false); await sim.set('flood', false);
    controls.enabled = false; onActive(true);
    const p0 = T.stages[0].pose(0); put(pos(p0), [p0.tx, p0.ty, p0.tz]); enter(0);
    // Fetch the simulation results while the geometry part plays, wind first.
    (fm.wind ? fields.preload('wind') : Promise.resolve()).catch(() => {}).then(() => fm.flood ? fields.preload('flood') : 0).catch(() => {});
  }

  function stepFades(dt) {
    for (const k of ['wind', 'flood']) { const f = T.fade[k]; if (f.v === f.to) continue;
      f.v = f.v < f.to ? Math.min(f.to, f.v + dt / FADE) : Math.max(f.to, f.v - dt / FADE); fields.setOpacity(k, f.v);
      if (f.v === 0 && f.to === 0) sim.set(k, false); }
  }
  function update() {
    if (!T.active) return; const now = performance.now(), dt = Math.min(0.1, (now - T.last) / 1000); T.last = now;
    const s = T.stages[T.i], nx = T.stages[T.i + 1];
    if (!T.paused && s.entered) { T.t += dt; stepFades(dt); }
    const u = T.t - s.fly, p = s.pose(Math.max(0, u));
    if (u < 0) { const e = ease(clamp01(T.t / s.fly)), P = pos(p), G = [p.tx, p.ty, p.tz], A = T.from;   // reference flyTo: straight-line blend, eased
      put(P.map((v, k) => A.pos[k] + (v - A.pos[k]) * e), G.map((v, k) => A.tgt[k] + (v - A.tgt[k]) * e)); }
    else put(pos(p), [p.tx, p.ty, p.tz]);
    const m = s.tick && s.entered && u >= 0 ? s.tick(u) : '';
    // Leave when the stage has played and what the next one needs is there (or the wait has run out).
    let waitText = '';
    if (u >= s.dur) {
      if (s.last) { finish('end'); return; }
      if (s.hold && s.hold() && u - s.dur < s.holdMax) { waitText = s.holdText; T.holdEnd = u; }
      else if (nx.ready && !nx.ready() && u - Math.max(s.dur, T.holdEnd) < (nx.readyMax || 6)) waitText = nx.readyText || 'Loading the next view…';
      else if (nx.ready && !nx.ready() && nx.readyText) { T.skipped.push(nx.title + ': results did not load in time'); T.stages.splice(T.i + 1, 1); T.total -= nx.fly + nx.dur; return; }   // a field that never arrived is left out
      else { enter(T.i + 1); return; }
    }
    state.planFocus = s.focus(u);
    el.meta.textContent = waitText || m || (s.group < 2 ? loadingText() : '');
    el.fill.style.width = (100 * Math.min(1, (T.done + Math.min(T.t, s.fly + s.dur)) / T.total)).toFixed(1) + '%';
  }

  function togglePause() { if (!T.active) return; T.paused = !T.paused; el.pause.textContent = T.paused ? 'Resume' : 'Pause'; el.pause.setAttribute('aria-pressed', String(T.paused)); }
  el.skip.onclick = skip; el.pause.onclick = togglePause;
  const take = () => { if (T.active) finish('take'); };
  const canvas = controls.domElement;
  canvas.addEventListener('pointerdown', take, true); canvas.addEventListener('wheel', take, { capture: true, passive: true }); canvas.addEventListener('touchstart', take, { capture: true, passive: true });
  addEventListener('keydown', e => { if (!T.active || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') skip(); else if (e.key === ' ' && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); togglePause(); } });

  return { start, skip, update, togglePause, active: () => T.active,
    info: () => ({ active: T.active, paused: T.paused, stage: T.i, of: T.stages.length, title: T.stages[T.i]?.title, t: +T.t.toFixed(2), skipped: T.skipped.slice(),
      fade: { wind: +T.fade.wind.v.toFixed(2), flood: +T.fade.flood.v.toFixed(2) }, total_s: +T.total.toFixed(1) }),
    // for automated checks: jump to stage k at stage time t (flight included), with the fades of that stage settled
    seek(k, t = 0) { if (!T.active) return; enter(Math.max(0, Math.min(T.stages.length - 1, k))); const s = T.stages[T.i]; T.t = t;
      const p = s.pose(Math.max(0, t - s.fly)); T.from = { pos: pos(p), tgt: [p.tx, p.ty, p.tz] };
      for (const f of ['wind', 'flood']) { T.fade[f].v = T.fade[f].to = (s.group === 2 && f === 'wind') || (s.group === 3 && f === 'flood') ? 1 : 0; fields.setOpacity(f, T.fade[f].v); } } };
}
