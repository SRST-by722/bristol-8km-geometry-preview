// Wind and flooding layers for the Bristol viewer (task 15). Data come from ../web/fields/ (export_fields.py):
// manifest.json, a DTM image on the flood grid, one depth image per flood frame, one u/v image per wind frame.
// Flooding is painted onto the existing terrain, road, water and vegetation surfaces in the shader (water depth over the
// DTM); building walls are painted only below the local water surface. Wind is shown as moving streaks at a fixed height
// above the DTM, advected through the model's horizontal wind at that height.
import * as THREE from 'three';

const FLOOD_STOPS = ['#9fd8f2', '#4fb3e6', '#1e88d0', '#0d5fb0', '#083b85', '#041f52'];   // same ramp as the framework viewer
const FLOOD_RANGE = [0.02, 0.6];
const WIND_STOPS = ['#1d3a8a', '#2f6fc0', '#d99a12', '#d9531e', '#9b111e'];   // dark enough to read on the light terrain

async function decodePNG(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url.split('/').pop() + ': HTTP ' + r.status);
  const blob = await r.blob();
  let src;
  try { src = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
  catch (e) { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image decode failed')); im.src = URL.createObjectURL(blob); }); }
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }); g.drawImage(src, 0, 0);
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };   // RGBA, first row = north
}

export function createFields({ scene, camera, controls, materials, base = '../web/fields/', onStatus = () => {} }) {
  const U = {
    uFloodA: { value: null }, uFloodB: { value: null }, uFloodMix: { value: 0 }, uFloodOn: { value: 0 }, uFloodFade: { value: 1 },
    uDtm: { value: null }, uGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
    uStops: { value: FLOOD_STOPS.map(c => new THREE.Color(c)) }, uRange: { value: new THREE.Vector2(...FLOOD_RANGE) },
    uWind: { value: null }, uWindOn: { value: 0 }, uWGrid: { value: new THREE.Vector4(0, 0, 1, 1) }, uWStops: { value: WIND_STOPS.map(c => new THREE.Color(c)) },   // wind speed map (tour overhead view)
  };
  const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); placeholder.needsUpdate = true;
  U.uFloodA.value = U.uFloodB.value = U.uDtm.value = U.uWind.value = placeholder;
  // Shader patch: ground surfaces take the water colour where the depth exceeds 2 cm; walls only below the water surface.
  for (const [mat, walls] of materials) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vFW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vFW;
uniform sampler2D uFloodA, uFloodB, uDtm; uniform float uFloodMix, uFloodOn, uFloodFade; uniform sampler2D uWind; uniform float uWindOn; uniform vec4 uWGrid; uniform vec3 uWStops[5];
vec3 windRamp(float s) { float t = clamp(s, 0.0, 1.0) * 4.0; int i = int(min(floor(t), 3.0)); float f = t - float(i); vec3 a = uWStops[0], b = uWStops[1];
  for (int k = 0; k < 4; k++) { if (k == i) { a = uWStops[k]; b = uWStops[k + 1]; } }
  return mix(a, b, f); } uniform vec4 uGrid; uniform vec3 uStops[6]; uniform vec2 uRange;
vec3 floodRamp(float d) { float t = clamp((d - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0) * 5.0; int i = int(min(floor(t), 4.0)); float f = t - float(i);
  vec3 a = uStops[0], b = uStops[1];
  for (int k = 0; k < 5; k++) { if (k == i) { a = uStops[k]; b = uStops[k + 1]; } }
  return mix(a, b, f); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  ${walls ? '' : `if (uWindOn > 0.001) {   // wind speed map on the ground: R = speed / scale, G = building cell
    vec2 wuv = vec2((vFW.x - uWGrid.x) / uWGrid.z, (uWGrid.y + uWGrid.w + vFW.z) / uWGrid.w);
    if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) { vec4 w = texture2D(uWind, wuv); if (w.g < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, windRamp(w.r), 0.88 * uWindOn); }
  }`}
  if (uFloodOn > 0.5) {
    vec2 fuv = vec2((vFW.x - uGrid.x) / uGrid.z, (uGrid.y + uGrid.w + vFW.z) / uGrid.w);   // local y = -world z; v = 0 at the northern edge
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      float d = mix(texture2D(uFloodA, fuv).r, texture2D(uFloodB, fuv).r, uFloodMix) * 2.55;
      ${walls ? 'float surf = texture2D(uDtm, fuv).r + d; bool wet = d > uRange.x && vFW.y < surf + 0.05;' : 'bool wet = d > uRange.x;'}
      if (wet) { float a = (0.35 + 0.55 * smoothstep(uRange.x, 0.15, d)) * uFloodFade; diffuseColor.rgb = mix(diffuseColor.rgb, floodRamp(d), a); }
    }
  }`);
    };
    mat.customProgramCacheKey = () => 'fields-' + (walls ? 'walls' : 'ground');
    mat.needsUpdate = true;
  }

  const S = { man: null, dtm: null, flood: { tex: [], t: 0, playing: false, loaded: false, loading: false }, wind: { frames: [], k: -1, on: false, loaded: false, loading: false, playing: false, fi: 0, mode: 'streaks', mapOpacity: 1 } };
  let manP = null;
  const manifest = () => manP ||= fetch(base + 'manifest.json?v=ext001-20261111').then(r => { if (!r.ok) throw new Error('fields manifest: HTTP ' + r.status); return r.json(); }).then(m => { m.flood_rain = m.flood; return (S.man = m); });   // task 17: flood_rain / flood_river scenarios share the flood slot

  async function loadDtm() {
    if (S.dtm) return S.dtm;
    const m = S.man.dtm, img = await decodePNG(base + m.file), n = img.w * img.h, z = new Float32Array(n), half = new Uint16Array(n);
    for (let i = 0; i < n; i++) { const v = (img.data[4 * i] * 256 + img.data[4 * i + 1] - 2000) / 100; z[i] = v; half[i] = THREE.DataUtils.toHalfFloat(v); }
    const tex = new THREE.DataTexture(half, img.w, img.h, THREE.RedFormat, THREE.HalfFloatType); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    U.uDtm.value = tex; const g = m.grid; U.uGrid.value.set(g.x0, g.y0, g.nx * g.cell, g.ny * g.cell);
    let lo = Infinity, hi = -Infinity; for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
    S.dtm = { z, w: img.w, h: img.h, grid: g, range: [lo, hi] };
    return S.dtm;
  }
  function dtmAt(x, y) {   // bilinear DTM height at local x, y (m ODN)
    const d = S.dtm; if (!d) return 0; const g = d.grid;
    const fx = (x - g.x0) / g.cell - 0.5, fy = (g.y0 + g.ny * g.cell - y) / g.cell - 0.5;
    const i = Math.max(0, Math.min(d.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(d.h - 2, Math.floor(fy))), a = Math.min(1, Math.max(0, fx - i)), b = Math.min(1, Math.max(0, fy - j));
    const z = d.z, w = d.w;
    return (z[j * w + i] * (1 - a) + z[j * w + i + 1] * a) * (1 - b) + (z[(j + 1) * w + i] * (1 - a) + z[(j + 1) * w + i + 1] * a) * b;
  }

  // ---- flooding
  async function loadFlood() {
    const F = S.flood; if (F.loaded || F.loading) return; F.loading = true;
    try {
      await manifest(); if (!S.man.flood) throw new Error('no flood results in this build');
      await loadDtm(); const fr = S.man.flood.frames; let n = 0;
      onStatus('flood', `Loading flood frames: 0 of ${fr.length}`);
      await Promise.all(fr.map(async (f, i) => {
        const img = await decodePNG(base + f.file), a = new Uint8Array(img.w * img.h);
        for (let k = 0; k < a.length; k++) a[k] = img.data[4 * k];
        const t = new THREE.DataTexture(a, img.w, img.h, THREE.RedFormat, THREE.UnsignedByteType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
        F.tex[i] = t; onStatus('flood', `Loading flood frames: ${++n} of ${fr.length}`);
      }));
      F.loaded = true; setFloodTime(F.t); onStatus('flood', '');
    } catch (e) { onStatus('flood', 'The flood layer did not load (' + e.message + ').', true); throw e; }
    finally { F.loading = false; }
  }
  function setFloodTime(t) {
    const F = S.flood, fr = S.man?.flood?.frames; F.t = t; if (!F.loaded || !fr) return;
    let i = 0; while (i < fr.length - 2 && fr[i + 1].t_s <= t) i++;
    const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
    U.uFloodA.value = F.tex[i]; U.uFloodB.value = F.tex[Math.min(i + 1, fr.length - 1)];
    U.uFloodMix.value = b.t_s > a.t_s ? Math.min(1, Math.max(0, (t - a.t_s) / (b.t_s - a.t_s))) : 0;
  }
  // Rain rate from the scenario's 15-minute hyetograph (the first saved frame is at the end of the first solver step, not at 0 s).
  function floodInfo() { const fl = S.man?.flood, fr = fl?.frames || [], t = S.flood.t, hy = fl?.scenario?.hyetograph_mm_h_15min_blocks || [];
    const k = Math.floor(t / 900), rain = t < hy.length * 900 ? hy[Math.min(k, hy.length - 1)] : 0;
    const h = fl?.scenario?.inflow?.hydrograph; let q = null;   // river scenario: inflow from its stated hydrograph
    if (h) { const R = h.rise_h * 3600, H = h.hold_h * 3600, F = h.fall_h * 3600; q = t < R ? h.q_peak_m3_s * t / R : t < R + H ? h.q_peak_m3_s : t < R + H + F ? h.q_peak_m3_s * (1 - (t - R - H) / F) : 0; }
    return { t, end: fr.length ? Math.round(fr[fr.length - 1].t_s) : 0, rain, q, scenario: S.flood.scenario || 'rain' }; }

  // ---- wind
  const N = 12000, LIFE = 5;   // streaks; seconds of screen time before a streak is respawned
  // Each streak is a flat tapered quad lying at the display height (WebGL lines are only 1 pixel wide on most systems).
  const pos = new Float32Array(N * 12), col = new Float32Array(N * 12), P = new Float32Array(N * 3), age = new Float32Array(N);
  const idx = new Uint32Array(N * 6); for (let i = 0; i < N; i++) idx.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 2, 4 * i + 1, 4 * i + 3], 6 * i);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const lines = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  lines.frustumCulled = false; lines.visible = false; lines.renderOrder = 5; scene.add(lines);
  const ramp = WIND_STOPS.map(c => new THREE.Color(c));
  async function loadWind() {
    const W = S.wind; if (W.loaded || W.loading) return; W.loading = true;
    try {
      await manifest(); if (!S.man.wind) throw new Error('no wind results in this build');
      await loadDtm(); const m = S.man.wind, sc = m.scale_m_s; let n = 0;
      onStatus('wind', `Loading wind frames: 0 of ${m.frames.length}`);
      await Promise.all(m.frames.map(async (f, i) => {
        const img = await decodePNG(base + f.file), cnt = img.w * img.h, u = new Float32Array(cnt), v = new Float32Array(cnt), solid = new Uint8Array(cnt);
        for (let k = 0; k < cnt; k++) { u[k] = (img.data[4 * k] - 128) / 127 * sc; v[k] = (img.data[4 * k + 1] - 128) / 127 * sc; solid[k] = img.data[4 * k + 2] > 127 ? 1 : 0; }
        const sp = new Uint8Array(cnt * 2); for (let k = 0; k < cnt; k++) { sp[2 * k] = Math.min(255, Math.round(Math.hypot(u[k], v[k]) / sc * 255)); sp[2 * k + 1] = solid[k] * 255; }
        const tx = new THREE.DataTexture(sp, img.w, img.h, THREE.RGFormat, THREE.UnsignedByteType); tx.minFilter = tx.magFilter = THREE.LinearFilter; tx.needsUpdate = true;
        W.frames[i] = { u, v, solid, w: img.w, h: img.h, step: f.step, tex: tx }; onStatus('wind', `Loading wind frames: ${++n} of ${m.frames.length}`);
      }));
      { const g = m.grid; U.uWGrid.value.set(g.x0, g.y0, g.nx * g.cell, g.ny * g.cell); }
      W.loaded = true; W.fi = W.frames.length - 1; U.uWind.value = W.frames[W.fi].tex; for (let i = 0; i < N; i++) spawn(i, true); onStatus('wind', '');
    } catch (e) { onStatus('wind', 'The wind layer did not load (' + e.message + ').', true); throw e; }
    finally { W.loading = false; }
  }
  function windAt(x, y) {
    const W = S.wind, fr = W.frames[W.fi]; if (!fr) return null; const g = S.man.wind.grid;
    const fx = (x - g.x0) / g.cell - 0.5, fy = (g.y0 + g.ny * g.cell - y) / g.cell - 0.5;
    if (fx < 0 || fy < 0 || fx >= fr.w - 1 || fy >= fr.h - 1) return null;
    const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, w = fr.w, k = j * w + i;
    if (fr.solid[k] && fr.solid[k + 1] && fr.solid[k + w] && fr.solid[k + w + 1]) return null;
    const bl = (A) => (A[k] * (1 - a) + A[k + 1] * a) * (1 - b) + (A[k + w] * (1 - a) + A[k + w + 1] * a) * b;
    return [bl(fr.u), bl(fr.v)];
  }
  function region() { const t = controls.target, d = camera.position.distanceTo(t); return { cx: t.x, cy: -t.z, r: Math.min(4300, Math.max(250, d * 1.1)), d }; }
  function spawn(i, any) {
    const R = region(); P[3 * i] = R.cx + (Math.random() * 2 - 1) * R.r; P[3 * i + 1] = R.cy + (Math.random() * 2 - 1) * R.r; age[i] = any ? Math.random() * LIFE : 0;
  }
  let last = performance.now();
  function update() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const W = S.wind; if (!W.on || !W.loaded) return;
    // Display speed-up: the fastest wind crosses about 1/8 of the visible region per second; a streak shows the path of the last 0.6 s.
    const R = region(), hAbove = S.man.wind.height_above_ground_m, sc = S.man.wind.scale_m_s, accel = R.r / (8 * sc);
    for (let i = 0; i < N; i++) {
      let x = P[3 * i], y = P[3 * i + 1]; const uv = windAt(x, y);
      age[i] += dt;
      if (!uv || age[i] > LIFE || Math.abs(x - R.cx) > R.r * 1.2 || Math.abs(y - R.cy) > R.r * 1.2 || Math.hypot(uv[0], uv[1]) < 0.02) { spawn(i, false); for (let k = 0; k < 12; k++) pos[12 * i + k] = 0; continue; }
      x += uv[0] * dt * accel; y += uv[1] * dt * accel; P[3 * i] = x; P[3 * i + 1] = y;
      const z = dtmAt(x, y) + hAbove, sp = Math.hypot(uv[0], uv[1]), L = 0.6 * accel, w = Math.max(R.r, R.d * 0.8) / 700;   // half-width in metres, about 1 px
      const tx = x - uv[0] * L, ty = y - uv[1] * L, nx = -uv[1] / Math.max(sp, 1e-6) * w, ny = uv[0] / Math.max(sp, 1e-6) * w;
      const q = 12 * i;   // head left/right, tail left/right (tail narrower)
      pos[q] = x + nx; pos[q + 1] = z; pos[q + 2] = -(y + ny); pos[q + 3] = x - nx; pos[q + 4] = z; pos[q + 5] = -(y - ny);
      pos[q + 6] = tx + nx * 0.35; pos[q + 7] = z; pos[q + 8] = -(ty + ny * 0.35); pos[q + 9] = tx - nx * 0.35; pos[q + 10] = z; pos[q + 11] = -(ty - ny * 0.35);
      const rt = Math.min(0.999, sp / sc) * (ramp.length - 1), ri = Math.floor(rt), c = ramp[ri].clone().lerp(ramp[ri + 1], rt - ri);
      const fade = Math.min(1, age[i] * 3) * Math.min(1, (LIFE - age[i]) * 3), bg = 0.86;   // fade in/out against a light background
      const hr = bg + (c.r - bg) * fade, hg = bg + (c.g - bg) * fade, hb = bg + (c.b - bg) * fade, tr = bg + (c.r - bg) * fade * 0.45, tg = bg + (c.g - bg) * fade * 0.45, tb = bg + (c.b - bg) * fade * 0.45;
      col[q] = col[q + 3] = hr; col[q + 1] = col[q + 4] = hg; col[q + 2] = col[q + 5] = hb; col[q + 6] = col[q + 9] = tr; col[q + 7] = col[q + 10] = tg; col[q + 8] = col[q + 11] = tb;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  }

  return {
    U, S, update, dtmAt, windAt,
    // task 17: choose the flood scenario ('rain' = task-15 design storm, 'river' = river-inflow scenario); frames reload on demand
    async useFloodScenario(k) { await manifest(); const key = k === 'river' ? 'flood_river' : 'flood_rain'; if (!S.man[key] || S.man.flood === S.man[key]) return;
      S.man.flood = S.man[key]; S.flood.tex = []; S.flood.loaded = false; S.flood.scenario = k; if (U.uFloodOn.value > 0.5) await loadFlood(); },
    floodScenario: () => S.flood.scenario || 'rain',
    async setFlood(on) { U.uFloodOn.value = on ? 1 : 0; if (on) await loadFlood(); },
    setFloodTime, floodInfo,
    async setWind(on) { S.wind.on = on; lines.visible = on && S.wind.mode !== 'map'; U.uWindOn.value = on && S.wind.mode === 'map' ? S.wind.mapOpacity : 0; if (on) await loadWind(); },
    setWindFrame(i) { const W = S.wind; if (!W.frames.length) return; W.fi = Math.max(0, Math.min(W.frames.length - 1, i)); U.uWind.value = W.frames[W.fi].tex; },
    // 'streaks' (default, the Simulations card) or 'map' (speed colours on the ground, used by the intro tour's overhead view)
    setWindMode(mode) { const W = S.wind; W.mode = mode; lines.visible = W.on && mode !== 'map'; U.uWindOn.value = W.on && mode === 'map' ? W.mapOpacity : 0; },
    windInfo() { const W = S.wind, f = W.frames[W.fi]; return { i: W.fi, n: W.frames.length, step: f?.step, total: S.man?.wind?.steps_total, height: S.man?.wind?.height_above_ground_m }; },
    manifest,
    preload: k => (k === 'wind' ? loadWind() : loadFlood()),   // fetch a layer's frames without showing it (used by the intro tour)
    setOpacity(k, v) { v = Math.max(0, Math.min(1, v)); if (k === 'flood') { U.uFloodFade.value = v; return; }   // tour cross-fades
      S.wind.mapOpacity = v; if (S.wind.mode === 'map') { U.uWindOn.value = S.wind.on ? v : 0; return; }
      const m = lines.material, tr = v < 1; m.opacity = v; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } },
  };
}
