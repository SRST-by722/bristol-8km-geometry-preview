// Permanent north arrow (task 17).
// The model frame is the EPSG:32630 grid shifted to the AOI centre (x = grid east, y = grid north; viewer world = (x, up, -y)).
// The arrow shows TRUE north. At the AOI centre (lon -2.5972, lat 51.454) true north lies 0.315 deg west of grid north
// (pyproj, EPSG:4326 -> 32630: azimuth of a small step due north, measured from grid north; meridian convergence +0.315 deg).
// Across the 8 km square the difference is 0.27-0.36 deg, far below what the arrow can show, so one value is used.
// Screen direction: the true-north vector on the ground is projected onto the camera's image plane (camera right / up axes).
// This is stable in top views (any rotation) and oblique views. When the view runs almost along the north-south line near the
// horizon, that projection becomes too short; the arrow then uses the perspective projection of a ground point 200 m north of the
// view target (up on screen when looking north, down when looking south) and is dimmed. Only if that is also too short is the last
// angle kept.
import * as THREE from 'three';

export const TRUE_NORTH_FROM_GRID_DEG = -0.315;   // clockwise positive; negative = west of grid north

export function createNorthArrow({ camera, controls, el }) {
  const a = TRUE_NORTH_FROM_GRID_DEG * Math.PI / 180;
  const north = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));   // world: x = east, z = -north
  const right = new THREE.Vector3(), up = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const rot = el.querySelector('.n-rot'), lab = el.querySelector('.n-lab');
  let shown = null, dim = null;
  function update() {
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    let sx = north.dot(right), sy = north.dot(up); const weak = Math.hypot(sx, sy) < 0.15;
    let ok = !weak;
    if (weak && controls) {   // perspective fallback: screen vector from the view target to a ground point 200 m north of it
      p0.copy(controls.target).project(camera); p1.copy(controls.target).addScaledVector(north, 200).project(camera);
      const dx = (p1.x - p0.x) * innerWidth / 2, dy = (p1.y - p0.y) * innerHeight / 2;
      if (p1.z < 1 && Math.hypot(dx, dy) > 2) { sx = dx; sy = dy; ok = true; }
    }
    if (ok) {
      const deg = Math.atan2(sx, sy) * 180 / Math.PI;   // clockwise from screen up
      if (shown === null || Math.abs(((deg - shown + 540) % 360) - 180) > 0.2) {
        shown = deg; rot.setAttribute('transform', `rotate(${deg.toFixed(1)} 28 28)`);
        const r = deg * Math.PI / 180; lab.setAttribute('x', (28 + 19.5 * Math.sin(r)).toFixed(1)); lab.setAttribute('y', (28 - 19.5 * Math.cos(r) + 4).toFixed(1));
        el.dataset.deg = deg.toFixed(1);
      }
    }
    if (weak !== dim) { dim = weak; el.classList.toggle('weak', weak); el.title = weak ? 'North arrow: the view runs along the north-south line near the horizon; direction from perspective' : 'North arrow: true north (0.3° west of the map grid north)'; }
  }
  return { update, angle: () => shown, weak: () => dim };
}
