/**
 * figures-ranges.js: nine small hairline figures, one per AMS Prime Egypt product
 * range, for the Contact enquiry tiles ("what do you want to export?").
 * Written 2026-10-08 for the Hairline engine by Lucas Marques (MIT, see LICENSE in
 * this folder), following design-director-v2/recipes/hairline-custom/README.md,
 * "How to add your own figure". New code; it uses only the engine's own pieces:
 * `create`, the camera and solids, springs, the shared frame loop and pointer.
 *
 * One family with the kit: the same camera as fruitCrate (Cam(45, 0.5, 2.6)), the
 * same rounded plinth, the same stroke classes (.sil outline, plain parts, .lo
 * fine detail, .hi the one bright thing). Colour only from the --hairline-* vars.
 * No people, animals, text or logos.
 *
 * `drive` 0..1 (mount option, fig.drive(v) or fig.update({ drive })) does one
 * gentle thing on a spring; drive 0 and drive 1 both look complete. The pointer
 * does the same, left to right across the figure. Below 300 px wide the finest
 * lines hide, so a 180 px tile keeps its shapes.
 *
 * Exports: hayBale, frozenBag, fruitTray, produceCrate, oliveJar, chocolate,
 * groceryCarton, household, armchair.
 */
import { core } from "./hairline-core.js";

const {
  create, TABLE, clamp, r2, poly, seg, open, Cam, proj, fit, rrect, circ, hull,
  facing, prism, rings, run, spring, stepS, mk, register, pointer, disposer,
} = core;

/* ---------- shared helpers ---------- */
const V = [Math.SQRT1_2 * Math.sqrt(0.75), Math.SQRT1_2 * Math.sqrt(0.75), 0.5]; // toward the viewer
const vdot = (p) => p[0] * V[0] + p[1] * V[1] + p[2] * V[2];
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const setD = (el, d) => { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } };
const path = (p, cls, d = "") => { const e = mk("path", cls ? { class: cls } : {}, p); setD(e, d); return e; };
const pt = (p) => r2(p[0]) + " " + r2(p[1]);
const disc = (c, r) => `M${r2(c[0] - r)} ${r2(c[1])}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
/** A screen ellipse: centre, radii, angle of the long axis. */
const ell = (c, rx, ry, a) => {
  const dx = rx * Math.cos(a), dy = rx * Math.sin(a), A = `A${r2(rx)} ${r2(ry)} ${r2((a * 180) / Math.PI)} 1 0 `;
  return `M${pt([c[0] - dx, c[1] - dy])}${A}${pt([c[0] + dx, c[1] + dy])}${A}${pt([c[0] - dx, c[1] - dy])}Z`;
};
const quad = (a, b, c) => `M${pt(a)}Q${pt(b)} ${pt(c)}`;
const P3 = (P, p) => P(p[0], p[1], p[2]);
/** Rotate p about the unit axis k through o by angle a. */
function rot(p, o, k, a) {
  const c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  const d = (k[0] * x + k[1] * y + k[2] * z) * (1 - c);
  return [o[0] + x * c + (k[1] * z - k[2] * y) * s + k[0] * d, o[1] + y * c + (k[2] * x - k[0] * z) * s + k[1] * d, o[2] + z * c + (k[0] * y - k[1] * x) * s + k[2] * d];
}
const ring = (cx, cy, R, n = 28) => circ(R, n).map((q) => ({ u: q.u + cx, v: q.v + cy, nu: q.nu, nv: q.nv }));
/** A convex solid: the hull of rings at heights. Crease: the near edge of the last ring. */
function loft(P, f, rs) {
  const pts = [];
  for (const [r, z] of rs) for (const q of r) pts.push(P(q.u, q.v, z));
  const [r, z] = rs[rs.length - 1];
  return { sil: poly(hull(pts)), crease: open(run(r, f).map((q) => P(q.u, q.v, z))) };
}
const cyl = (P, f, cx, cy, R, z0, z1, n) => { const r = ring(cx, cy, R, n); return loft(P, f, [[r, z0], [r, z1]]); };
/** A box with slightly rounded corners, its near top edges and its near upright edge. */
const box = (P, f, x0, y0, x1, y1, z0, z1, r = 0.5) => {
  const q = rrect(x0, y0, x1, y1, r, 2), s = loft(P, f, [[q, z0], [q, z1]]), k = 0.29 * r;
  s.crease += seg(P(x1 - k, y1 - k, z0), P(x1 - k, y1 - k, z1));
  return s;
};
/** The near half (or all) of a level circle. */
const arc = (P, f, cx, cy, R, z, all) => { const r = ring(cx, cy, R); return all ? poly(r.map((q) => P(q.u, q.v, z))) : open(run(r, f).map((q) => P(q.u, q.v, z))); };
function sol(p, cls = "nf", out = "sil") { const g = mk("g", {}, p); return { g, a: path(g, out), b: path(g, cls) }; }
const put2 = (o, s) => { setD(o.a, s.sil); setD(o.b, s.crease); return o; };
const add = (p, s, cls) => put2(sol(p, cls), s);
const onX = (P, x) => (u, v) => P(x, u, v);
const onY = (P, y) => (u, v) => P(u, y, v);
const onZ = (P, z) => (u, v) => P(u, v, z);
const L = (F, u0, v0, u1, v1) => seg(F(u0, v0), F(u1, v1));
const RR = (F, q) => poly(q.map((p) => F(p.u, p.v)));
/** A flat leaf lying at height z: base b, direction angle a. */
const leaf = (P, b, a, len, w, z) => {
  const d = [Math.cos(a), Math.sin(a)], s = [-d[1], d[0]], o = [], i = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, ww = w * Math.sin(Math.PI * t) ** 0.8, cx = b[0] + d[0] * len * t, cy = b[1] + d[1] * len * t;
    o.push(P(cx + s[0] * ww, cy + s[1] * ww, z)); i.unshift(P(cx - s[0] * ww, cy - s[1] * ww, z));
  }
  return { o: poly(o.concat(i)), rib: seg(P(b[0], b[1], z), P(b[0] + d[0] * len * 0.85, b[1] + d[1] * len * 0.85, z)) };
};
function lod(stage, bag, els, px = 300) {
  let shown = null;
  const apply = (w) => { const on = !(w > 0 && w < px); if (on !== shown) { shown = on; for (const e of els) e.style.display = on ? "" : "none"; } };
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver((es) => apply(es[0].contentRect.width)); ro.observe(stage); bag.add(() => ro.disconnect()); }
  apply(stage.getBoundingClientRect().width);
}
const toDrive = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : clamp(+v, 0, 1));

/**
 * One engine for all nine: camera, plinth, a spring on the drive, pointer,
 * sleep. build({ g, P, f, S, fine }) draws the still parts once and returns
 * { draw(t), say(d) }; draw(t) updates only what moves (t 0..about 1.3).
 */
function figure(id, label, [x0, y0, x1, y1, ...top], build) {
  TABLE[id] = [0.55, 1, 1.3]; // how far the movement goes at drive 1, at intensity 0, 0.5, 1
  // the plinth, and the camera scaled so plinth and figure fill the frame as the kit's figures do
  const frame = [[x0, y0, -4], [x1, y0, -4], [x0, y1, -4], [x1, y1, -4], ...top];
  const C1 = Cam(45, 0.5, 1), P1 = proj(C1), ps = frame.map((p) => P3(P1, p));
  const w = Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0])), h = Math.max(...ps.map((p) => p[1])) - Math.min(...ps.map((p) => p[1]));
  const scale = Math.min(300 / w, 236 / h);
  const engine = ({ stage, svg, read }, value, drive0) => {
    const bag = disposer();
    let amt = value, base = drive0 ?? 0, over = null;
    const C = Cam(45, 0.5, scale);
    fit(C, frame, 200, 160);
    const P = proj(C), f = facing(C), g = mk("g", {}, svg), fine = [];
    const [pr, pi] = rings(x0, y0, x1, y1, 8, 2);
    add(g, prism(P, f, pr, pi, -4, 0), "nf lo");
    const fig = build({ g, P, f, S: C.S, fine });
    lod(stage, bag, fine);
    const sp = spring(base * amt, { k: 46, c: 11, eps: 0.002 });
    let last = NaN;
    const B = register(stage, (dt) => {
      const m = stepS(sp, dt), t = Math.round(sp.x * 500) / 500;
      if (t !== last) { last = t; fig.draw(t); }
      return m;
    });
    bag.add(B.unregister);
    const aim = () => { const d = over ?? base; sp.t = d * amt; read.textContent = d < 0.01 ? "rest" : fig.say(d); B.wake(); };
    bag.add(pointer(stage, { move: (p) => { over = clamp((p[0] - 110) / 190, 0, 1); aim(); }, leave: () => { over = null; aim(); } }));
    aim();
    bag.add(() => svg.replaceChildren());
    return { set: (v) => { amt = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
  };
  return (el, options = {}) => {
    let eng = null;
    const h = create({ id, label, rest: "rest", engine: (ctx, v) => (eng = engine(ctx, v, toDrive(options.drive))) }, el, options);
    const drive = (v) => { if (eng) eng.drive(toDrive(v)); };
    return { update(next) { h.update(next); if (next && "drive" in next) drive(next.drive); }, drive, destroy: h.destroy };
  };
}

/* ======================================================================
 * 1. Animal feed: a round hay bale lying on its side (net wraps, a spiral
 * on its end), a sewn feed sack beside it, loose straw on the plinth.
 * Drive: the loose straw at the bale's rim stirs.
 * ==================================================================== */
export const hayBale = figure("haybale", "A round hay bale on its side with a sewn feed sack beside it.", [-6, -4, 66, 54, [18, 18, 31]], ({ g, P, f, fine }) => {
  const RB = 15, yc = 18, zc = 15, xa = 2, xb = 36, TAU = Math.PI * 2;
  const rim = (x, r, a0 = 0, a1 = TAU, n = 40) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return P(x, yc + r * Math.cos(a), zc + r * Math.sin(a)); });
  const ph = Math.atan2(-V[2], V[1]); // the part of the round side that faces the viewer, as an angle (z is up, screen y is down)
  const seen = [-Math.PI / 2 - ph, Math.PI / 2 - ph];
  path(g, "sil", poly(hull(rim(xa, RB).concat(rim(xb, RB)))));
  path(g, "nf", poly(rim(xb, RB).slice(0, -1)));
  const sp = [];
  for (let k = 0; k <= 120; k++) { const a = (k / 120) * TAU * 4.5, r = RB * (0.93 - (0.88 * k) / 120); sp.push(P(xb, yc + r * Math.cos(a), zc + r * Math.sin(a))); }
  path(g, "nf lo", open(sp));
  [xa + 7, xa + 17, xa + 27].forEach((x, i) => path(g, "nf", open(rim(x, RB + 0.15, seen[0], seen[1], 24))));
  const s = [], s2 = [], tufts = [];
  for (let i = 0; i < 46; i++) {
    const a = seen[0] + 0.15 + rnd(i) * (seen[1] - seen[0] - 0.3), x = xa + 1.5 + rnd(i * 3.7) * (xb - xa - 5), c = (rnd(i * 5.3) - 0.5) * 0.25;
    (i < 16 ? s2 : s).push(seg(P(x, yc + RB * Math.cos(a), zc + RB * Math.sin(a)), P(x + 3.4, yc + RB * Math.cos(a + c), zc + RB * Math.sin(a + c))));
  }
  fine.push(path(g, "nf lo", s.join("")));
  path(g, "nf lo", s2.join(""));
  for (let i = 0; i < 9; i++) { const a = seen[0] + 0.3 + (i / 8) * (seen[1] - seen[0] - 0.6) + (rnd(i) - 0.5) * 0.2; tufts.push({ a, len: 3 + rnd(i * 2) * 4, k: rnd(i * 6 + 5), el: path(g, "nf") }); }
  const ls = [];
  for (let i = 0; i < 6; i++) { const x = 2 + rnd(i * 11) * 34, y = 38 + rnd(i * 13) * 12, a = rnd(i * 17) * 3; ls.push(seg(P(x, y, 0), P(x + 5 * Math.cos(a), y + 5 * Math.sin(a), 0))); }
  path(g, "nf", ls.join(""));
  // the sack: a hull of three rounded rings, a sewn ridge on top
  add(g, loft(P, f, [[rrect(43, 34, 58, 47, 4, 3), 0], [rrect(42, 33, 59, 48, 5, 3), 8], [rrect(42.6, 38.8, 58.4, 42.2, 1.5, 3), 22]]), "nf lo");
  add(g, box(P, f, 42.6, 39.8, 58.4, 41.2, 22, 24.8, 0.5));
  path(g, "nf dash", seg(P(43.4, 41.2, 23.4), P(57.6, 41.2, 23.4)));
  path(g, "nf lo", open([P(45.5, 47.7, 3), P(44.6, 47.9, 10), P(45.6, 44.4, 20)]));
  return {
    draw(t) {
      for (const s of tufts) {
        const sw = t * (0.12 + 0.2 * s.k), ca = Math.cos(s.a), sa = Math.sin(s.a), cb = Math.cos(s.a + sw), sb = Math.sin(s.a + sw), r1 = RB + s.len * 0.5, r2_ = RB + s.len;
        setD(s.el, quad(P(xb - 1.5, yc + (RB - 0.6) * ca, zc + (RB - 0.6) * sa), P(xb + 0.6, yc + r1 * ca, zc + r1 * sa), P(xb + 1.2 + s.len * 0.3, yc + r2_ * cb, zc + r2_ * sb)));
      }
    },
    say: (d) => `loose straw stirs · ${Math.round(d * 100)}%`,
  };
});

/* ======================================================================
 * 2. Frozen vegetables: a stand-up pouch with a crimped seal, hang hole and a
 * window of peas; peas and diced carrot spilled in front.
 * Drive: the spill rolls outward. Bright: the window.
 * ==================================================================== */
export const frozenBag = figure("frozenbag", "A stand-up bag of frozen peas with a crimped seal and a clear window, peas and diced carrot spilled in front.", [4, 8, 54, 58, [29, 24, 48]], ({ g, P, f, S }) => {
  const yf = (z) => (z < 10 ? 30 + z * 0.1 : 31 - (z - 10) * 0.2); // the front of the bag at height z
  add(g, loft(P, f, [[rrect(14, 16, 44, 30, 5, 3), 0], [rrect(13, 15, 45, 31, 6, 3), 10], [rrect(14.5, 23.4, 43.5, 25, 0.6, 1), 40]]));
  const zz = [P(14.5, 25, 40), P(43.5, 25, 40)];
  for (let k = 0; k <= 20; k++) zz.push(P(43.5 - k * 1.45, 25, k % 2 ? 46.2 : 47.2));
  path(g, "sil", poly([P(43.5, 23.4, 40), P(43.5, 25, 40), P(43.5, 25, 47.2), P(43.5, 23.4, 47.2)]));
  path(g, "sil", poly(zz));
  path(g, "nf", RR(onY(P, 25), rrect(26.5, 43.6, 31.5, 45.2, 0.8, 2)) + seg(P(15, 25, 41.6), P(43, 25, 41.6)));
  const F = (u, v) => P(u, yf(v), v);
  path(g, "nf lo", seg(F(17, 37), F(41, 37)));
  path(g, "nf hi", RR(F, rrect(19, 12, 39, 32, 3, 3)));
  const pw = [];
  for (let i = 0; i < 16; i++) { const r = (i / 4) | 0, u = 22.4 + (i % 4) * 4.3 + (r % 2) * 1.5 + (rnd(i) - 0.5), v = 15.4 + r * 4.4 + (rnd(i * 3) - 0.5); pw.push(disc(F(u, v), 1.75 * S)); }
  path(g, "", pw.join(""));
  // the spill, far pieces first (scaling about the centre keeps that order)
  const bits = Array.from({ length: 21 }, (_, i) => ({ a: i * 2.39996 + rnd(i), r: Math.sqrt((i + 0.6) / 21), up: i < 4 ? 1 : 0, cube: i % 6 === 4 }))
    .sort((p, q) => p.r * (Math.cos(p.a) + Math.sin(p.a)) - q.r * (Math.cos(q.a) + Math.sin(q.a)));
  for (const b of bits) b.el = b.cube ? sol(g) : path(g, "");
  return {
    draw(t) {
      for (const b of bits) {
        const R = b.r * (7 + 6.5 * Math.min(t, 1.3)), x = 31 + R * Math.cos(b.a), y = 44 + R * Math.sin(b.a) * 0.75;
        if (b.cube) put2(b.el, box(P, f, x - 1.4, y - 1.4, x + 1.4, y + 1.4, 0, 2.8, 0.3));
        else setD(b.el, disc(P(x, y, 2 + b.up * 3 * (1 - Math.min(t, 1))), 2 * S));
      }
    },
    say: (d) => `peas roll out · ${Math.round(d * 100)}%`,
  };
});

/* ======================================================================
 * 3. Frozen fruits: a shallow ribbed tray of strawberries, its lid hinged on
 * the far edge. Drive: the lid opens wider.
 * ==================================================================== */
/** A strawberry seen from anywhere: round shoulders, a tapering tip toward angle a. */
function berry(c, r, a) {
  const d = [Math.cos(a), Math.sin(a)], s = [-d[1], d[0]], o = [c[0] - d[0] * r * 0.3, c[1] - d[1] * r * 0.3], p = [];
  for (let k = 0; k <= 8; k++) { const t = a + Math.PI / 2 + (k / 8) * Math.PI; p.push([o[0] + r * Math.cos(t), o[1] + r * Math.sin(t)]); }
  for (let k = 1; k <= 7; k++) { const t = k / 8, w = r * (1 - t) ** 0.8; p.push([o[0] - s[0] * w + d[0] * r * 1.45 * t, o[1] - s[1] * w + d[1] * r * 1.45 * t]); }
  p.push([o[0] + d[0] * r * 1.45, o[1] + d[1] * r * 1.45]);
  for (let k = 7; k >= 1; k--) { const t = k / 8, w = r * (1 - t) ** 0.8; p.push([o[0] + s[0] * w + d[0] * r * 1.45 * t, o[1] + s[1] * w + d[1] * r * 1.45 * t]); }
  const b = [o[0] - d[0] * r * 0.55, o[1] - d[1] * r * 0.55], st = [];
  for (let k = 0; k < 5; k++) { const q = a + Math.PI + (k - 2) * 0.62; st.push(`M${pt(b)}L${pt([b[0] + Math.cos(q) * r * 0.6, b[1] + Math.sin(q) * r * 0.6])}`); }
  const seeds = [];
  for (let k = 0; k < 6; k++) { const u = r * (0.15 + 0.22 * (k >> 1)), w = (k % 2 ? 1 : -1) * r * (0.42 - 0.1 * (k >> 1)); seeds.push(disc([o[0] + d[0] * u + s[0] * w, o[1] + d[1] * u + s[1] * w], 0.45)); }
  return { o: poly(p), cal: st.join(""), seeds: seeds.join("") };
}
export const fruitTray = figure("fruittray", "A shallow tray of strawberries with its lid hinged open behind it.", [-3, 1, 67, 56, [28, -8, 36]], ({ g, P, f, S, fine }) => {
  const X0 = 4, Y0 = 10, X1 = 52, Y1 = 40, Z = 9, T = 1.5, LY = Y1 - Y0 + 1;
  const lid = sol(g), lidIn = path(g, "nf lo");
  const o = rrect(X0, Y0, X1, Y1, 1.2, 2);
  path(g, "sil", loft(P, f, [[o, 0], [o, Z]]).sil);
  path(g, "", poly([P(X0 + T, Y0 + T, Z), P(X1 - T, Y0 + T, Z), P(X1 - T, Y1 - T, Z), P(X0 + T, Y1 - T, Z)]));
  const layer = mk("g", {}, g);
  for (const [x0, y0, x1, y1] of [[X0, Y1 - T, X1, Y1], [X1 - T, Y0, X1, Y1]]) add(g, box(P, f, x0, y0, x1, y1, 0, Z, 0.5));
  const fy = onY(P, Y1), fx = onX(P, X1), rb = [];
  path(g, "nf", L(fy, X0 + 0.6, Z - 2, X1 - 0.4, Z - 2) + L(fx, Y0 + 0.6, Z - 2, Y1 - 0.4, Z - 2));
  for (let x = X0 + 3.5; x < X1 - 2; x += 3.5) rb.push(L(fy, x, 0.8, x, Z - 2.8));
  for (let y = Y0 + 3.5; y < Y1 - 2; y += 3.5) rb.push(L(fx, y, 0.8, y, Z - 2.8));
  fine.push(path(g, "nf lo", rb.join("")));
  // berries: a layer of 15, seven on top, two loose on the plinth
  const B = [];
  for (let i = 0; i < 15; i++) B.push([10 + (i % 5) * 9, 15.5 + ((i / 5) | 0) * 9.5, 7.2]);
  for (const [x, y] of [[14.5, 20], [23.5, 20], [32.5, 20], [41.5, 20], [19, 29.5], [28, 29.5], [37, 29.5]]) B.push([x, y, 12.4]);
  B.push([60, 33, 3.4], [22, 50, 3.4]);
  const items = B.map((b, i) => ({ c: [b[0] + (rnd(i) - 0.5) * 1.6, b[1] + (rnd(i * 3) - 0.5) * 1.6, b[2] + rnd(i * 5) * 0.8], a: Math.PI / 2 + (rnd(i * 7) - 0.5) * 2.6, i }))
    .sort((p, q) => vdot(p.c) - vdot(q.c));
  for (const it of items) {
    const br = berry(P3(P, it.c), 4.3 * S, it.a), gg = it.i > 21 ? g : layer;
    path(gg, "", br.o);
    path(gg, "nf", br.cal);
    fine.push(path(gg, "dot off", br.seeds));
  }
  return {
    draw(t) {
      const th = ((112 + 20 * t) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
      const W = (x, a, k) => P(x, Y0 + a * c + k * s, Z + a * s - k * c), pts = [];
      for (const x of [X0 - 0.4, X1 + 0.4]) for (const a of [0, LY]) for (const k of [0, 2.8]) pts.push(W(x, a, k));
      put2(lid, { sil: poly(hull(pts)), crease: poly([W(X0 - 0.4, 0, 2.8), W(X1 + 0.4, 0, 2.8), W(X1 + 0.4, LY, 2.8), W(X0 - 0.4, LY, 2.8)]) });
      setD(lidIn, poly([W(X0 + 1.2, 1.5, 0), W(X1 - 1.2, 1.5, 0), W(X1 - 1.2, LY - 1.5, 0), W(X0 + 1.2, LY - 1.5, 0)]));
    },
    say: (d) => `lid opens · ${Math.round(112 + 20 * d)}°`,
  };
});

/* ======================================================================
 * 4. Fresh produce: a slatted field crate heaped with tomatoes, onions and a
 * cabbage. Drive: the top of the heap lifts a little.
 * ==================================================================== */
export const produceCrate = figure("producecrate", "A slatted wooden field crate heaped with tomatoes, onions and a cabbage.", [-5, -1, 61, 50, [27, 20, 40]], ({ g, P, f, S, fine }) => {
  const X0 = 2, Y0 = 6, X1 = 54, Y1 = 42, Z = 21, T = 1.8;
  const o = rrect(X0, Y0, X1, Y1, 0.8, 2);
  path(g, "sil", loft(P, f, [[o, 0], [o, Z]]).sil);
  path(g, "", poly([P(X0 + T, Y0 + T, Z), P(X1 - T, Y0 + T, Z), P(X1 - T, Y1 - T, Z), P(X0 + T, Y1 - T, Z)]));
  const layer = mk("g", {}, g);
  for (const [a, b] of [[0.5, 6.5], [7.6, 13.6], [14.7, 20.7]]) {
    add(g, box(P, f, X0, Y1 - T, X1, Y1, a, b, 0.3));
    add(g, box(P, f, X1 - T, Y0, X1, Y1, a, b, 0.3));
  }
  for (const [x0, y0] of [[X1 - 2.4, Y0 - 0.3], [X0 - 0.3, Y1 - 2.4], [X1 - 2.4, Y1 - 2.4]]) add(g, box(P, f, x0, y0, x0 + 2.7, y0 + 2.7, 0, Z + 0.6, 0.3));
  // the heap: [x, y, z, kind] t tomato, o onion, c cabbage
  const H = [];
  const k1 = "tototctoototoottott";
  [12, 20, 28, 36].forEach((y, r) => [10, 19, 28, 37, 46].forEach((x, c) => H.push([x, y, 18, k1[r * 5 + c] || "t"])));
  H[1][3] = "c"; H[1][2] = 20; H[3][3] = "c"; H[3][2] = 20;
  for (const [x, y, z, k] of [[14.5, 16, 24.5, "o"], [32.5, 16, 25, "t"], [41.5, 17, 24, "t"], [19, 24, 26, "t"], [28, 24, 27.5, "o"], [37, 25, 26, "t"], [23.5, 32, 25, "t"], [32.5, 32, 25, "o"], [27, 20, 32, "t"]]) H.push([x, y, z, k]);
  const items = H.map((h, i) => ({ c: [h[0] + (rnd(i) - 0.5) * 1.4, h[1] + (rnd(i * 3) - 0.5) * 1.4, h[2]], k: h[3], i, top: h[2] > 23, r: h[3] === "c" ? 7.6 : h[3] === "o" ? 5.4 : 5 }))
    .sort((p, q) => vdot(p.c) - vdot(q.c));
  for (const it of items) {
    it.o = path(layer, "");
    it.d = path(layer, "nf");
    it.l = path(layer, "nf lo");
    if (it.k === "o") fine.push(it.l);
  }
  const drawItem = (it, z) => {
    const [x, y] = it.c, r = it.r, c = P(x, y, z), R = r * S;
    if (it.k === "o") {
      const p = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, m = R * (1 + 0.5 * Math.max(0, -Math.sin(a)) ** 14); p.push([c[0] + m * Math.cos(a), c[1] + m * Math.sin(a)]); }
      setD(it.o, poly(p));
      const tp = [c[0], c[1] - R * 1.5];
      setD(it.d, seg(tp, [c[0] + R * 0.12, c[1] - R * 1.85]));
      setD(it.l, quad(tp, [c[0] - R * 0.9, c[1]], [c[0], c[1] + R]) + quad(tp, [c[0] + R * 0.9, c[1]], [c[0], c[1] + R]));
    } else if (it.k === "c") {
      setD(it.o, disc(c, R));
      setD(it.d, quad([c[0] - R * 0.85, c[1] + R * 0.1], [c[0] - R * 0.1, c[1] - R * 1.05], [c[0] + R * 0.8, c[1] - R * 0.3]) + quad([c[0] - R * 0.6, c[1] + R * 0.55], [c[0] + R * 0.2, c[1] - R * 0.35], [c[0] + R * 0.9, c[1] + R * 0.25]));
      setD(it.l, seg([c[0] - R * 0.2, c[1] - R * 0.5], [c[0] + R * 0.1, c[1] + R * 0.7]));
    } else {
      setD(it.o, disc(c, R));
      const top = P(x, y, z + r * 0.97), st = [];
      for (let k = 0; k < 5; k++) { const a = k * 1.2566 + it.i; st.push(`M${pt(top)}L${pt(P(x + 0.5 * r * Math.cos(a), y + 0.5 * r * Math.sin(a), z + r * 0.84))}`); }
      setD(it.d, st.join(""));
    }
  };
  return {
    draw(t) { for (const it of items) drawItem(it, it.c[2] + (it.top ? t * (2 + 2.2 * rnd(it.i * 9)) : 0)); },
    say: (d) => `the top of the heap lifts · ${Math.round(d * 100)}%`,
  };
});

/* ======================================================================
 * 5. Olives and pickles: a glass jar of stuffed olives in brine, a screw lid,
 * an olive sprig on the plinth. Drive: the lid lifts and tips open.
 * ==================================================================== */
export const oliveJar = figure("olivejar", "A glass jar of olives in brine with a screw lid, an olive sprig lying beside it.", [3, 4, 72, 57, [22, 20, 42]], ({ g, P, f, S, fine }) => {
  const cx = 22, cy = 20, R = 11;
  // the sprig first: it lies on the plinth in front
  const br = [[37, 50], [48, 42], [58, 37], [67, 29]];
  path(g, "nf", quad(P(br[0][0], br[0][1], 0.5), P(50, 44, 0.5), P(br[3][0], br[3][1], 0.5)));
  for (let i = 0; i < 7; i++) {
    const t = 0.1 + i * 0.13, b = [37 + 30 * t, 50 - 21 * t], lf = leaf(P, b, -0.62 + (i % 2 ? 0.75 : -0.75) + (rnd(i) - 0.5) * 0.3, 9, 1.5, 0.6);
    path(g, "", lf.o); fine.push(path(g, "nf lo", lf.rib));
  }
  const ol = (c, a, cls) => { path(g, cls, ell(c, 3.2 * S, 2.25 * S, a)); };
  ol(P(50, 46, 2.2), 0.3, "");
  ol(P(59, 41, 2.2), -0.2, "");
  ol(P(36, 33, 2.2), 0.1, "");
  ol(P(28, 39, 2.2), 0.5, "");
  // the jar: glass body, olives seen through it, brine line, glints
  add(g, loft(P, f, [[ring(cx, cy, R - 0.8), 0], [ring(cx, cy, R), 1.4], [ring(cx, cy, R), 26], [ring(cx, cy, R - 1.6), 29.5]]), "nf lo");
  path(g, "nf lo", arc(P, f, cx, cy, R - 0.7, 26.6, 1) + arc(P, f, cx, cy, R - 0.6, 1.9));
  const olv = [];
  [4.6, 9.4, 14.2, 19, 23.4].forEach((z, r) => { for (let k = 0; k < 6; k++) { const a = ((-32 + k * 30 + (r % 2) * 14) * Math.PI) / 180, q = R * 0.7; olv.push([cx + q * Math.cos(a), cy + q * Math.sin(a), z + (rnd(k + r * 6) - 0.5) * 1.2, rnd(k * 3 + r)]); } });
  olv.sort((p, q) => vdot(p) - vdot(q));
  const od = [], pd = [];
  for (const o of olv) {
    const c = P3(P, o), a = (o[3] - 0.5) * 1.4, rx = 3.1 * S;
    od.push(ell(c, rx, 2.15 * S, a));
    if (o[3] > 0.45) pd.push(disc([c[0] + Math.cos(a) * rx * 0.7, c[1] + Math.sin(a) * rx * 0.7], 0.75 * S));
  }
  // drawn one by one so each covers the one behind
  for (const d of od) path(g, "", d);
  path(g, "nf", pd.join(""));
  const gl = (deg, z0, z1) => { const a = (deg * Math.PI) / 180; return seg(P(cx + R * 0.97 * Math.cos(a), cy + R * 0.97 * Math.sin(a), z0), P(cx + R * 0.97 * Math.cos(a), cy + R * 0.97 * Math.sin(a), z1)); };
  path(g, "nf lo", gl(98, 5, 22) + gl(110, 9, 17) + arc(P, f, cx, cy, R, 26.6));
  add(g, cyl(P, f, cx, cy, 8.6, 29.3, 32.6));
  fine.push(path(g, "nf lo", arc(P, f, cx, cy, 8.6, 30.6) + arc(P, f, cx, cy, 8.6, 31.6)));
  path(g, "nf", arc(P, f, cx, cy, 7.6, 32.6, 1));
  const lid = sol(g), top = path(g, "nf lo"), knurl = path(g, "nf lo");
  fine.push(knurl);
  const AX = [Math.SQRT1_2, -Math.SQRT1_2, 0], r0 = ring(cx, cy, 9.3), r1 = ring(cx, cy, 7.4);
  return {
    draw(t) {
      const h = 3.2 * t, o = [cx, cy, 35 + h], tf = (u, v, z) => P3(P, rot([u, v, z + h], o, AX, -0.22 * t)), pts = [], kn = [];
      for (const q of r0) pts.push(tf(q.u, q.v, 32.3), tf(q.u, q.v, 37));
      put2(lid, { sil: poly(hull(pts)), crease: open(run(r0, f).map((q) => tf(q.u, q.v, 37))) });
      setD(top, poly(r1.map((q) => tf(q.u, q.v, 37))));
      r0.forEach((q, i) => { if (i % 2 && q.nu + q.nv > 0.2) kn.push(seg(tf(q.u, q.v, 33), tf(q.u, q.v, 36.3))); });
      setD(knurl, kn.join(""));
    },
    say: (d) => `lid lifts · ${Math.round(d * 32)} mm`,
  };
});

/* ======================================================================
 * 6. Chocolate: three wrapped bars stacked; on top, an opened tablet of
 * 3 x 6 raised segments lying in its paper, the wrapper flap folded back
 * behind it; one loose two-segment piece on the plinth.
 * Drive: the wrapper flap folds further back.
 * ==================================================================== */
export const chocolate = figure("chocolate", "Three wrapped chocolate bars stacked, the top one opened to show its segments, with a loose piece beside them.", [-3, -2, 63, 46, [30, 15, 14], [-6, 15, 22]], ({ g, P, f, fine }) => {
  const wrap = (x0, y0, x1, y1, z0, z1) => {
    add(g, box(P, f, x0, y0, x1, y1, z0, z1, 0.6));
    const fx = onX(P, x1), zm = (z0 + z1) / 2;
    path(g, "nf lo", open([fx(y0, z0), fx(y0 + 3, zm), fx(y0, z1)]) + open([fx(y1, z0), fx(y1 - 3, zm), fx(y1, z1)]) + L(fx, y0 + 3, zm, y1 - 3, zm));
    fine.push(path(g, "nf lo", L(onY(P, y1), x0 + 1, zm, x1 - 1, zm)));
  };
  wrap(1, 14, 49, 34, 0, 4.2);
  wrap(3, 9, 51, 29, 4.2, 8.4);
  wrap(5, 4, 53, 24, 8.4, 12.6);
  // segments with real relief: a bevelled block per segment, near ones last
  const segs = (x0, y0, nx, ny, z, cw, rw, p) => {
    const out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([i, j]);
    out.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [i, j] of out) {
      const a0 = x0 + i * cw + 0.5, b0 = y0 + j * rw + 0.5, a1 = a0 + cw - 1, b1 = b0 + rw - 1, top = rrect(a0 + 1.1, b0 + 1.1, a1 - 1.1, b1 - 1.1, 0.5, 2);
      add(p, loft(P, f, [[rrect(a0, b0, a1, b1, 0.5, 2), z], [top, z + 1.6]]), "nf");
      path(p, "nf lo", poly(top.map((q) => P(q.u, q.v, z + 1.6))) + seg(P(a1 - 0.15, b1 - 0.15, z), P(a1 - 1.25, b1 - 1.25, z + 1.6)));
    }
  };
  const flap = sol(g, "nf lo"), foil = path(g, "nf");
  // the open paper under the tablet, then the tablet and its 3 x 6 segments
  add(g, box(P, f, 5.6, 4.6, 53.4, 23.4, 12.6, 13.2, 0.4));
  add(g, box(P, f, 8, 6, 51, 22, 13.2, 15.4, 0.5));
  segs(8, 6, 6, 3, 15.4, 43 / 6, 16 / 3, g);
  // the loose piece on the plinth
  add(g, box(P, f, 40, 33, 40 + 2 * (43 / 6), 33 + 16 / 3, 0, 2.4, 0.4));
  segs(40, 33, 2, 1, 2.4, 43 / 6, 16 / 3, g);
  const LF = 15, Y0 = 4.4, Y1 = 23.6, H = 5.6, Z = 13;
  return {
    draw(t) {
      const th = ((58 + 30 * Math.min(t, 1.3)) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
      const W = (a, y) => P(H - a * c, y, Z + a * s), pts = [];
      for (const y of [Y0, Y1]) for (const a of [0, LF]) pts.push(W(a, y), P(H - a * c - 0.6 * s, y, Z + a * s - 0.6 * c));
      put2(flap, { sil: poly(hull(pts)), crease: poly([W(1.2, Y0 + 1.2), W(1.2, Y1 - 1.2), W(LF - 2.4, Y1 - 1.2), W(LF - 2.4, Y0 + 1.2)]) });
      const fz = [];
      for (let k = 0; k <= 12; k++) fz.push(W(LF - 1.2 - (k % 2 ? 0.9 : 0) - rnd(k) * 0.4, Y0 + 0.6 + (k * (Y1 - Y0 - 1.2)) / 12));
      setD(foil, open(fz));
    },
    say: (d) => `wrapper folds back · ${Math.round(58 + 30 * d)}°`,
  };
});

/* ======================================================================
 * 7. Beverages and grocery: a taped carton with three cans and a bottle on it.
 * Drive: the bottle cap twists and lifts. Bright: the cap.
 * ==================================================================== */
export const groceryCarton = figure("grocerycarton", "A taped cardboard carton with three cans and a bottle standing on it.", [-7, -1, 57, 49, [12, 17, 54]], ({ g, P, f, S, fine }) => {
  add(g, box(P, f, 0, 6, 50, 42, 0, 20, 0.6));
  path(g, "nf", [22.5, 25.5].map((y) => open([P(0.5, y, 20), P(50, y, 20), P(50, y, 13)])).join("") + seg(P(50, 22.5, 13), P(50, 25.5, 13)));
  fine.push(path(g, "nf lo", seg(P(0.5, 24, 20), P(50, 24, 20))));
  path(g, "nf", RR(onY(P, 42), rrect(19, 13, 29, 16, 1.4, 3)));
  const can = (x, y) => {
    add(g, loft(P, f, [[ring(x, y, 4.4), 20], [ring(x, y, 5), 21.2], [ring(x, y, 5), 31.6], [ring(x, y, 4.3), 33]]));
    path(g, "nf lo", arc(P, f, x, y, 3.6, 32.7, 1) + arc(P, f, x, y, 5, 24.6) + arc(P, f, x, y, 5, 29.2));
    fine.push(path(g, "nf", RR(onZ(P, 32.7), rrect(x + 0.4, y - 1.1, x + 2.6, y + 1.1, 0.6, 2))));
  };
  const bx = 12, by = 17;
  add(g, loft(P, f, [[ring(bx, by, 4.2), 20], [ring(bx, by, 4.7), 21], [ring(bx, by, 4.7), 36.5]]));
  path(g, "nf", arc(P, f, bx, by, 4.7, 25) + arc(P, f, bx, by, 4.7, 32.5));
  add(g, loft(P, f, [[ring(bx, by, 4.7), 36.5], [ring(bx, by, 1.9), 42]]));
  add(g, cyl(P, f, bx, by, 1.9, 42, 46.4));
  add(g, cyl(P, f, bx, by, 2.3, 46.4, 47.2));
  path(g, "nf", arc(P, f, bx, by, 1.5, 47.2, 1));
  const cap = sol(g, "nf", "hi"), kn = path(g, "nf lo");
  can(25, 14); can(24, 29); can(38, 25);
  return {
    draw(t) {
      const z0 = 47.4 + 2.6 * t;
      put2(cap, cyl(P, f, bx, by, 2.25, z0, z0 + 3.2, 20));
      const k = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t * 1.3, nu = Math.cos(a), nv = Math.sin(a); if (nu + nv > 0.15) k.push(seg(P(bx + 2.25 * nu, by + 2.25 * nv, z0 + 0.5), P(bx + 2.25 * nu, by + 2.25 * nv, z0 + 2.7))); }
      setD(kn, k.join(""));
    },
    say: (d) => `cap twists off · ${Math.round(d * 100)}%`,
  };
});

/* ======================================================================
 * 8. Household and personal care: a pump bottle, a bar of soap on a dish,
 * a few bubbles. Drive: the pump presses and the bubbles rise.
 * Bright: the pump head.
 * ==================================================================== */
export const household = figure("household", "A pump bottle and a bar of soap on a dish, with a few bubbles.", [0, 1, 70, 53, [16, 16, 41]], ({ g, P, f, S, fine }) => {
  const cx = 16, cy = 16;
  add(g, loft(P, f, [[ring(cx, cy, 8), 0], [ring(cx, cy, 8.4), 1], [ring(cx, cy, 8.4), 24], [ring(cx, cy, 7.4), 27.4], [ring(cx, cy, 4.4), 30]]));
  path(g, "nf", arc(P, f, cx, cy, 8.4, 7) + arc(P, f, cx, cy, 8.4, 19));
  add(g, cyl(P, f, cx, cy, 3.6, 29.6, 33.4));
  const rb = [];
  ring(cx, cy, 3.6, 16).forEach((q) => { if (q.nu + q.nv > 0.2) rb.push(seg(P(q.u, q.v, 30.2), P(q.u, q.v, 32.8))); });
  fine.push(path(g, "nf lo", rb.join("")));
  const stem = sol(g), head = sol(g, "nf", "hi"), noz = sol(g, "nf", "hi"), tip = sol(g);
  // the dish and the soap
  add(g, loft(P, f, [[rrect(29, 24, 63, 46, 6, 3), 0], [rrect(29, 24, 63, 46, 6, 3), 1.4], [rrect(30, 25, 62, 45, 5, 3), 2.2]]));
  fine.push(path(g, "nf lo", [33, 38, 43, 48, 53, 58].map((x) => seg(P(x, 26.5, 2.2), P(x, 43.5, 2.2))).join("")));
  add(g, loft(P, f, [[rrect(33, 27.5, 58, 42.5, 4.5, 3), 2.2], [rrect(33, 27.5, 58, 42.5, 4.5, 3), 7.4], [rrect(34.4, 28.9, 56.6, 41.1, 3.3, 3), 9]]));
  path(g, "nf lo", RR(onZ(P, 9), rrect(38, 31.5, 52.6, 38.5, 3, 3)));
  const BB = [[44, 32, 15, 2.5], [53, 36, 19, 2], [48, 31, 25, 1.6], [55, 43, 26, 2.9], [61, 32, 23, 1.8]];
  const bub = BB.map(() => [path(g, "nf"), path(g, "nf lo")]);
  return {
    draw(t) {
      const p = 1.8 * Math.min(t, 1.2), zh = 36.8 - p;
      put2(stem, cyl(P, f, cx, cy, 0.9, 33.4, zh, 12));
      put2(head, cyl(P, f, cx, cy, 2.7, zh, zh + 2.9, 20));
      put2(noz, box(P, f, cx + 1.8, cy - 0.9, cx + 8.4, cy + 0.9, zh + 1.4, zh + 2.7, 0.4));
      put2(tip, cyl(P, f, cx + 7.8, cy, 0.6, zh + 0.2, zh + 1.5, 10));
      BB.forEach(([x, y, z, r], i) => {
        const c = P(x - t * 1.5, y, z + t * (5 + 3 * rnd(i))), R = r * S * (0.85 + 0.25 * t);
        setD(bub[i][0], disc(c, R));
        setD(bub[i][1], `M${pt([c[0] - R * 0.6, c[1] - R * 0.15])}A${r2(R * 0.62)} ${r2(R * 0.62)} 0 0 1 ${pt([c[0] - R * 0.1, c[1] - R * 0.62])}`);
      });
    },
    say: (d) => `pump presses · bubbles rise ${Math.round(d * 100)}%`,
  };
});

/* ======================================================================
 * 9. Furniture: a classic armchair, arched back, scrolled arms, turned legs.
 * Drive: the seat cushion plumps up. Bright: the near arm's scroll.
 * ==================================================================== */
export const armchair = figure("armchair", "A classic upholstered armchair with an arched back, scrolled arms and turned legs.", [5, -5, 59, 51, [13, 23, 46]], ({ g, P, f, fine }) => {
  const ox = 12, oy = 2, D = 38, W = 42;
  const prof = [[0, 0.9], [1.2, 1.25], [2.7, 1.8], [4, 0.95], [5.2, 1.05], [6.2, 1.6], [7.4, 1.6]];
  const legs = [[ox + 3.5, oy + 3.5], [ox + 3.5, oy + W - 3.5], [ox + D - 3.5, oy + 3.5], [ox + D - 3.5, oy + W - 3.5]].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [x, y] of legs) for (let i = 1; i < prof.length; i++) add(g, loft(P, f, [[ring(x, y, prof[i - 1][1], 16), prof[i - 1][0]], [ring(x, y, prof[i][1], 16), prof[i][0]]]), "nf lo");
  add(g, box(P, f, ox, oy, ox + D, oy + W, 7.4, 14, 1.5));
  const fx = onX(P, ox + D), fy = onY(P, oy + W);
  path(g, "nf lo", quad(fx(oy + 3, 8.2), fx(oy + W / 2, 12.6), fx(oy + W - 3, 8.2)) + quad(fy(ox + 3, 8.2), fy(ox + D / 2, 12), fy(ox + D - 3, 8.2)));
  // the back: an arched panel, leaning back a little
  const bx = (z) => ox + (z - 14) * 0.15, BT = 5.5, arch = (inset) => {
    const pr = [[oy + inset, 14 + inset * 0.6], [oy + W - inset, 14 + inset * 0.6]];
    for (let k = 0; k <= 14; k++) { const s = k / 14; pr.push([oy + W - inset - (W - 2 * inset) * s, 35 - inset * 0.4 + (9 - inset * 0.5) * Math.sin(Math.PI * s) ** 0.7]); }
    return pr;
  };
  const pr = arch(0);
  path(g, "sil", poly(hull(pr.flatMap(([y, z]) => [P(bx(z), y, z), P(bx(z) + BT, y, z)]))));
  path(g, "nf", poly(pr.map(([y, z]) => P(bx(z) + BT, y, z))));
  fine.push(path(g, "nf lo", poly(arch(3).map(([y, z]) => P(bx(z) + BT, y, z)))));
  const arm = (y0, y1, hot) => {
    const q = rrect(ox + 6, 14, ox + D + 1, 27.5, 4.5, 3), A = (y) => q.map((p) => P(p.u, y, p.v));
    add(g, { sil: poly(hull(A(y0).concat(A(y1)))), crease: poly(A(y1)) });
    path(g, hot ? "nf hi" : "nf", RR(onX(P, ox + D + 1), ring((y0 + y1) / 2, 21.4, 2, 16)) + disc(P(ox + D + 1, (y0 + y1) / 2, 21.4), 0.8));
  };
  arm(oy, oy + 6.5, 0);
  const cush = sol(g), pipe = path(g, "nf lo");
  arm(oy + W - 6.5, oy + W, 1);
  return {
    draw(t) {
      const z1 = 19.2 + 1.8 * Math.min(t, 1.3), x0 = ox + 6, y0 = oy + 6.5, x1 = ox + D + 0.6, y1 = oy + W - 6.5;
      put2(cush, loft(P, f, [[rrect(x0, y0, x1, y1, 2.2, 3), 14], [rrect(x0, y0, x1, y1, 2.2, 3), z1 - 1], [rrect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 1.6, 3), z1]]));
      setD(pipe, L(onX(P, x1), y0 + 2, (14 + z1) / 2, y1 - 2, (14 + z1) / 2));
    },
    say: (d) => `the cushion plumps up · ${Math.round(d * 100)}%`,
  };
});
