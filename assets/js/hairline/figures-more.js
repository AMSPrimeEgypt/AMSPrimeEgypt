/**
 * hairline-custom, second set: four more figures (aircraft, fruit crate,
 * grain sacks, vegetable crate) for the Hairline engine by Lucas Marques
 * (MIT, see LICENSE). New code, written for this recipe, on the same pieces
 * as figures-custom.js: the engine's `create` mount wrapper, its camera and
 * solids, its springs, and its shared frame loop and pointer handling.
 *
 * What these add over the first set:
 *  - `drive`: every figure here can be set from outside (a slider, scroll
 *    position, a click) with a number 0..1, instead of, or as well as, the
 *    pointer. `fig.drive(0.6)`, or `fig.update({ drive: 0.6 })`, or the
 *    `drive` option at mount. `null` hands the figure back to the pointer.
 *    The pointer still takes over while it is on the figure; when it leaves,
 *    the figure goes back to the driven value instead of to rest.
 *  - Small sizes: below 300 css px wide, the finest lines are hidden, so a
 *    figure about 150 px tall keeps its shapes instead of turning grey.
 *
 * World units, camera Cam(45, 0.5): x and y on the ground, z up. The viewer
 * sees the +x face (right front), the +y face (left front) and the top.
 * Line strength carries depth: .sil (edge) outlines, plain (mid) parts,
 * .lo fine detail, .hi the one bright thing. Colour only ever comes from
 * the --hairline-* CSS variables, through those classes.
 */
import { core } from "./hairline-core.js";

const {
  create, TABLE, clamp, lerp, rad, r2, poly, seg, open, Cam, proj, unproj, fit, rrect, hull,
  facing, prism, rings, fillet, spring, stepS, reducedMotion, mk, solid, put, register, pointer, disposer,
} = core;

/* Each figure's own number at intensity 0, 0.5 and 1 (the engine reads this table). */
TABLE.aircraft = [8, 16, 26];          // climb: world units the aircraft rises at drive 1
TABLE.fruitcrate = [6, 12, 20];        // lift: world units the top layer of fruit rises at drive 1
TABLE.grainsacks = [0.035, 0.07, 0.11]; // settle: fraction the sack sinks (and widens) at drive 1
TABLE.vegcrate = [12, 24, 36];         // bend: degrees the leafy tops lean at drive 1

/* ---------- small helpers (new; a few repeat figures-custom.js so this file stands alone) ---------- */

/** Toward the viewer for Cam(45, 0.5). */
const V = [Math.SQRT1_2 * Math.sqrt(0.75), Math.SQRT1_2 * Math.sqrt(0.75), 0.5];
const vdot = (p) => p[0] * V[0] + p[1] * V[1] + p[2] * V[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const setD = (el, d) => { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } };
const setC = (el, c) => { if (el.__c !== c) { el.__c = c; el.setAttribute("class", c); } };
const setA = (el, k, v) => { const s = String(v); if (el["__" + k] !== s) { el["__" + k] = s; el.setAttribute(k, s); } };
function part(parent, classes) { const g = mk("g", {}, parent); return { g, p: classes.map((c) => mk("path", { class: c }, g)) }; }
const onX = (P, x) => (u, v) => P(x, u, v);
const onY = (P, y) => (u, v) => P(u, y, v);
const L = (f, u0, v0, u1, v1) => seg(f(u0, v0), f(u1, v1));
const RR = (f, ring) => poly(ring.map((q) => f(q.u, q.v)));
const DOTS = (pts, r) => pts.map(([x, y]) => `M${r2(x - r)} ${r2(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join("");
/** A round thing seen from anywhere is a circle on screen: centre and radius in screen units. */
const disc = (c, r) => `M${r2(c[0] - r)} ${r2(c[1])}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
const P3 = (P, p) => P(p[0], p[1], p[2]);
const hullOf = (P, pts) => poly(hull(pts.map((p) => P3(P, p))));
/** Points of a quadratic curve a-b-c. */
const curve = (a, b, c, n = 8) => Array.from({ length: n + 1 }, (_, k) => {
  const t = k / n, u = 1 - t;
  return [0, 1, 2].map((i) => u * u * a[i] + 2 * u * t * b[i] + t * t * c[i]);
});
/** Rotate p about the unit axis k through o by angle a (Rodrigues). */
function rot(p, o, k, a) {
  const c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  const d = (k[0] * x + k[1] * y + k[2] * z) * (1 - c);
  return [o[0] + x * c + (k[1] * z - k[2] * y) * s + k[0] * d, o[1] + y * c + (k[2] * x - k[0] * z) * s + k[1] * d, o[2] + z * c + (k[0] * y - k[1] * x) * s + k[2] * d];
}
/** Visible runs of a closed list of screen points, given which points are seen. */
function vrun(pts, vis, closed = true) {
  const n = pts.length;
  let s = closed ? vis.findIndex((v, i) => v && !vis[(i + n - 1) % n]) : 0;
  if (s < 0) return vis[0] ? poly(pts) : "";
  let d = "", cur = [];
  for (let k = 0; k < n; k++) {
    const i = (s + k) % n;
    if (vis[i]) cur.push(pts[i]); else if (cur.length) { d += open(cur); cur = []; }
  }
  return d + open(cur);
}

/**
 * A flat slab from a counter-clockwise outline `pts` in (u, v), between
 * t0 and t1 along its thickness; map(u, v, t) gives the world point. Returns
 * the silhouette and the crease: the edges of the t1 face whose side faces
 * the viewer, decided by seen(nu, nv) on the edge's outward normal.
 */
function slab(P, pts, map, t0, t1, seen) {
  const top = pts.map((p) => P3(P, map(p[0], p[1], t1))), bot = pts.map((p) => P3(P, map(p[0], p[1], t0)));
  const n = pts.length, vis = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], du = b[0] - a[0], dv = b[1] - a[1];
    vis.push(du || dv ? seen(dv, -du) : null);
  }
  // a point is on the crease if the edge leaving it, or (for repeated points) the next real edge, is seen
  for (let i = 0; i < n; i++) if (vis[i] === null) { let j = i; while (vis[j % n] === null && j < i + n) j++; vis[i] = vis[j % n]; }
  let d = "", cur = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    if (k < n && vis[i]) { if (!cur.length) cur.push(top[i]); cur.push(top[(i + 1) % n]); } else if (cur.length) { d += open(cur); cur = []; }
  }
  return { sil: poly(hull(top.concat(bot))), crease: d };
}

/** The plinth every figure stands on: a rounded slab, as in the originals. */
function plinth(g, P, front, x0, y0, x1, y1, t = 4, r = 8) {
  const [pr, pi] = rings(x0, y0, x1, y1, r, 2);
  put(solid(g), prism(P, front, pr, pi, -t, 0));
}

/** Below `px` css px wide, hide the finest lines, so a small figure keeps its shapes instead of turning grey. */
function lod(stage, bag, els, px = 300) {
  let shown = null;
  const apply = (w) => { const on = !(w > 0 && w < px); if (on !== shown) { shown = on; for (const e of els) e.style.display = on ? "" : "none"; } };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver((es) => apply(es[0].contentRect.width));
    ro.observe(stage); bag.add(() => ro.disconnect());
  }
  apply(stage.getBoundingClientRect().width);
}

/**
 * A leaf blade as 3D points: an outline and a midrib. b base, d unit
 * direction, s unit side, len, half-width w; droop lowers the tip; serr
 * notches the edge (feathery tops).
 */
function blade(b, d, s, len, w, droop = 0, serr = 0, n = 10) {
  const lf = [], rt = [], rib = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, c = [b[0] + d[0] * len * t, b[1] + d[1] * len * t, b[2] + d[2] * len * t - droop * t * t];
    let ww = w * Math.pow(Math.sin(Math.PI * t), 0.75) * (1.15 - 0.3 * t);
    if (serr && k > 0 && k < n) ww *= k % 2 ? 1 + serr : 1 - serr;
    lf.push(add(c, s, ww)); rt.push(add(c, s, -ww)); rib.push(c);
  }
  return { out: lf.concat(rt.reverse()), rib };
}

const toDrive = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : clamp(+v, 0, 1));

/**
 * The public shape: the library's own handle ({ update, destroy }) plus
 * drive(v). `drive` is also read from the mount options and from update().
 */
function figure(id, label, engine) {
  return (el, options = {}) => {
    let eng = null;
    const h = create({ id, label, rest: "rest", engine: (ctx, v) => (eng = engine(ctx, v, toDrive(options.drive))) }, el, options);
    const drive = (v) => { if (eng) eng.drive(toDrive(v)); };
    return { update(next) { h.update(next); if (next && "drive" in next) drive(next.drive); }, drive, destroy: h.destroy };
  };
}

/* ======================================================================
 * 1. Aircraft: a twin turboprop freighter (high wing, T-tail, cargo door
 * forward on the left side, a row of small windows) parked on a round
 * apron. Drive / pointer: it lifts into a gentle climb. The nose comes up,
 * the props spool up and turn, the gear folds forward into the nacelles
 * and nose, and its shadow stays on the apron. The higher the pointer, the
 * steeper the climb. At rest the cargo door is the bright place.
 * Intensity: how high it climbs.
 * ==================================================================== */

const AC = { R: 8.6, ZC: 17, PIV: 75, YN: 24, ZN: 21.4, XP: 93.4, RP: 10.4, WZ: 25.2, WT: 2.3 };
/** Stations along the fuselage where its section is sampled. */
const FX = [0, 2.5, 6, 11, 17, 24, 32, 41, 50, 128, 133, 137.5, 141.5, 145, 147.5, 149.2, 150];
/** The fuselage at x: [radius, rise of its centre]. The tail cone sweeps up, the nose is half an ellipsoid. */
function fsec(x) {
  if (x < 50) { const t = x / 50; return [2 + (AC.R - 2) * (1 - (1 - t) ** 2.2), 6.4 * (1 - t) ** 1.6]; }
  if (x <= 128) return [AC.R, 0];
  const t = Math.min(1, (x - 128) / 22);
  return [AC.R * Math.sqrt(1 - t * t), -1.4 * t];
}
/** A point on the fuselage skin: station x, angle a round the axis (0 = left side, 90° = top). */
const fpt = (x, a) => { const [r, zc] = fsec(x); return [x, r * Math.cos(a), AC.ZC + zc + r * Math.sin(a)]; };
const A24 = Array.from({ length: 20 }, (_, k) => (k / 20) * Math.PI * 2);
const SPAN = 66;
const WING = fillet([[77, -SPAN], [80.5, 0], [77, SPAN], [69.5, SPAN], [62, 0], [69.5, -SPAN]], [2.6, 0, 2.6, 2.6, 0, 2.6], 3);
const STAB = fillet([[18.5, -18], [22, 0], [18.5, 18], [12, 18], [9.5, 0], [12, -18]], [1.6, 0, 1.6, 1.6, 0, 1.6], 3);
const FIN = [[2, 25.9], [41, 25.9], [23.5, 50], [10.5, 50]];
/** Nacelle stations: x, half width, depth below its axis, height above it. */
const NAC = [[57, 1.5, 1.6, 2.6], [64, 3.2, 4.4, 3.8], [86, 3.6, 5, 3.8], [92, 3.0, 3.6, 3.0]];
const WINX = [44, 50, 56, 62, 68, 74, 80, 86, 92, 98, 104];
const xTE = (y) => 62 + (7.5 * Math.abs(y)) / SPAN;

const aircraftEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let climb = value, base = drive0 ?? 0, over = null;
  const C = Cam(45, 0.5, 2.02);
  /** The aircraft's pose as a world transform: pitch about the main gear, then lift. */
  const posew = (lift, pitch) => {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    return (x, y, z) => [AC.PIV + (x - AC.PIV) * c - z * s, y, (x - AC.PIV) * s + z * c + lift];
  };
  const RA = 70, AX = 79, apron = rrect(AX - RA, -RA, AX + RA, RA, RA, 16), apronIn = rrect(AX + 2 - RA, 2 - RA, AX - 2 + RA, RA - 2, RA - 2, 16);
  const ext = [];
  for (const q of apron) ext.push([q.u, q.v, -4], [q.u, q.v, 0]);
  const keys = [[0, 0, 26], [150, 0, 17], [76, -SPAN, 27.5], [76, SPAN, 27.5], [10, 0, 51.5], [23, 0, 51.5], [93, -24, 32], [93, 24, 32], [93, 24, 10]];
  for (const [l, a] of [[0, 0], [TABLE.aircraft[2], rad(6.5)]]) { const w = posew(l, a); for (const k of keys) ext.push(w(...k)); }
  fit(C, ext, 200, 160);
  const P0 = proj(C), front = facing(C);
  const posed = (lift, pitch) => { const w = posew(lift, pitch); return (x, y, z) => P0(...w(x, y, z)); };

  const g = mk("g", {}, svg), fine = [];
  // the apron: a round plate, a dashed centre line, and the shadow, which shows once the aircraft is off the ground
  put(solid(g), prism(P0, front, apron, apronIn, -4, 0));
  const dash = [];
  for (let x = 13; x < 142; x += 11) dash.push(seg(P0(x, 0, 0), P0(x + 6, 0, 0)));
  mk("path", { class: "nf lo", d: dash.join("") }, g);
  const shadow = mk("path", { class: "nf lo dash", opacity: 0 }, g);
  {
    // the footprint: the fuselage's plan with the wing across it, as one outline
    const side = FX.map((x) => [x, fsec(x)[0]]);
    const pts = [];
    pts.push(...side.filter((p) => p[0] >= 80.5).reverse());
    pts.push([80.5, AC.R], [77, SPAN], [69.5, SPAN], [xTE(AC.R), AC.R]);
    pts.push(...side.filter((p) => p[0] < 62.6).reverse());
    pts.push(...side.filter((p) => p[0] < 62.6).map(([x, w]) => [x, -w]));
    pts.push([xTE(AC.R), -AC.R], [69.5, -SPAN], [77, -SPAN], [80.5, -AC.R]);
    pts.push(...side.filter((p) => p[0] >= 80.5).map(([x, w]) => [x, -w]));
    shadow.setAttribute("d", poly(pts.map(([x, y]) => P0(x, y, 0))));
  }

  // painted back to front
  const gearFar = part(g, ["sil", "", "sil"]);
  const gearNose = part(g, ["sil", "", "sil"]);
  const nacFar = part(g, ["sil"]);
  const propFar = part(g, ["nf lo", "", "sil"]);
  const fus = part(g, ["sil", "nf", "nf", "nf lo", "dot m"]);
  fine.push(fus.p[3]);
  const gearNear = part(g, ["sil", "", "sil", "nf lo"]);
  const nacNear = part(g, ["sil", "nf lo"]);
  fine.push(nacNear.p[1]);
  const wing = part(g, ["sil", "nf lo", "nf lo"]);
  fine.push(wing.p[2]);
  const fin = part(g, ["sil", "nf lo", "nf lo"]);
  fine.push(fin.p[2]);
  const stab = part(g, ["sil", "nf lo"]);
  const propNear = part(g, ["nf lo", "", "sil"]);
  const door = fus.p[2];
  lod(stage, bag, fine);

  const lift = spring(0, { k: 20, c: 8.5, eps: 0.02 }), pitch = spring(0, { k: 34, c: 10, eps: 0.0004 }), spin = spring(0, { k: 8, c: 5.8, eps: 0.004 });
  let ang = 0.35, poseKey = "", propKey = "";

  function tyre(P, cx, cz, y0, y1, r) {
    const pts = [];
    for (const y of [y0, y1]) for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; pts.push(P(cx + r * Math.cos(a), y, cz + r * Math.sin(a))); }
    return poly(hull(pts));
  }
  /** A gear leg from a pivot, folded forward by angle ga, with two wheels on its axle. */
  function gear(P, prt, px, py, pz, len, r, w, gap, ga, near) {
    const ax = px + len * Math.sin(ga), az = pz - len * Math.cos(ga);
    setD(prt.p[0], tyre(P, ax, az, py - gap / 2 - w, py - gap / 2, r));
    setD(prt.p[1], poly(hull([P(px, py - 0.5, pz), P(px, py + 0.5, pz), P(ax, py - 0.5, az), P(ax, py + 0.5, az)])));
    setD(prt.p[2], tyre(P, ax, az, py + gap / 2, py + gap / 2 + w, r));
    if (near) {
      const yf = py + gap / 2 + w, hub = [];
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; hub.push(P(ax + r * 0.45 * Math.cos(a), yf, az + r * 0.45 * Math.sin(a))); }
      setD(prt.p[3], poly(hub));
    }
  }
  function nacelle(P, yc) {
    const pts = [];
    for (const [x, hw, dn, up] of NAC) for (const q of rrect(-hw, -dn, hw, up, Math.min(hw, dn, up) * 0.9, 3)) pts.push(P(x, yc + q.u, AC.ZN + q.v));
    return poly(hull(pts));
  }
  function prop(P, prt, yc, a, s) {
    const zc = AC.ZN - 0.2, at = (rho, tau, phi) => P(AC.XP, yc + rho * Math.cos(phi) - tau * Math.sin(phi), zc + rho * Math.sin(phi) + tau * Math.cos(phi));
    const ring = [];
    for (let k = 0; k < 40; k++) ring.push(at(AC.RP, 0, (k / 40) * Math.PI * 2));
    setD(prt.p[0], poly(ring));
    setA(prt.p[0], "opacity", r2(smooth(0.15, 1.4, s)));
    const RHO = [2, 4, 6, 8, 9.7], W = [1.1, 1.65, 1.5, 1.2, 0.85], bl = [];
    for (let i = 0; i < 4; i++) {
      const phi = a + (i * Math.PI) / 2;
      bl.push(poly([...RHO.map((r, k) => at(r, W[k] * 0.55, phi)), at(AC.RP + 0.2, 0, phi), ...RHO.map((r, k) => at(r, -W[k] * 0.45, phi)).reverse()]));
    }
    setD(prt.p[1], bl.join(""));
    const sp = [P(97.6, yc, zc)];
    for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; sp.push(P(92.4, yc + 2.1 * Math.cos(t), zc + 2.1 * Math.sin(t))); }
    setD(prt.p[2], poly(hull(sp)));
  }
  /** The skin between stations x0..x1 and angles a0..a1, as an outline (a window pane). */
  const pane = (P, x0, x1, a0, a1) => {
    const pts = [], n = 4;
    for (let k = 0; k <= n; k++) pts.push(fpt(lerp(x0, x1, k / n), a0));
    for (let k = 0; k <= n; k++) pts.push(fpt(x1, lerp(a0, a1, k / n)));
    for (let k = 0; k <= n; k++) pts.push(fpt(lerp(x1, x0, k / n), a1));
    for (let k = 0; k <= n; k++) pts.push(fpt(x0, lerp(a1, a0, k / n)));
    return poly(pts.map((p) => P3(P, p)));
  };

  function drawBody(P, lf) {
    // gear: folds forward once airborne, and fades as it goes into its bay
    const gu = smooth(1.5, 7, lf), ga = gu * rad(98), op = r2(1 - smooth(0.7, 1, gu));
    // once it is fully in its bay, the gear is hidden and not recomputed
    if (op > 0) {
      gear(P, gearFar, AC.PIV, -AC.YN, 19, 15.4, 3.6, 2.0, 1.4, ga, false);
      gear(P, gearNose, 133, 0, 11, 8.4, 2.6, 1.5, 0.9, ga, false);
      gear(P, gearNear, AC.PIV, AC.YN, 19, 15.4, 3.6, 2.0, 1.4, ga, true);
    }
    for (const q of [gearFar, gearNose, gearNear]) setA(q.g, "opacity", op);
    setD(nacFar.p[0], nacelle(P, -AC.YN));

    // fuselage: hull of its sections; windows, the cargo door and the cockpit on the skin
    const fp = [];
    for (const x of FX) for (const a of A24) fp.push(P3(P, fpt(x, a)));
    setD(fus.p[0], poly(hull(fp)));
    const R = AC.R, onF = (u, v) => P3(P, fpt(u, v / R)), s0 = R * rad(14);
    setD(fus.p[1], WINX.map((x) => RR(onF, rrect(x - 1.05, s0 - 1.35, x + 1.05, s0 + 1.35, 0.9, 2))).join("")
      + pane(P, 137, 141.4, rad(38), rad(86)) + pane(P, 137, 141.4, rad(94), rad(142)) + pane(P, 132, 136.4, rad(22), rad(42)));
    setD(door, RR(onF, rrect(109.5, R * rad(-24), 123.5, R * rad(40), 1.4, 3)));
    const seam = [];
    for (let k = 0; k <= 18; k++) seam.push(P3(P, fpt(146.4, rad(-50 + 200 * k / 18))));
    setD(fus.p[3], open(seam));
    setD(fus.p[4], DOTS([onF(121.4, R * rad(4))], 0.5));

    setD(nacNear.p[0], nacelle(P, AC.YN));
    const cowl = [];
    for (let k = 0; k <= 12; k++) { const t = rad(-110 + 200 * k / 12); cowl.push(P(88, AC.YN + 3.62 * Math.cos(t), AC.ZN + (Math.sin(t) > 0 ? 3.8 : 5) * Math.sin(t))); }
    setD(nacNear.p[1], open(cowl));

    // wing: a slab across the fuselage top; its near edge as a crease, flaps and ailerons on its top
    const w = slab(P, WING, (u, v, t) => [u, v, t], AC.WZ, AC.WZ + AC.WT, (nx, ny) => nx * V[0] + ny * V[1] > 0);
    setD(wing.p[0], w.sil); setD(wing.p[1], w.crease);
    const zt = AC.WZ + AC.WT, fl = [];
    for (const sd of [-1, 1]) {
      fl.push(seg(P(xTE(9.5) + 3.4, sd * 9.5, zt), P(xTE(45) + 3.4, sd * 45, zt)), seg(P(xTE(46) + 3, sd * 46, zt), P(xTE(63) + 3, sd * 63, zt)));
      fl.push(seg(P(xTE(45.5), sd * 45.5, zt), P(xTE(45.5) + 3.4, sd * 45.5, zt)));
    }
    setD(wing.p[2], fl.join(""));

    // T-tail: fin, its rudder line, the tailplane on top
    const f = slab(P, FIN, (u, v, t) => [u, t, v], -0.9, 0.9, (nu, nv) => nu * V[0] + nv * V[2] > 0);
    setD(fin.p[0], f.sil); setD(fin.p[1], f.crease);
    setD(fin.p[2], seg(P(9.6, 0.9, 26.6), P(15.4, 0.9, 49.4)));
    const st = slab(P, STAB, (u, v, t) => [u, v, t], 50, 51.2, (nx, ny) => nx * V[0] + ny * V[1] > 0);
    setD(stab.p[0], st.sil); setD(stab.p[1], st.crease);
  }

  function draw() {
    const P = posed(lift.x, pitch.x), pk = (Math.round(lift.x * 20) / 20) + "," + pitch.x.toFixed(4);
    if (pk !== poseKey) { poseKey = pk; drawBody(P, lift.x); setA(shadow, "opacity", r2(smooth(1.2, 9, lift.x))); }
    const qk = pk + "," + ang.toFixed(3) + "," + spin.x.toFixed(2);
    if (qk !== propKey) { propKey = qk; prop(P, propFar, -AC.YN, ang + 0.4, spin.x); prop(P, propNear, AC.YN, ang, spin.x); }
    const d = over ?? base, eng = spin.x > 0.05 || d > 0.02;
    setC(door, eng ? "nf" : "nf hi");
    setC(propNear.p[0], eng ? "nf hi" : "nf lo");
    const deg = (pitch.x * 180) / Math.PI, gu = smooth(1.5, 7, lift.x);
    read.textContent = lift.x < 0.05 && !eng ? "parked"
      : `climb ${deg.toFixed(1)}° · +${(lift.x * 0.18).toFixed(1)} m · gear ${gu > 0.97 ? "up" : gu < 0.03 ? "down" : "moving"}`;
  }

  const B = register(stage, (dt) => {
    let m = false;
    for (const s of [lift, pitch, spin]) if (stepS(s, dt)) m = true;
    if (spin.x > 0.002 && !reducedMotion()) { ang = (ang + spin.x * dt * Math.PI * 2) % (Math.PI * 2); m = true; }
    draw();
    return m;
  });
  bag.add(B.unregister);
  function aim() {
    const d = over ?? base;
    lift.t = climb * d; pitch.t = rad(6.5) * d; spin.t = d > 0.02 ? 0.7 + 1.5 * d : 0;
    B.wake();
  }
  // the pointer's height sets the climb: low on the figure a little, high up all of it
  bag.add(pointer(stage, {
    move: (p) => { over = clamp(0.25 + (250 - p[1]) / 180, 0.25, 1); aim(); },
    leave: () => { over = null; aim(); },
  }));
  aim();
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { climb = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* ======================================================================
 * Open crates (fruit, vegetables): the walls behind are drawn first, the
 * contents next, the two near walls last, so the near walls cover what is
 * below their rim and nothing else.
 * ==================================================================== */

function crateBack(g, P, front, X, Y, Z, T) {
  const [o] = rings(0, 0, X, Y, 1, 0.5);
  mk("path", { class: "sil", d: prism(P, front, o, null, 0, Z).sil }, g);
  // the opening, filled, so the outsides of the far walls never show through
  mk("path", { d: poly([P(T, T, Z), P(X - T, T, Z), P(X - T, Y - T, Z), P(T, Y - T, Z)]) }, g);
  mk("path", { class: "nf lo", d: seg(P(T, T, Z), P(T, T, Z - 7)) }, g);
}
/** The two near walls; the long one has board joints, the end has a hand hole. */
function crateFront(g, P, front, X, Y, Z, T, fine, seams = 2) {
  for (const [x0, y0, x1, y1] of [[0, Y - T, X, Y], [X - T, 0, X, Y]]) {
    const [a, b] = rings(x0, y0, x1, y1, 0.6, 0.35);
    put(solid(g), prism(P, front, a, b, 0, Z));
  }
  const fy = onY(P, Y), fx = onX(P, X), j = [];
  for (let k = 1; k <= seams; k++) j.push(L(fy, 0.8, (Z * k) / (seams + 1), X - T - 0.2, (Z * k) / (seams + 1)));
  mk("path", { class: "nf lo", d: j.join("") }, g);
  mk("path", { class: "nf", d: RR(fx, rrect(Y / 2 - 6, Z - 7.4, Y / 2 + 6, Z - 3.6, 1.8, 3)) }, g);
  fine.push(mk("path", { class: "nf lo", d: L(fy, 3.2, 0.8, 3.2, Z - 0.8) + L(fy, X - T - 3.2, 0.8, X - T - 3.2, Z - 0.8) }, g));
}

/* ======================================================================
 * 2. Fruit crate: an open timber crate heaped with apples (a lower layer
 * at the rim, a mound of seven on it and two on top) and three leaves.
 * Drive / pointer: the top layer lifts out, each apple on its own spring,
 * so they rise with a small stagger and the layer under them shows. The
 * higher the pointer, the higher it lifts. At rest the top apple is the
 * bright place. Intensity: how high the layer lifts.
 * ==================================================================== */

const FC = { X: 64, Y: 46, Z: 26, T: 2.4 };
const FRUIT = (() => {
  const out = [], rows = [8.2, 17.9, 27.6, 37.3];
  rows.forEach((y, i) => (i % 2 ? [13.8, 25, 36.2, 47.4] : [8.2, 19.4, 30.6, 41.8, 53]).forEach((x) => out.push({ x, y, z: 23, top: false })));
  for (const [x, y] of [[25, 11.4], [36.2, 11.4], [19.4, 21.1], [30.6, 21.1], [41.8, 21.1], [25, 30.8], [36.2, 30.8], [47.4, 11.4], [13.8, 30.8]]) out.push({ x, y, z: 32.1, top: true });
  for (const [x, y] of [[30.6, 14.6], [30.6, 27.6]]) out.push({ x, y, z: 41.2, top: true });
  return out.map((f, i) => ({
    ...f, x: f.x + (rnd(i * 3 + 1) - 0.5) * 1.1, y: f.y + (rnd(i * 5 + 2) - 0.5) * 1.1, z: f.z + (rnd(i * 7 + 3) - 0.5) * 0.8,
    r: 5.25 + rnd(i * 11 + 4) * 0.6, pole: norm([(rnd(i * 13 + 5) - 0.5) * 0.9, (rnd(i * 17 + 6) - 0.5) * 0.9, 1]),
  }));
})();
const FLEAF = [{ on: 27, d: [0.8, 0.45, -0.38], len: 10, w: 2.9 }, { on: 28, d: [-0.45, 0.85, -0.3], len: 9, w: 2.6 }, { on: 22, d: [0.85, -0.4, -0.35], len: 9.5, w: 2.7 }];

const fruitEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let gap = value, base = drive0 ?? 0, over = null;
  const { X, Y, Z, T } = FC;
  const C = Cam(45, 0.5, 2.6);
  fit(C, [[-12, -12, -4], [76, -12, -4], [-12, 58, -4], [76, 58, -4], [30, 21, 48 + TABLE.fruitcrate[2]]], 200, 164);
  const P = proj(C), front = facing(C), S = C.S;
  const g = mk("g", {}, svg), fine = [];
  plinth(g, P, front, -12, -12, 76, 58, 4, 9);
  crateBack(g, P, front, X, Y, Z, T);
  const layer = mk("g", {}, g);
  crateFront(g, P, front, X, Y, Z, T, fine, 2);
  lod(stage, bag, fine);

  const items = FRUIT.map((f, i) => {
    const it = { f, i, g: mk("g", {}, layer), sp: f.top ? spring(0, { k: 70 + rnd(i * 19) * 60, c: 12 + rnd(i * 23) * 4, eps: 0.01 }) : null };
    it.g.__n = i;
    it.o = mk("path", { class: f.top ? "sil" : "" }, it.g);
    it.st = mk("path", { class: "nf" }, it.g);
    if (f.top) { it.dim = mk("path", { class: "nf lo" }, it.g); fine.push(it.dim); }
    // the dimple round the stem: a small ring on the skin, its near half
    const e1 = norm(cross(f.pole, [1, 0, 0])), e2 = cross(f.pole, e1);
    it.ring = Array.from({ length: 13 }, (_, k) => { const t = (k / 12) * Math.PI * 2; return add(add([0, 0, 0], e1, Math.cos(t)), e2, Math.sin(t)); });
    return it;
  });
  const hot = items[27];
  const leaves = FLEAF.map((lf, i) => {
    const it = { lf, g: mk("g", {}, layer), par: items[lf.on] };
    it.g.__n = 100 + i;
    it.o = mk("path", {}, it.g); it.rib = mk("path", { class: "nf lo" }, it.g);
    fine.push(it.rib);
    return it;
  });
  const zOf = (it) => it.f.z + (it.sp ? it.sp.x : 0);
  const stemOf = (it) => { const f = it.f, c = [f.x, f.y, zOf(it)]; return [add(c, f.pole, f.r * 0.86), add(c, add(f.pole, [0.12, 0.05, 0], 1), f.r + 2.3)]; };
  let order = "";

  function draw() {
    const dep = [];
    for (const it of items) {
      const f = it.f, c = [f.x, f.y, zOf(it)], up = vdot(f.pole) > 0.05;
      setD(it.o, disc(P3(P, c), f.r * S));
      const [a, b] = stemOf(it);
      setD(it.st, up ? seg(P3(P, a), P3(P, b)) : "");
      if (it.dim) {
        const pc = add(c, f.pole, f.r * 0.93), pts = [], vis = [];
        for (const q of it.ring) { pts.push(P3(P, add(pc, q, f.r * 0.36))); vis.push(vdot(q) > 0.15); }
        setD(it.dim, up ? vrun(pts.slice(0, 12), vis.slice(0, 12)) : "");
      }
      dep.push([vdot(c), it.g]);
    }
    for (const it of leaves) {
      const [, tip] = stemOf(it.par), lf = it.lf, d = norm(lf.d), s = norm(cross(d, [0, 0, 1]));
      const bl = blade(tip, d, s, lf.len, lf.w, 1.6);
      setD(it.o, poly(bl.out.map((p) => P3(P, p)))); setD(it.rib, open(bl.rib.map((p) => P3(P, p))));
      dep.push([Math.max(...bl.out.map(vdot)), it.g]);
    }
    dep.sort((a, b) => a[0] - b[0]);
    const key = dep.map((q) => q[1].__n).join();
    if (key !== order) { order = key; for (const [, el] of dep) layer.appendChild(el); }
  }
  const B = register(stage, (dt) => {
    let m = false;
    for (const it of items) if (it.sp && stepS(it.sp, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);
  function aim() {
    const d = over ?? base;
    for (const it of items) if (it.sp) it.sp.t = gap * d * (1 + (it.f.z > 40 ? 0.08 : 0));
    setC(hot.o, "hi");
    read.textContent = d < 0.01 ? "rest" : `top layer · 11 apples · +${Math.round(gap * d * 0.78)} cm`;
    B.wake();
  }
  const yRim = P(X / 2, Y / 2, Z)[1];
  bag.add(pointer(stage, {
    move: (p) => { over = clamp(0.35 + (yRim - p[1]) / 110, 0.35, 1); aim(); },
    leave: () => { over = null; aim(); },
  }));
  aim();
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { gap = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* ======================================================================
 * 3. Grain sacks: a tall jute sack, gathered and tied at the neck with an
 * ear of wheat tucked under the cord, and a second, sewn sack leaning on
 * it. Drive / pointer: the sack settles, sinking a little and widening at
 * the belly, with a small bounce; the leaning sack leans further and the
 * wheat sways. The lower the pointer runs down the sack, the more it
 * presses. At rest the ear of wheat is the bright place.
 * Intensity: how far it settles.
 * ==================================================================== */

const GS1 = [[0, 10.5, 8.6], [2.6, 13.4, 11], [9, 14.8, 12.2], [20, 15.2, 12.6], [33, 14.4, 11.8], [41, 12.2, 10], [47, 8.4, 7.2], [51, 4.6, 4.2], [53, 3.0, 2.8]];
const GT1 = [[53, 2.9, 2.7], [55.4, 4.2, 3.8], [59.5, 6.4, 5.4]];
const GS2 = [[0, 9.6, 7.8], [2.4, 12, 9.8], [8, 13, 10.6], [18, 13.2, 10.8], [30, 12.6, 10.2], [37, 12.3, 7.6], [41, 12, 3.6], [42.4, 11.6, 1.2]];
const se = (c, m) => Math.sign(c) * Math.abs(c) ** (2 / m);

/** A soft bag: rounded sections (superellipses) stacked in z, turned by yaw, and leaned over toward lean = [ux, uy]. */
function sack(secs, m, cx, cy, yaw, lean = [1, 0]) {
  const radAt = (z) => {
    if (z <= secs[0][0]) return [secs[0][1], secs[0][2]];
    for (let i = 1; i < secs.length; i++) if (z <= secs[i][0]) { const [z0, a0, b0] = secs[i - 1], [z1, a1, b1] = secs[i], t = (z - z0) / (z1 - z0); return [lerp(a0, a1, t), lerp(b0, b1, t)]; }
    const l = secs[secs.length - 1]; return [l[1], l[2]];
  };
  const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), ax = [-lean[1], lean[0], 0], O = [0, 0, 0];
  /** k: settle state { s, lean (an angle) }. Returns the world point and whether that bit of skin faces the viewer. */
  const at = (th, z, k, out = 0, needSeen = true) => {
    const zs = z * (1 - k.s), bulge = k.s ? 1 + k.s * 1.15 * Math.sin(Math.PI * clamp(z / 46, 0, 1)) ** 0.7 : 1;
    const [rx, ry] = radAt(z), c = Math.cos(th), s = Math.sin(th);
    const lx = (rx * bulge + out) * se(c, m), ly = (ry * bulge + out) * se(s, m), q0 = [lx * cy0 - ly * sy0, lx * sy0 + ly * cy0, zs];
    const q = k.lean ? rot(q0, O, ax, k.lean) : q0;
    if (!needSeen) return { p: [cx + q[0], cy + q[1], q[2]] };
    // the skin's normal: across from the section, up or down from how the section changes with z
    const nlx = Math.sign(c) * Math.abs(c) ** (2 - 2 / m) / rx, nly = Math.sign(s) * Math.abs(s) ** (2 - 2 / m) / ry;
    const nx = nlx * cy0 - nly * sy0, ny = nlx * sy0 + nly * cy0, h = Math.hypot(nx, ny) || 1;
    const dr = (radAt(z + 0.6)[0] - radAt(z - 0.6)[0]) / 1.2;
    const nv = [nx / h, ny / h, -dr];
    return { p: [cx + q[0], cy + q[1], q[2]], seen: vdot(k.lean ? rot(nv, O, ax, k.lean) : nv) > 0 };
  };
  return { radAt, at, secs };
}
/** The hull of a sack's sections, from z0 to z1. */
function sackSil(P, sk, k, z0, z1, n = 24) {
  const pts = [];
  for (const [z] of sk.secs) if (z >= z0 && z <= z1) for (let i = 0; i < n; i++) pts.push(P3(P, sk.at((i / n) * Math.PI * 2, z, k, 0, false).p));
  return poly(hull(pts));
}
/** A line round the sack at height z, only where it faces the viewer. */
function sackRing(P, sk, k, z, out = 0, n = 32) {
  const pts = [], vis = [];
  for (let i = 0; i < n; i++) { const q = sk.at((i / n) * Math.PI * 2, z, k, out); pts.push(P3(P, q.p)); vis.push(q.seen); }
  return vrun(pts, vis);
}
/** A line on the skin from (th0, z0) to (th1, z1), only where it faces the viewer. */
function sackLine(P, sk, k, th0, z0, th1, z1, n = 10, out = 0) {
  const pts = [], vis = [];
  for (let i = 0; i <= n; i++) { const q = sk.at(lerp(th0, th1, i / n), lerp(z0, z1, i / n), k, out); pts.push(P3(P, q.p)); vis.push(q.seen); }
  return vrun(pts, vis, false);
}

const grainEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let settle = value, base = drive0 ?? 0, over = null;
  const C = Cam(45, 0.5, 2.6);
  // the second sack stands behind and to the right, its broad face toward the first, and leans on it
  const u2 = norm([-13.7, 26.5, 0]);
  const s1 = sack(GS1, 2.8, 0, 0, rad(-6)), t1 = sack(GT1, 2.2, 0, 0, rad(-6)), s2 = sack(GS2, 2.6, 13.7, -26.5, Math.atan2(-u2[0], u2[1]), u2);
  fit(C, [[-26, -44, -4], [38, -44, -4], [-26, 30, -4], [38, 30, -4], [0, 0, 62], [-8, 18, 76]], 200, 162);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg), fine = [];
  plinth(g, P, front, -26, -44, 38, 30, 4, 9);
  // a few spilled grains in front
  fine.push(mk("path", { class: "dot m", d: DOTS([[17, 17], [20, 13.5], [13.5, 20.5], [22.5, 19], [10, 23]].map(([x, y]) => P(x, y, 0)), 0.55) }, g));

  const sack2 = part(g, ["sil", "nf lo", "nf lo"]);
  fine.push(sack2.p[2]);
  const body = part(g, ["sil", "nf lo", "nf lo", "nf lo", "nf lo", "nf lo"]);
  fine.push(body.p[4], body.p[5]);
  const tuft = part(g, ["sil", "nf", "nf lo"]);
  const cord = part(g, ["nf", "dot m"]);
  const wheat = part(g, ["sil", "", "nf lo", ""]);
  lod(stage, bag, fine);

  const sp = spring(0, { k: 70, c: 7.5, eps: 0.0004 }), sway = spring(0, { k: 26, c: 4.5, eps: 0.002 });
  const TH = rad(80); // where the wheat is tucked: on the left front
  let key = "", bodyKey = "", s2Key = null;

  function draw() {
    const s = Math.max(0, sp.x), k1 = { s, lean: 0 }, kt = { s: 0, lean: 0 }, k2 = { s: 0, lean: rad(15) + (s / TABLE.grainsacks[2]) * rad(2.5) };
    const bk = s.toFixed(4), wk = bk + "," + sway.x.toFixed(4);
    if (wk === key) return;
    key = wk;
    const dz = 53 * s, Pt = (x, y, z) => P(x, y, z - dz), ck = { s: 0, lean: 0 };
    // the sacks only change when the settle does; a swing of the wheat alone redraws only the wheat
    if (bk !== bodyKey) { bodyKey = bk; drawSacks(s, k1, kt, k2, dz, Pt, ck); }
    drawWheat(s, k1, dz, ck);
  }
  function drawSacks(s, k1, kt, k2, dz, Pt, ck) {
    // the main sack
    setD(body.p[0], sackSil(P, s1, k1, 0, 53));
    setD(body.p[1], sackRing(P, s1, k1, 37.2) + sackRing(P, s1, k1, 38.9));
    setD(body.p[2], sackLine(P, s1, k1, rad(-6), 4, rad(-6), 45, 12));
    const st = [];
    for (const [th, dth] of [[rad(8), rad(-4)], [rad(30), rad(2)], [rad(52), rad(-3)], [rad(100), rad(4)], [rad(122), rad(-2)]]) st.push(sackLine(P, s1, k1, th, 51.6, th + dth, 44.5, 6));
    setD(body.p[3], st.join(""));
    // the printed panel: a frame and two lines of lettering, on the front
    const fr = [sackLine(P, s1, k1, rad(22), 17, rad(66), 17, 8), sackLine(P, s1, k1, rad(66), 17, rad(66), 29, 4), sackLine(P, s1, k1, rad(66), 29, rad(22), 29, 8), sackLine(P, s1, k1, rad(22), 29, rad(22), 17, 4)];
    setD(body.p[4], fr.join(""));
    setD(body.p[5], sackLine(P, s1, k1, rad(28), 25.4, rad(60), 25.4, 6) + sackLine(P, s1, k1, rad(28), 21.6, rad(52), 21.6, 6) + sackRing(P, s1, k1, 2.7));
    // the gathered top above the cord, its ruffled mouth
    setD(tuft.p[0], sackSil(Pt, t1, kt, 53, 59.5));
    const mouth = [];
    for (let i = 0; i < 36; i++) { const q = t1.at((i / 36) * Math.PI * 2, 59.5, kt, i % 2 ? -0.5 : 0.3); mouth.push(Pt(q.p[0], q.p[1], q.p[2] - (i % 2 ? 0.9 : 0))); }
    setD(tuft.p[1], poly(mouth));
    setD(tuft.p[2], [rad(20), rad(60), rad(105)].map((th) => sackLine(Pt, t1, kt, th, 53.6, th + rad(6), 58.6, 4)).join(""));
    // the cord: two turns round the neck, a knot, two loose ends
    setD(cord.p[0], sackRing(Pt, t1, ck, 53.2, 0.5) + sackRing(Pt, t1, ck, 54.2, 0.45)
      + sackLine(P, s1, k1, TH - rad(14), 51.5, TH - rad(22), 46, 6, 0.4) + sackLine(P, s1, k1, TH - rad(8), 51.5, TH + rad(2), 45, 6, 0.4));
    const knot = t1.at(TH - rad(12), 53.7, ck, 0.9).p;
    setD(cord.p[1], DOTS([Pt(...knot)], 1.0));

    // the second sack, sewn shut along its top, leaning on the first. It leans at most 2.5 degrees more,
    // so it is redrawn only in steps of a tenth of a degree
    const k2k = Math.round(k2.lean * 573);
    if (k2k === s2Key) return;
    s2Key = k2k;
    setD(sack2.p[0], sackSil(P, s2, k2, 0, 42.4));
    // its sewn top: the seam along the ridge, and stitches across it
    const ridge = [], sts = [];
    for (let i = 0; i <= 16; i++) ridge.push(P3(P, s2.at((i / 16) * Math.PI, 42.4, k2, -0.6, false).p));
    for (let i = 1; i < 10; i++) { const q = s2.at((i / 10) * Math.PI, 42.4, k2, -0.6, false).p; sts.push(seg(P(q[0] - 0.5, q[1] - 0.9, q[2] - 0.7), P(q[0] + 0.5, q[1] + 0.9, q[2] + 0.4))); }
    setD(sack2.p[1], sackRing(P, s2, k2, 33.5) + sackRing(P, s2, k2, 2.5) + open(ridge));
    setD(sack2.p[2], sts.join(""));
  }
  function drawWheat(s, k1, dz, ck) {
    // the wheat: the stalk's end tucked under the cord, the stalk, an ear of kernels and awns, one leaf
    const tuck = t1.at(TH, 53.6, ck, 0.6).p, foot = s1.at(TH + rad(3), 48.2, k1, 0.4).p;
    tuck[2] -= dz;
    const dir = norm([-0.3, 0.5, 0.82]);
    const sw = (p) => rot(p, tuck, norm(V), sway.x);
    const top = add(tuck, dir, 8.5), ear = norm(add(dir, [-0.04, 0.1, 0]));
    const ns = norm(cross(ear, V)), nrm = cross(ear, ns), ker = [], awn = [], KL = 4, SP = 2.25;
    for (let i = 0; i < 5; i++) {
      for (const sd of [-1, 1]) {
        const u = 0.8 + i * SP, b = add(add(top, ear, u), ns, sd * 0.35), a = rad(sd > 0 ? 27 : 23);
        const kd = norm(add([ear[0] * Math.cos(a), ear[1] * Math.cos(a), ear[2] * Math.cos(a)], ns, sd * Math.sin(a)));
        const kb = blade(b, kd, norm(cross(kd, nrm)), KL, 1.25, 0, 0, 6);
        ker.push(poly(kb.out.map((p) => P3(P, sw(p)))));
        const tip = add(b, kd, KL), ad = norm(add(ear, ns, sd * 0.22));
        awn.push(seg(P3(P, sw(tip)), P3(P, sw(add(tip, ad, 7.5)))));
      }
    }
    const u1 = 0.8 + 5 * SP, tk = blade(add(top, ear, u1), ear, ns, KL, 1.3, 0, 0, 6);
    ker.push(poly(tk.out.map((p) => P3(P, sw(p)))));
    awn.push(seg(P3(P, sw(add(top, ear, u1 + KL))), P3(P, sw(add(top, ear, u1 + KL + 8)))));
    const stalk = curve(foot, tuck, top, 6).map((p, i) => P3(P, i > 3 ? sw(p) : p));
    const ld = norm([-0.35, 0.85, 0.4]);
    const lb = blade(add(tuck, dir, 5.5), ld, norm(cross(ld, V)), 13, 1.25, 7, 0, 10);
    setD(wheat.p[0], open(stalk));
    setD(wheat.p[1], poly(lb.out.map((p) => P3(P, sw(p)))));
    setD(wheat.p[2], awn.join(""));
    setD(wheat.p[3], ker.join(""));
  }

  const B = register(stage, (dt) => {
    const v0 = sp.v;
    let m = stepS(sp, dt);
    // the wheat is pushed by how fast the sack moves, then swings back
    sway.v -= (sp.v - v0) * 10;
    if (stepS(sway, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);
  function aim() {
    const d = over ?? base;
    sp.t = settle * d;
    setC(wheat.p[3], d < 0.01 ? "hi" : "");
    setC(body.p[0], d < 0.01 ? "sil" : "hi");
    const cm = 53 * settle * d * 1.4;
    read.textContent = d < 0.01 ? "rest" : `settled ${cm.toFixed(1)} cm · belly +${Math.round(settle * d * 115)}%`;
    B.wake();
  }
  const yTop = P(0, 0, 60)[1], yBot = P(0, 0, 0)[1];
  bag.add(pointer(stage, {
    move: (p) => { over = clamp(0.15 + ((p[1] - yTop) / (yBot - yTop)) * 1.1, 0.15, 1); aim(); },
    leave: () => { over = null; aim(); },
  }));
  aim();
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { settle = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* ======================================================================
 * 4. Vegetable crate: a shallow timber crate with a tied bunch of carrots
 * (long, tapered, ringed) and four beetroots (round), all with their leafy
 * tops. Drive: a breeze; every top leans the same way. Pointer: brushing
 * across the tops bends the ones near it away from it, and the bunch
 * nearest it is bright. At rest the twine round the carrots is the bright
 * place. Intensity: how far the tops bend.
 * ==================================================================== */

const VC = { X: 66, Y: 46, Z: 15, T: 2.2 };
/** Carrots lie side-on to the viewer (along x = -y), crowns to the right: the one view in which their taper reads. */
const CA = [Math.SQRT1_2, -Math.SQRT1_2, 0], CN = [Math.SQRT1_2, Math.SQRT1_2, 0];
const vdotA = (p) => p[0] * CA[0] + p[1] * CA[1];
const CARROTS = [[-5, 0, 15.2, 3.4, 0], [0, 1.5, 15.6, 3.6, 2], [5, 0.5, 15.2, 3.3, -1.5], [-2.5, 2.5, 21.2, 3.4, 1], [2.5, 3, 21.4, 3.3, -1]].map(([o, sh, z, r, tw]) => {
  const m = add(add([34, 28, z], CN, o), CA, sh);
  return { c: add(m, CA, 16), tip: add(add(m, CA, -16), [tw, tw, -2.4]), r };
});
const BEETS = [[12.5, 22, 14.6, 5.4, 2], [23.5, 12.5, 15, 5.8, 2], [33.5, 5.8, 14.4, 5.2, 2], [47, 6.2, 12.6, 4.9, 0], [57.5, 12.5, 12.4, 4.6, 0]];

const vegEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let bendMax = value, base = drive0 ?? 0, over = null, hotG = -1;
  const { X, Y, Z, T } = VC;
  const C = Cam(45, 0.5, 2.85);
  fit(C, [[-12, -12, -4], [78, -12, -4], [-12, 58, -4], [78, 58, -4], [20, 30, 40], [64, 12, 40], [74, 14, 30]], 200, 166);
  const P = proj(C), front = facing(C), S = C.S;
  const g = mk("g", {}, svg), fine = [];
  plinth(g, P, front, -12, -12, 78, 58, 4, 9);
  crateBack(g, P, front, X, Y, Z, T);

  const beetLayer = mk("g", {}, g);
  // carrots, back to front: a tapered hull, a few rings across
  const order =CARROTS.map((c, i) => [vdot(c.c), i]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
  for (const i of order) {
    const c = CARROTS[i], ax = norm(add(c.c, c.tip, -1)), e1 = norm(cross(ax, [0, 0, 1])), e2 = cross(e1, ax);
    const dirs = Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * Math.PI * 2; return add(add([0, 0, 0], e1, Math.cos(a)), e2, Math.sin(a)); });
    const ring = (p, r) => dirs.map((q) => add(p, q, r));
    const along = (t) => add(c.tip, add(c.c, c.tip, -1), t);
    const prt = part(g, ["sil", "nf lo"]);
    setD(prt.p[0], hullOf(P, [...ring(add(c.c, ax, 1.3), c.r * 0.6), ...ring(c.c, c.r), ...ring(along(0.75), c.r * 0.93), ...ring(along(0.4), c.r * 0.66), c.tip]));
    const rr = [];
    for (const [t, rf] of [[0.3, 0.52], [0.48, 0.72], [0.64, 0.86]]) {
      const pts = dirs.map((q) => P3(P, add(along(t), q, c.r * rf))), vis = dirs.map((q) => vdot(q) > 0.25);
      rr.push(vrun(pts, vis));
    }
    setD(prt.p[1], rr.join(""));
    fine.push(prt.p[1]);
  }
  // the twine round the bunch, a little behind the crowns: the near half of a loop round all five
  let twD = "";
  {
    const s0 = vdotA(CARROTS[1].c) - 5.5, sec = [];
    for (const c of CARROTS) {
      const t = (s0 - vdotA(c.tip)) / (vdotA(c.c) - vdotA(c.tip)), p = add(c.tip, add(c.c, c.tip, -1), t), r = c.r * 0.96 + 0.3;
      const u = p[0] * CN[0] + p[1] * CN[1];
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; sec.push([u + r * Math.cos(a), p[2] + r * Math.sin(a)]); }
    }
    const hl = hull(sec), W3 = ([u, v]) => add(add([0, 0, v], CA, s0), CN, u);
    const vis = hl.map(([u, v], i) => { const [u2, v2] = hl[(i + 1) % hl.length]; return vdot(add([0, 0, -(u2 - u)], CN, v2 - v)) > 0; });
    twD = vrun(hl.map((q) => P3(P, W3(q))), vis);
  }
  const twine = mk("path", { class: "nf hi", d: twD }, g);
  // beetroots, behind the carrots: round, a thin root, and the scar where the leaves come out
  const beetEls = BEETS.map(([x, y, z, r], i) => {
    const prt = part(beetLayer, ["nf", "sil", "nf lo"]);
    const o = norm([0.8, 0.2 + 0.25 * rnd(i * 3 + 1), -0.12]);
    const r0 = add([x, y, z], o, r * 0.96);
    setD(prt.p[0], open(curve(r0, add(r0, o, 3.5), add(add(r0, o, 6.5), [0, 0, -1.2]), 6).map((p) => P3(P, p))));
    setD(prt.p[1], disc(P(x, y, z), r * S));
    const sc = [];
    for (let k = 0; k < 14; k++) { const t = (k / 14) * Math.PI * 2; sc.push(P(x + 1.2 * Math.cos(t), y + 1.2 * Math.sin(t), z + r * 0.97)); }
    setD(prt.p[2], poly(sc));
    fine.push(prt.p[2]);
    return prt;
  });
  crateFront(g, P, front, X, Y, Z, T, fine, 1);

  // leafy tops: groups that bend together, each leaf a stem and a blade
  const groups = [];
  {
    const cl = [];
    CARROTS.forEach((c, i) => {
      for (let j = 0; j < (i < 3 ? 2 : 1); j++) {
        const fan = (j ? 0.32 : -0.22) + 0.2 * (rnd(i * 7 + j) - 0.5);
        cl.push({ root: add(c.c, CA, 0.3), d: norm(add(add([0, 0, 0.82], CA, 0.5 + 0.15 * rnd(i + j * 3)), CN, fan)), stem: 3.5 + 2 * rnd(i * 5 + j), len: 12 + 3 * rnd(i * 3 + j), w: 1.55, serr: 0, droop: 4 });
      }
    });
    groups.push({ name: "carrots", root: add(CARROTS[1].c, [0, 0, 2]), leaves: cl, item: twine });
    BEETS.forEach(([x, y, z, r, n], i) => {
      if (!n) return;
      const lv = [];
      for (let j = 0; j < n; j++) {
        const a = rad((j ? 26 : -38) + 22 * (rnd(i * 5 + j) - 0.5)), back = 0.2 + 0.3 * rnd(i * 13 + j);
        lv.push({ root: [x, y, z + r * 0.96], d: norm([Math.sin(a) * 0.6, -back, 0.86]), stem: 4 + 3 * rnd(i * 3 + j), len: 11 + 3.5 * rnd(i * 9 + j), w: 4.3, serr: 0, droop: 2.6 });
      }
      groups.push({ name: "beetroot", n: i + 1, root: [x, y, z + r], leaves: lv, item: beetEls[i].p[1] });
    });
  }
  const leafG = mk("g", {}, g), leafEls = [];
  for (const gr of groups) {
    gr.bx = spring(0, { k: 46, c: 7, eps: 0.02 }); gr.by = spring(0, { k: 46, c: 7, eps: 0.02 });
    for (const lf of gr.leaves) {
      lf.gr = gr; lf.g = mk("g", {}, leafG);
      lf.stemEl = mk("path", { class: "nf" }, lf.g); lf.o = mk("path", {}, lf.g); lf.rib = mk("path", { class: "nf lo" }, lf.g);
      fine.push(lf.rib);
      lf.depth = vdot(add(lf.root, lf.d, lf.stem));
      leafEls.push(lf);
    }
  }
  leafEls.sort((a, b) => a.depth - b.depth).forEach((lf) => leafG.appendChild(lf.g));
  lod(stage, bag, fine);

  function drawLeaf(lf) {
    const gr = lf.gr, m = Math.hypot(gr.bx.x, gr.by.x), Lm = lf.stem + lf.len;
    const k = m > 1e-3 ? [-gr.by.x / m, gr.bx.x / m, 0] : null;
    const bend = (p) => { if (!k) return p; const t = Math.min(1, Math.hypot(p[0] - lf.root[0], p[1] - lf.root[1], p[2] - lf.root[2]) / Lm); return rot(p, lf.root, k, rad(m) * t); };
    const sEnd = add(lf.root, lf.d, lf.stem), mid = add(add(lf.root, lf.d, lf.stem * 0.5), [0, 0, 0.6], 1);
    const bd = norm(add(lf.d, [0, 0, -0.25])), sd = norm(cross(bd, V));
    const bl = blade(sEnd, bd, sd, lf.len, lf.w, lf.droop, lf.serr, lf.serr ? 12 : 10);
    setD(lf.stemEl, open(curve(lf.root, mid, sEnd, 5).map((p) => P3(P, bend(p)))));
    setD(lf.o, poly(bl.out.map((p) => P3(P, bend(p)))));
    setD(lf.rib, open(bl.rib.map((p) => P3(P, bend(p)))));
  }
  let key = "";
  const B = register(stage, (dt) => {
    let m = false;
    for (const gr of groups) { if (stepS(gr.bx, dt)) m = true; if (stepS(gr.by, dt)) m = true; }
    const kk = groups.map((gr) => gr.bx.x.toFixed(2) + gr.by.x.toFixed(2)).join();
    if (kk !== key) { key = kk; leafEls.forEach(drawLeaf); }
    return m;
  });
  bag.add(B.unregister);
  // the breeze leans every top toward the front right
  const WIND = norm([0.85, 0.5, 0]);
  let W = null;
  function aim() {
    let best = 1e9; hotG = -1;
    for (const [i, gr] of groups.entries()) {
      if (over && W) {
        const vx = gr.root[0] - W[0], vy = gr.root[1] - W[1], d = Math.hypot(vx, vy), f = Math.max(0, 1 - d / 34) * bendMax;
        gr.bx.t = d > 0.01 ? (vx / d) * f : 0; gr.by.t = d > 0.01 ? (vy / d) * f : 0;
        if (d < best && d < 22) { best = d; hotG = i; }
      } else { gr.bx.t = WIND[0] * bendMax * base; gr.by.t = WIND[1] * bendMax * base; }
    }
    groups.forEach((gr, i) => setC(gr.item, i === hotG ? (i ? "hi" : "nf hi") : i ? "sil" : (over ? "nf" : "nf hi")));
    if (over && hotG >= 0) {
      const gr = groups[hotG];
      read.textContent = `${gr.name}${gr.n ? " " + gr.n + " of 3" : " · 5"} · lean ${Math.round(Math.hypot(gr.bx.t, gr.by.t))}°`;
    } else read.textContent = over ? "brush the leaves" : base > 0.01 ? `breeze · lean ${Math.round(bendMax * base)}°` : "rest";
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => { over = true; W = unproj(C, p[0], p[1], 26); aim(); },
    leave: () => { over = null; W = null; aim(); },
  }));
  aim();
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { bendMax = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* ---------- the public functions, in the library's own shape, plus drive ---------- */

export const aircraft = figure("aircraft", "A twin-propeller cargo aircraft parked on a round apron. The pointer, or a driven value, lifts it into a gentle climb: the props turn and the gear folds away.", aircraftEngine);
export const fruitCrate = figure("fruitcrate", "An open timber crate heaped with apples and a few leaves. The pointer, or a driven value, lifts the top layer of fruit.", fruitEngine);
export const grainSacks = figure("grainsacks", "A tied grain sack with an ear of wheat under its cord, and a second sack leaning on it. The pointer, or a driven value, makes the sack settle and bulge.", grainEngine);
export const vegCrate = figure("vegcrate", "A shallow crate of carrots and beetroot with their leafy tops. The pointer brushes the tops aside; a driven value leans them like a breeze.", vegEngine);
