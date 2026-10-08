/**
 * A new Hairline figure: a 20-foot shipping container on a quay slab, written
 * for the Hairline engine by Lucas Marques (MIT, see LICENSE in this folder)
 * by following the how-to in design-director-v2/recipes/hairline-custom/README.md
 * ("How to add your own figure"), step by step. New code; it uses only the
 * engine's own pieces: `create`, the camera and solids, springs, the shared
 * frame loop and pointer handling.
 *
 * Pointer: move it left to right across the figure and the two doors swing
 * open, each on its own spring (the second a little behind the first), so the
 * cargo inside shows through the doorway. Leave, and they swing shut.
 * `drive` 0..1 does the same from outside code (a slider, scroll).
 * At rest the right-hand door handle is the one bright thing; once the doors
 * are open, the label on the nearest carton is.
 * Intensity: how far the doors swing (degrees).
 *
 * World units, Cam(45, 0.5): x along the container, y across, z up. The
 * viewer sees the +x end (the doors), the +y side and the roof.
 */
import { core } from "./hairline-core.js";

const {
  create, TABLE, clamp, poly, seg, open, Cam, proj, fit, rrect, hull,
  facing, prism, rings, spring, stepS, mk, solid, put, register, pointer, disposer,
} = core;

/* how-to step 2: the figure's own number at intensity 0, 0.5 and 1 */
TABLE.container = [80, 118, 160]; // swing: degrees the doors open at drive 1

/* ---------- small helpers (as in figures-more.js, repeated so this file stands alone) ---------- */
const V = [Math.SQRT1_2 * Math.sqrt(0.75), Math.SQRT1_2 * Math.sqrt(0.75), 0.5]; // toward the viewer
const vdot = (p) => p[0] * V[0] + p[1] * V[1] + p[2] * V[2];
const setD = (el, d) => { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } };
const setC = (el, c) => { if (el.__c !== c) { el.__c = c; el.setAttribute("class", c); } };
const onX = (P, x) => (u, v) => P(x, u, v);
const onY = (P, y) => (u, v) => P(u, y, v);
const L = (f, u0, v0, u1, v1) => seg(f(u0, v0), f(u1, v1));
const RR = (f, ring) => poly(ring.map((q) => f(q.u, q.v)));
const toDrive = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : clamp(+v, 0, 1));
let uid = 0;

/** Below `px` css px wide, hide the finest lines (corrugation), so a small figure stays clean. */
function lod(stage, bag, els, px = 320) {
  let shown = null;
  const apply = (w) => { const on = !(w > 0 && w < px); if (on !== shown) { shown = on; for (const e of els) e.style.display = on ? "" : "none"; } };
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver((es) => apply(es[0].contentRect.width)); ro.observe(stage); bag.add(() => ro.disconnect()); }
  apply(stage.getBoundingClientRect().width);
}

/* ---------- the container's measurements (world units; about 10 cm each) ---------- */
const K = {
  X: 60, Y: 24, Z: 26,      // length, width, height
  CP: 1.5,                  // corner post
  SILL: 1.7, HEAD: 2.3,     // door sill and header heights
  T: 1.0,                   // door leaf thickness
};
K.LW = (K.Y - 2 * K.CP) / 2 - 0.15;     // one leaf's width
K.Z0 = K.SILL + 0.25; K.Z1 = K.Z - K.HEAD - 0.25; // leaf bottom and top
const LEAF = rrect(0, K.Z0, K.LW, K.Z1, 0.5, 2);
const FRAME = rrect(0.9, K.Z0 + 0.9, K.LW - 0.9, K.Z1 - 0.9, 0.4, 2);
const RODS = [K.LW * 0.3, K.LW * 0.7];
const HANDLE_V = K.Z0 + (K.Z1 - K.Z0) * 0.4;

/* cartons inside: [x0, y0, x1, y1, z0, z1] in a few short stacks near the doors */
const CARTONS = (() => {
  const out = [], c = 0.25, w = 6.4, d = 7.2, hgt = 6.2, y0 = K.CP + 0.4;
  // [y, cartons high in the front row, in the row behind]; the third column holds the sacks
  const cols = [[y0, 3, 3], [y0 + w + c, 2, 3]];
  for (const [yy, ...n] of cols) for (let row = 0; row < 2; row++) for (let k = 0; k < n[row]; k++) {
    const x1 = K.X - 2.2 - row * (d + c), x0 = x1 - d;
    out.push([x0, yy, x1, yy + w, K.SILL + k * (hgt + c), K.SILL + k * (hgt + c) + hgt]);
  }
  return out;
})();

/* how-to step 3: the engine */
const containerEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  const { X, Y, Z, CP, SILL, HEAD, T, LW } = K;
  let swing = value, base = drive0 ?? 0, over = null;

  const C = Cam(45, 0.5, 3.7);
  // the slab and the box (the doors stay over the slab up to about 120 degrees)
  fit(C, [[-6, -9, -3], [X + 13, -9, -3], [-6, Y + 9, -3], [X + 13, Y + 9, -3], [0, 0, Z], [X, Y, Z], [0, Y, Z]], 200, 162);
  const P = proj(C), front = facing(C);
  const fine = [];
  const g = mk("g", {}, svg);

  /* how-to step 4: draw back to front, every element made once */
  // the quay slab, with a painted bay line
  const [sr, si] = rings(-6, -9, X + 13, Y + 9, 5, 1.8);
  put(solid(g), prism(P, front, sr, si, -3, 0));
  mk("path", { class: "nf lo", d: seg(P(-3, Y + 5.5, 0), P(X + 10, Y + 5.5, 0)) + seg(P(X + 10, Y + 5.5, 0), P(X + 10, -6, 0)) }, g);
  // the box
  const [br, bi] = rings(0, 0, X, Y, 0.45, 0.35);
  put(solid(g), prism(P, front, br, bi, 0, Z));

  // the long side (+y): rails, corner posts, corrugation, forklift pockets, marks
  const fy = onY(P, Y), fx = onX(P, X), top = (x, y) => P(x, y, Z);
  mk("path", { class: "nf", d: L(fy, 0, Z - HEAD + 0.6, X, Z - HEAD + 0.6) + L(fy, 0, 1.3, X, 1.3) + L(fy, CP, 1.3, CP, Z - HEAD + 0.6) + L(fy, X - CP, 1.3, X - CP, Z - HEAD + 0.6) }, g);
  const rib = [];
  for (let x = CP + 1.8; x < X - CP - 1.2; x += 2.9) rib.push(L(fy, x, 1.9, x, Z - HEAD), L(fy, x + 1.05, 1.9, x + 1.05, Z - HEAD));
  fine.push(mk("path", { class: "nf lo", d: rib.join("") }, g));
  for (const xc of [X / 2 - 10, X / 2 + 10]) mk("path", { d: RR(fy, rrect(xc - 3.6, 0.35, xc + 3.6, 2.5, 0.5, 2)) }, g);
  mk("path", { class: "nf lo", d: L(fy, X - 15, Z - 5, X - 5, Z - 5) + L(fy, X - 15, Z - 6.6, X - 9, Z - 6.6) + L(fy, X - 15, Z - 8.2, X - 11, Z - 8.2) }, g);
  // corner castings on the two near faces
  const cast = [];
  for (const u of [[0.25, 2.3], [X - 2.3, X - 0.25]]) for (const v of [[0.25, 1.6], [Z - 1.6, Z - 0.25]]) cast.push(RR(fy, rrect(u[0], v[0], u[1], v[1], 0.3, 1)));
  for (const u of [[0.25, 2.3], [Y - 2.3, Y - 0.25]]) for (const v of [[0.25, 1.6], [Z - 1.6, Z - 0.25]]) cast.push(RR(fx, rrect(u[0], v[0], u[1], v[1], 0.3, 1)));
  mk("path", { class: "nf", d: cast.join("") }, g);
  // the roof: shallow cross ribs
  const roof = [];
  for (let x = 3; x < X - 2; x += 3.4) roof.push(seg(top(x, 0.9), top(x, Y - 0.9)));
  fine.push(mk("path", { class: "nf lo", d: roof.join("") }, g));
  // the door end (+x): header, sill and posts around the opening
  mk("path", { class: "nf", d: L(fx, 0, Z - HEAD, Y, Z - HEAD) + L(fx, 0, SILL, Y, SILL) + L(fx, CP, SILL, CP, Z - HEAD) + L(fx, Y - CP, SILL, Y - CP, Z - HEAD) }, g);

  // the inside: only ever seen through the doorway, so it is clipped to it
  const id = "hl-ctr-" + ++uid;
  const defs = mk("defs", {}, svg);
  const cp = mk("clipPath", { id }, defs);
  mk("path", { d: poly([P(X, CP, SILL), P(X, Y - CP, SILL), P(X, Y - CP, Z - HEAD), P(X, CP, Z - HEAD)]), style: "stroke:none" }, cp);
  const inside = mk("g", { "clip-path": `url(#${id})` }, g);
  mk("path", { class: "fo", d: poly([P(X, CP, SILL), P(X, Y - CP, SILL), P(X, Y - CP, Z - HEAD), P(X, CP, Z - HEAD)]) }, inside);
  const yi = 0.9, zf = SILL, zc = Z - 1.1, xb = 0.7; // inner wall, floor, ceiling, back wall
  mk("path", { class: "nf", d: seg(P(X, yi, zf), P(xb, yi, zf)) + seg(P(xb, yi, zf), P(xb, Y - yi, zf)) + seg(P(xb, yi, zf), P(xb, yi, zc)) + seg(P(X, yi, zc), P(xb, yi, zc)) + seg(P(xb, yi, zc), P(xb, Y - yi, zc)) }, inside);
  const inner = [];
  for (let x = 4; x < X - 2; x += 4.2) inner.push(seg(P(x, yi, zf), P(x, yi, zc)));
  for (let y = 3.4; y < Y - 1; y += 3.4) inner.push(seg(P(xb, y, zf), P(X, y, zf)));
  mk("path", { class: "nf lo", d: inner.join("") }, inside);
  // cargo, far first
  const cargo = CARTONS.map((b) => ({ b, d: vdot([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[4] + b[5]) / 2]) })).sort((a, b) => a.d - b.d);
  let label = null;
  for (const { b } of cargo) {
    const [x0, y0, x1, y1, z0, z1] = b;
    const gg = mk("g", {}, inside);
    const [r0, r1] = rings(x0, y0, x1, y1, 0.35, 0.3);
    put(solid(gg), prism(P, front, r0, r1, z0, z1));
    const ex = onX(P, x1);
    const lab = mk("path", { class: "nf lo", d: RR(ex, rrect(y0 + 1.3, z0 + 1.4, y0 + 4.2, z0 + 3.6, 0.3, 1)) }, gg);
    mk("path", { class: "nf lo", d: seg(P(x0 + 0.4, (y0 + y1) / 2, z1), P(x1 - 0.4, (y0 + y1) / 2, z1)) }, gg);
    if (x1 > X - 3 && z1 > SILL + 12 && y0 < 3) label = lab; // the top carton, front row, nearest the hinge
  }
  // sacks on a low pallet in the third column
  {
    const y0 = CP + 0.4 + 2 * (6.4 + 0.25), y1 = Y - CP - 0.4, x1 = X - 2.2, x0 = x1 - 14.6;
    const [p0, p1] = rings(x0, y0, x1, y1, 0.3, 0.25);
    put(solid(inside), prism(P, front, p0, p1, SILL, SILL + 1.4));
    mk("path", { class: "nf lo", d: seg(P(x1, y0 + 1.6, SILL + 0.7), P(x1, y1 - 1.6, SILL + 0.7)) }, inside);
    const sacks = [];
    for (const [a, b, z] of [[x0 + 0.3, x0 + 7, SILL + 1.4], [x0 + 7.4, x1 - 0.3, SILL + 1.4], [x0 + 2.4, x1 - 2.6, SILL + 5.6]]) sacks.push({ a, b, z });
    for (const s of sacks) {
      const [q0, q1] = rings(s.a, y0 + 0.4, s.b, y1 - 0.4, 2.3, 1.2);
      put(solid(inside), prism(P, front, q0, q1, s.z, s.z + 4.2));
      mk("path", { class: "nf lo", d: seg(P(s.b, y0 + 1.6, s.z + 2.1), P(s.b, y1 - 1.6, s.z + 2.1)) }, inside);
    }
  }

  // the two door leaves: drawn every frame, in depth order
  const doors = mk("g", {}, g);
  const leaves = [
    { hinge: [X, Y - CP], side: -1, sp: spring(0, { k: 58, c: 11.5, eps: 0.05 }), lag: 1 },   // swings toward the long side
    { hinge: [X, CP], side: 1, sp: spring(0, { k: 44, c: 10.5, eps: 0.05 }), lag: 0.94 },     // the far leaf
  ].map((lf, i) => {
    lf.g = mk("g", {}, doors); lf.g.__n = i;
    lf.plate = mk("path", { class: "sil" }, lf.g);
    lf.face = mk("path", { class: "nf" }, lf.g);
    lf.panel = mk("path", { class: "nf lo" }, lf.g); fine.push(lf.panel);
    lf.rods = mk("path", { class: "nf" }, lf.g);
    lf.handle = mk("path", { class: "nf" }, lf.g);
    lf.drawn = NaN;
    return lf;
  });
  lod(stage, bag, fine);

  // a point on a leaf: u across from the hinge, v up, s through the thickness
  const at = (lf, th) => {
    const sn = Math.sin(th), cs = Math.cos(th);
    const d = [sn, lf.side * cs], n = [cs, -lf.side * sn];
    return (u, v, s) => P(lf.hinge[0] + d[0] * u + n[0] * (s + 0.25), lf.hinge[1] + d[1] * u + n[1] * (s + 0.25), v);
  };
  function drawLeaf(lf, deg) {
    if (deg === lf.drawn) return;
    lf.drawn = deg;
    const th = (deg * Math.PI) / 180, f = at(lf, th), n = [Math.cos(th), -lf.side * Math.sin(th), 0];
    const out = vdot(n) > 0, s = out ? T / 2 : -T / 2;
    const fr = LEAF.map((q) => f(q.u, q.v, T / 2)), bk = LEAF.map((q) => f(q.u, q.v, -T / 2));
    setD(lf.plate, poly(hull(fr.concat(bk))));
    setD(lf.face, poly(out ? fr : bk));
    if (out) {
      const ribs = [];
      for (let u = 1.9; u < LW - 1.2; u += 1.7) ribs.push(seg(f(u, K.Z0 + 1.2, s), f(u, K.Z1 - 1.2, s)));
      setD(lf.panel, ribs.join("") + poly(FRAME.map((q) => f(q.u, q.v, s))));
      // locking rods with their keepers at sill and header, and a handle on each
      const rods = RODS.map((u) => seg(f(u, SILL - 0.2, s + 0.35), f(u, Z - HEAD + 0.2, s + 0.35))
        + poly([f(u - 0.6, SILL - 0.2, s + 0.35), f(u + 0.6, SILL - 0.2, s + 0.35), f(u + 0.6, SILL + 0.9, s + 0.35), f(u - 0.6, SILL + 0.9, s + 0.35)])
        + poly([f(u - 0.6, Z - HEAD - 0.9, s + 0.35), f(u + 0.6, Z - HEAD - 0.9, s + 0.35), f(u + 0.6, Z - HEAD + 0.2, s + 0.35), f(u - 0.6, Z - HEAD + 0.2, s + 0.35)])).join("");
      setD(lf.rods, rods);
      setD(lf.handle, RODS.map((u) => open([f(u, HANDLE_V, s + 0.35), f(u + 2.6, HANDLE_V - 0.6, s + 0.6), f(u + 3.0, HANDLE_V - 0.2, s + 0.6)])).join(""));
    } else {
      // the inside of a leaf: a plain frame and three stiffeners
      const st = [0.28, 0.52, 0.76].map((t) => seg(f(0.9, K.Z0 + (K.Z1 - K.Z0) * t, s), f(LW - 0.9, K.Z0 + (K.Z1 - K.Z0) * t, s)));
      setD(lf.panel, poly(FRAME.map((q) => f(q.u, q.v, s))) + st.join(""));
      setD(lf.rods, "");
      setD(lf.handle, "");
    }
    // centre for depth order
    const c = [lf.hinge[0] + Math.sin(th) * LW / 2, lf.hinge[1] + lf.side * Math.cos(th) * LW / 2, Z / 2];
    lf.depth = vdot(c);
  }
  let order = "";
  function draw() {
    for (const lf of leaves) drawLeaf(lf, Math.round(lf.sp.x * 10) / 10);
    const sorted = leaves.slice().sort((a, b) => a.depth - b.depth), key = sorted.map((l) => l.g.__n).join();
    if (key !== order) { order = key; for (const l of sorted) doors.appendChild(l.g); }
  }

  /* how-to step 6: motion on springs; return true only while something moves, so it sleeps */
  const B = register(stage, (dt) => {
    let m = false;
    for (const lf of leaves) if (stepS(lf.sp, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);
  function aim() {
    const d = over ?? base;
    for (const lf of leaves) lf.sp.t = swing * d * lf.lag;
    const opened = d > 0.3;
    setC(leaves[0].handle, opened ? "nf" : "nf hi");
    if (label) setC(label, opened ? "nf hi" : "nf lo");
    read.textContent = d < 0.01 ? "rest" : `doors ${Math.round(swing * d)}° · 11 cartons, 3 sacks`;
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => { over = clamp((p[0] - 110) / 190, 0, 1); aim(); },
    leave: () => { over = null; aim(); },
  }));
  aim();
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { swing = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* how-to step 8: export through the engine's own mount wrapper, plus drive(v) */
export function container(el, options = {}) {
  let eng = null;
  const h = create({
    id: "container",
    label: "A shipping container on a quay. Moving the pointer across it swings its two doors open to show cartons and sacks inside.",
    rest: "rest",
    engine: (ctx, v) => (eng = containerEngine(ctx, v, toDrive(options.drive))),
  }, el, options);
  const drive = (v) => { if (eng) eng.drive(toDrive(v)); };
  return { update(next) { h.update(next); if (next && "drive" in next) drive(next.drive); }, drive, destroy: h.destroy };
}
