// Ground overlay layers for the Bristol viewer (task 17): shading (sun and shadow through a day), and one scalar map at a time
// (traffic NOx tracer or air temperature). Data are PNG frames in ../web/fields/ described by manifest.json (keys shade, pollution,
// temperature), written by task 17 export_fields17.py. Painted on the ground-type surfaces in the shader (terrain, roads, water,
// green areas), like the flood layer of fields.js; this module chains its shader code after the one fields.js installs.
import * as THREE from 'three';

const V = 'ext003-20261112';
async function decodeGrey(url) {   // first channel of a PNG; first row = north
  const r = await fetch(url); if (!r.ok) throw new Error(url.split('/').pop() + ': HTTP ' + r.status);
  const blob = await r.blob(); let src;
  try { src = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
  catch (e) { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image decode failed')); im.src = URL.createObjectURL(blob); }); }
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[4 * i];
  const t = new THREE.DataTexture(a, c.width, c.height, THREE.RedFormat, THREE.UnsignedByteType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

export function createLayers({ materials, base = '../web/fields/' }) {
  const ph = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); ph.needsUpdate = true;
  const U = {
    uShA: { value: ph }, uShB: { value: ph }, uShMix: { value: 0 }, uShOn: { value: 0 }, uShGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
    uScA: { value: ph }, uScB: { value: ph }, uScMix: { value: 0 }, uScOn: { value: 0 }, uScGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
    uScStops: { value: Array.from({ length: 5 }, () => new THREE.Color()) }, uScFloor: { value: 0 }, uScAlpha: { value: 0.8 },
  };
  for (const [mat, walls] of materials) {
    if (walls) continue;   // ground-type surfaces only
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r); Object.assign(sh.uniforms, U);
      if (!sh.fragmentShader.includes('varying vec3 vFW;')) throw new Error('layers.js: fields.js shader patch not found');
      sh.fragmentShader = `uniform sampler2D uShA, uShB, uScA, uScB; uniform float uShMix, uShOn, uScMix, uScOn, uScFloor, uScAlpha; uniform vec4 uShGrid, uScGrid; uniform vec3 uScStops[5];
vec3 scRamp(float s) { float t = clamp(s, 0.0, 1.0) * 4.0; int i = int(min(floor(t), 3.0)); float f = t - float(i); vec3 a = uScStops[0], b = uScStops[1];
  for (int k = 0; k < 4; k++) { if (k == i) { a = uScStops[k]; b = uScStops[k + 1]; } } return mix(a, b, f); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uShOn > 0.001) {   // shading: 0 = sunlit, 1 = in shadow (layers.js)
    vec2 su = vec2((vFW.x - uShGrid.x) / uShGrid.z, (uShGrid.y + uShGrid.w + vFW.z) / uShGrid.w);
    if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0) { float s = mix(texture2D(uShA, su).r, texture2D(uShB, su).r, uShMix); diffuseColor.rgb *= mix(1.0, 0.42, s * uShOn); }
  }
  if (uScOn > 0.001) {   // scalar map (pollution tracer or temperature), 0..1 in the red channel; values at or below uScFloor are not drawn
    vec2 cu = vec2((vFW.x - uScGrid.x) / uScGrid.z, (uScGrid.y + uScGrid.w + vFW.z) / uScGrid.w);
    if (cu.x > 0.0 && cu.x < 1.0 && cu.y > 0.0 && cu.y < 1.0) { float c = mix(texture2D(uScA, cu).r, texture2D(uScB, cu).r, uScMix);
      if (c > uScFloor) diffuseColor.rgb = mix(diffuseColor.rgb, scRamp(c), uScAlpha * uScOn * smoothstep(uScFloor, uScFloor + 0.08, c)); }
  }`);
    };
    mat.customProgramCacheKey = () => prevKey + '|layers17';
    mat.needsUpdate = true;
  }

  const S = { man: null, shade: { tex: [], loaded: false, loading: null, on: false, t: 0 }, scalar: { key: null, tex: {}, loaded: {}, loading: {}, t: 0 } };
  let manP = null;
  const manifest = () => manP ||= fetch(base + 'manifest.json?v=' + V).then(r => { if (!r.ok) throw new Error('fields manifest: HTTP ' + r.status); return r.json(); }).then(m => (S.man = m));
  const setGrid = (u, g) => u.value.set(g.x0, g.y0, g.nx * g.cell, g.ny * g.cell);
  function pick(frames, t, key = 't') {   // frames sorted by `key`: index pair and mix for time t
    let i = 0; while (i < frames.length - 2 && frames[i + 1][key] <= t) i++;
    const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
    return [i, Math.min(i + 1, frames.length - 1), b[key] > a[key] ? Math.min(1, Math.max(0, (t - a[key]) / (b[key] - a[key]))) : 0];
  }

  async function loadShade(onProgress = () => {}) {
    const Sh = S.shade; if (Sh.loaded) return; if (Sh.loading) return Sh.loading;
    Sh.loading = (async () => { await manifest(); const m = S.man.shade; if (!m) throw new Error('no shading results in this build'); let n = 0;
      await Promise.all(m.frames.map(async (f, i) => { Sh.tex[i] = await decodeGrey(base + f.file + '?v=' + V); onProgress(++n, m.frames.length); }));
      setGrid(U.uShGrid, m.grid); Sh.loaded = true; setShadeTime(Sh.t); })();
    try { await Sh.loading; } finally { Sh.loading = null; }
  }
  function setShadeTime(h) {   // h = local clock hours (e.g. 13.5)
    const Sh = S.shade; Sh.t = h; const fr = S.man?.shade?.frames; if (!Sh.loaded || !fr) return;
    const [i, j, mix] = pick(fr, h, 'local_h'); U.uShA.value = Sh.tex[i]; U.uShB.value = Sh.tex[j]; U.uShMix.value = mix;
  }
  function shadeInfo() { const fr = S.man?.shade?.frames || []; if (!fr.length) return {}; const [i, j, mix] = pick(fr, S.shade.t, 'local_h'), a = fr[i], b = fr[j];
    return { h: S.shade.t, first: fr[0].local_h, last: fr[fr.length - 1].local_h, altitude: a.altitude_deg + (b.altitude_deg - a.altitude_deg) * mix, shaded: a.ground_shaded_fraction, date: S.man.shade.scenario?.date, tz: S.man.shade.scenario?.local_time }; }

  async function loadScalar(key, onProgress = () => {}) {
    const C = S.scalar; if (C.loaded[key]) return; if (C.loading[key]) return C.loading[key];
    C.loading[key] = (async () => { await manifest(); const m = S.man[key]; if (!m) throw new Error(`no ${key} results in this build`); let n = 0; C.tex[key] = [];
      await Promise.all(m.frames.map(async (f, i) => { C.tex[key][i] = await decodeGrey(base + f.file + '?v=' + V); onProgress(++n, m.frames.length); }));
      C.loaded[key] = true; })();
    try { await C.loading[key]; } finally { C.loading[key] = null; }
  }
  function useScalar(key) {   // which scalar map is shown (one at a time); null hides it
    const C = S.scalar; C.key = key; if (!key) { U.uScOn.value = 0; return; }
    const m = S.man[key]; setGrid(U.uScGrid, m.grid); m.display.stops.forEach((c, i) => U.uScStops.value[i].set(c)); U.uScFloor.value = m.display.floor; U.uScAlpha.value = m.display.alpha;
    U.uScOn.value = 1; setScalarTime(C.t);
  }
  function setScalarTime(t) {
    const C = S.scalar; C.t = t; if (!C.key || !C.loaded[C.key]) return; const fr = S.man[C.key].frames, [i, j, mix] = pick(fr, t, 't_s');
    U.uScA.value = C.tex[C.key][i]; U.uScB.value = C.tex[C.key][j]; U.uScMix.value = mix;
  }
  function scalarInfo(key) { const m = S.man?.[key]; if (!m) return {}; const fr = m.frames; return { t: S.scalar.t, end: fr[fr.length - 1].t_s, start: fr[0].t_s, legend: m.display.legend, label: m.label }; }

  return { S, U, manifest, loadShade, setShadeTime, shadeInfo, setShade(on) { S.shade.on = on; U.uShOn.value = on ? 1 : 0; },
    setShadeOpacity(v) { U.uShOn.value = v; }, loadScalar, useScalar, setScalarTime, scalarInfo, setScalarOpacity(v) { U.uScOn.value = v; } };
}
