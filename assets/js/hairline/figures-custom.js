/**
 * hairline-custom: three new figures (truck, pallet, ship) for the Hairline
 * engine by Lucas Marques (MIT, see LICENSE). New code, written for this
 * recipe. It uses the engine's own pieces, re-exported by the block at the end
 * of hairline-ext.js: `create` (the mount wrapper: svg, label, theme, onRead,
 * update, destroy), the camera and solids from core/iso, springs from
 * core/motion, and register/pointer/disposer from core/stage. So these figures
 * share the originals' frame loop, pointer handling and stylesheet.
 *
 * One function, `bar`, is adapted from upstream's vault figure (a solid along
 * any axis); it is marked where it sits.
 *
 * World units, camera Cam(45, 0.5): x and y on the ground, z up. The viewer
 * sees the +x face (right front), the +y face (left front) and the top.
 * Plates are filled with the ground colour and painted back to front.
 * Line strength carries depth: .sil (edge) for outlines, plain (mid) for
 * parts, .lo for fine detail, .hi for the one bright thing.
 */
import { core } from "./hairline-core.js";

const {
  create, TABLE, clamp, lerp, rad, r2, poly, seg, open, Cam, proj, unproj, fit, rrect, circ, hull,
  ringAt, facing, run, prism, rings, spring, stepS, reducedMotion, mk, solid, put, register, pointer, disposer,
} = core;

/* Each figure's number at intensity 0, 0.5 and 1 (the engine reads this table). */
TABLE.truck = [10, 22, 34];   // reach, world units the truck may drive from rest
TABLE.pallet = [6, 14, 24];   // gap, world units a lifted layer rises
TABLE.ship = [1.2, 2.6, 4.2]; // swell, world units of wave height the pointer raises

/* ---------- shared drawing helpers (new) ---------- */

/** Toward the viewer for Cam(45, 0.5): a face whose normal has a positive dot with it is seen. */
const V = [Math.SQRT1_2 * Math.sqrt(0.75), Math.SQRT1_2 * Math.sqrt(0.75), 0.5];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

/** Adapted from upstream's vault.ts `bar`: a rounded solid along axis e, its section `ring` in the (a, b) plane. */
function bar(P, o, e, a, b, ring, inner, s0, s1) {
  const at = (q, s) => P(
    o[0] + e[0] * s + a[0] * q.u + b[0] * q.v,
    o[1] + e[1] * s + a[1] * q.u + b[1] * q.v,
    o[2] + e[2] * s + a[2] * q.u + b[2] * q.v,
  );
  const seen = (q) => [0, 1, 2].reduce((t, i) => t + (a[i] * q.nu + b[i] * q.nv) * V[i], 0) > 0;
  return {
    sil: poly(hull(ring.map((q) => at(q, s0)).concat(ring.map((q) => at(q, s1))))),
    crease: inner ? open(run(inner, seen).map((q) => at(q, s1))) : "",
  };
}

/** Points on a face plane: (u, v) to the screen. onY: u = x, v = z. onX: u = y, v = z. onZ: u = x, v = y. */
const onY = (P, y) => (u, v) => P(u, y, v);
const onX = (P, x) => (u, v) => P(x, u, v);
const onZ = (P, z) => (u, v) => P(u, v, z);
const L = (f, u0, v0, u1, v1) => seg(f(u0, v0), f(u1, v1));
const RECT = (f, u0, v0, u1, v1) => poly([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]);
const RR = (f, ring) => poly(ring.map((q) => f(q.u, q.v)));
const ARC = (f, cu, cv, r, a0, a1, n = 24) =>
  open(Array.from({ length: n + 1 }, (_, k) => { const a = rad(a0 + ((a1 - a0) * k) / n); return f(cu + r * Math.cos(a), cv + r * Math.sin(a)); }));
const RING = (f, cu, cv, r, n = 36) =>
  poly(Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return f(cu + r * Math.cos(a), cv + r * Math.sin(a)); }));
/** Many small round dots in one path (class "dot ..."): cheaper than one element each. */
const DOTS = (pts, r) => pts.map(([x, y]) => `M${r2(x - r)} ${r2(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join("");

/** A loft: the silhouette of several flat rings at their heights (all convex). */
const loft = (P, layers) => poly(hull(layers.flatMap(([ring, z]) => ringAt(P, ring, z))));

/** A part made of named paths, appended in order to a group: e.g. part(g, ["sil", "nf lo", "nf"]). */
function part(parent, classes) {
  const g = mk("g", {}, parent);
  return { g, p: classes.map((c) => mk("path", { class: c }, g)) };
}
const setD = (el, d) => { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } };

/** Clip the segment a-b to the box [u0,u1]x[v0,v1] (Liang-Barsky). Null when nothing is left. */
function clipSeg(a, b, u0, v0, u1, v1) {
  let t0 = 0, t1 = 1;
  const du = b[0] - a[0], dv = b[1] - a[1];
  for (const [p, q] of [[-du, a[0] - u0], [du, u1 - a[0]], [-dv, a[1] - v0], [dv, v1 - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  if (t1 - t0 < 1e-3) return null;
  return [[a[0] + du * t0, a[1] + dv * t0], [a[0] + du * t1, a[1] + dv * t1]];
}

/**
 * A timber crate's marks on one face (u0..u1 by v0..v1 on face f): the inner
 * edge of the batten frame, a diagonal brace (two lines) and planks broken
 * where the brace crosses them. `flip` turns the brace the other way.
 */
function crateFace(f, u0, v0, u1, v1, { bw = 2.2, pitch = 5, flip = false, brace = true } = {}) {
  const a0 = u0 + bw, a1 = u1 - bw, b0 = v0 + bw, b1 = v1 - bw, lo = [], mid = [];
  if (a1 - a0 < 2 || b1 - b0 < 2) return { lo: "", mid: "" };
  mid.push(RECT(f, a0, b0, a1, b1));
  const A = flip ? [a1, b0] : [a0, b0], B = flip ? [a0, b1] : [a1, b1];
  const du = B[0] - A[0], dv = B[1] - A[1], len = Math.hypot(du, dv), hw = 1.05;
  const nu = (-dv / len) * hw, nv = (du / len) * hw, ext = 6;
  const eu = (du / len) * ext, ev = (dv / len) * ext;
  if (brace) for (const s of [-1, 1]) {
    const c = clipSeg([A[0] + s * nu - eu, A[1] + s * nv - ev], [B[0] + s * nu + eu, B[1] + s * nv + ev], a0, b0, a1, b1);
    if (c) mid.push(L(f, c[0][0], c[0][1], c[1][0], c[1][1]));
  }
  const half = brace ? Math.abs((hw * len) / dv) : 0;
  for (let v = b0 + pitch; v < b1 - 0.8; v += pitch) {
    const uc = A[0] + ((v - A[1]) / dv) * du;
    if (!brace) { lo.push(L(f, a0, v, a1, v)); continue; }
    if (uc - half > a0 + 0.3) lo.push(L(f, a0, v, Math.min(a1, uc - half), v));
    if (uc + half < a1 - 0.3) lo.push(L(f, Math.max(a0, uc + half), v, a1, v));
  }
  return { lo: lo.join(""), mid: mid.join("") };
}

/** A whole crate: solid, then batten frames, braces and planks on its two seen sides and lid, and nail heads. */
function crateDraw(P, front, x0, y0, x1, y1, z0, z1, o = {}) {
  const [rg, ig] = rings(x0, y0, x1, y1, 1.1, 0.5);
  const s = prism(P, front, rg, ig, z0, z1), bw = o.bw ?? 2.2;
  const fy = crateFace(onY(P, y1), x0, z0, x1, z1, { bw, flip: false });
  const fx = crateFace(onX(P, x1), y0, z0, y1, z1, { bw, flip: true });
  const top = onZ(P, z1), lid = [RECT(top, x0 + bw, y0 + bw, x1 - bw, y1 - bw)], lidLo = [];
  for (let y = y0 + bw + 5; y < y1 - bw - 0.8; y += 5) lidLo.push(L(top, x0 + bw, y, x1 - bw, y));
  const n = 0.95, nails = [
    onY(P, y1)(x0 + n, z0 + n), onY(P, y1)(x1 - n, z0 + n), onY(P, y1)(x0 + n, z1 - n), onY(P, y1)(x1 - n, z1 - n),
    onX(P, x1)(y0 + n, z0 + n), onX(P, x1)(y0 + n, z1 - n),
  ];
  return { sil: s.sil, crease: s.crease, mid: fy.mid + fx.mid + lid.join(""), lo: fy.lo + fx.lo + lidLo.join(""), dots: DOTS(nails, 0.42) };
}
const crateEls = (parent) => {
  const { g, p } = part(parent, ["sil", "nf lo", "nf lo", "nf", "dot m"]);
  return { g, sil: p[0], cr: p[1], lo: p[2], mid: p[3], dots: p[4] };
};
const crateSet = (el, c) => { setD(el.sil, c.sil); setD(el.cr, c.crease); setD(el.lo, c.lo); setD(el.mid, c.mid); setD(el.dots, c.dots); };

/** Ground hatching: lines along y at a fixed x pitch, inside a box on the ground. Shows only where nothing covers it. */
function hatch(P, x0, y0, x1, y1, pitch = 2.6, z = 0) {
  const out = [];
  for (let x = Math.ceil(x0 / pitch) * pitch; x <= x1; x += pitch) out.push(seg(P(x, y0, z), P(x, y1, z)));
  return out.join("");
}

/** The plinth every figure stands on: a rounded slab, as in the originals. */
function plinth(g, P, front, x0, y0, x1, y1, t = 4, r = 8) {
  const [pr, pi] = rings(x0, y0, x1, y1, r, 2);
  put(solid(g), prism(P, front, pr, pi, -t, 0));
}

/* ======================================================================
 * 1. Truck: a flatbed lorry carrying three lashed crates (one with a
 * smaller crate on it). The pointer, read on the road, is where the truck
 * wants to be: it drives there on a spring, its wheels turn with the
 * distance, and the load leans against its straps as it speeds up and
 * brakes, then settles. The crate nearest the pointer is bright.
 * At rest the headlights are the bright place. Intensity: reach.
 * ==================================================================== */

const T = {
  W: 40, RW: 8.6, TW: 7, AX: [28, 46, 122], DK0: 18.2, DK1: 21.6, ROAD: [-24, -8, 166, 55],
};
const LOAD = [
  { x0: 7, x1: 37, h: 27, n: 1 },
  { x0: 40, x1: 70, h: 23, n: 2, top: { x0: 45, x1: 65, y0: 8, y1: 32, h: 13 } },
  { x0: 73, x1: 99, h: 20, n: 3 },
];

const truckEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let reach = value, base = drive0 ?? 0; // sourcing-test-hairline: base = the driven value 0..1
  const C = Cam(45, 0.5, 1.68);
  const [rx0, ry0, rx1, ry1] = T.ROAD;
  fit(C, [[rx0, ry0, -4], [rx1, ry1, -4], [rx1, ry0, -4], [rx0, ry1, -4], [60, 20, 60], [130, 20, 58]], 200, 170);
  const P0 = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  plinth(g, P0, front, rx0, ry0, rx1, ry1, 4, 9);
  // road marks: a dashed centre line in front of the truck, and kerb ticks
  const marks = [];
  for (let x = rx0 + 8; x < rx1 - 8; x += 15) marks.push(seg(P0(x, 50, 0), P0(x + 7.5, 50, 0)));
  mk("path", { class: "nf lo", d: marks.join("") }, g);
  // the whole truck is one group: driving moves it with a transform; only the wheels and the leaning load are redrawn
  const body = mk("g", {}, g);
  const shade = mk("path", { class: "nf lo" }, body);

  // parts, painted back to front
  const farW = T.AX.map(() => part(body, ["sil", "nf lo"]));
  const chassis = part(body, ["sil", "nf lo"]);
  const deck = part(body, ["sil", "nf lo", "nf lo", "nf"]);
  const box = part(body, ["sil", "nf lo", "nf", "dot m"]);
  const tank = part(body, ["sil", "nf lo", "nf"]);
  const guard = part(body, ["nf", "nf lo"]);
  const crates = [], straps = [];
  for (const c of LOAD) {
    crates.push(crateEls(body));
    if (c.top) crates.push(crateEls(body));
    straps.push(part(body, ["nf", "", "dot m"]));
  }
  const head = part(body, ["sil", "nf lo"]);
  const exhaust = part(body, ["sil", "nf lo", "nf"]);
  const cab = part(body, ["sil", "nf lo", "nf", "nf lo", "nf", "dot m"]);
  const lights = mk("path", { class: "nf hi" }, cab.g);
  const fairing = part(body, ["sil", "nf lo"]);
  const bumper = part(body, ["sil", "nf lo", "nf lo"]);
  const mirror = part(body, ["sil", "nf"]);
  const nearW = T.AX.map(() => part(body, ["sil", "nf lo", "nf", "nf lo", "dot m"]));
  const guards = part(body, ["", "nf lo"]);
  const step = part(body, ["sil", "nf lo"]);

  const pos = spring(0, { k: 42, c: 10.5, eps: 0.02 });
  const lean = spring(0, { k: 150, c: 7, eps: 0.0004 });
  let over = null, hot = -1, moveKey = "", wheelKey = "", loadKey = "", staticDone = false;
  const o0 = P0(0, 0, 0);

  /** A wheel as a tyre (solid along y), its rim, hub and lug nuts on the seen face, and tread ticks that turn. */
  function wheel(prt, P, ax, ya, yb, ang, near) {
    const R = T.RW, cz = R, o = [ax, ya, cz];
    const t = bar(P, o, Y, X, Z, circ(R, 48), circ(R - 1.2, 48), 0, yb - ya);
    setD(prt.p[0], t.sil);
    setD(prt.p[1], t.crease);
    if (!near) return;
    const f = onY(P, yb), lo = [], mid = [];
    mid.push(RING(f, ax, cz, R * 0.6, 40));
    lo.push(RING(f, ax, cz, R * 0.5, 36), RING(f, ax, cz, R * 0.2, 20));
    // tread: ticks across the tyre where its surface faces the viewer, turning with the wheel
    for (let k = 0; k < 18; k++) {
      const a = ang + (k / 18) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      if (ca * V[0] + sa * V[2] < 0.25) continue;
      lo.push(seg(P(ax + R * ca, ya + 0.9, cz + R * sa), P(ax + R * ca, yb - 1.4, cz + R * sa)));
    }
    const nuts = [];
    for (let k = 0; k < 6; k++) { const a = -ang + (k / 6) * Math.PI * 2; nuts.push(f(ax + R * 0.34 * Math.cos(a), cz + R * 0.34 * Math.sin(a))); }
    setD(prt.p[2], mid.join(""));
    setD(prt.p[3], lo.join(""));
    setD(prt.p[4], DOTS(nuts, 0.45));
  }

  function drawLoad(Pl, W) {
    let k = 0;
    LOAD.forEach((c, i) => {
      const lit = c.n === hot;
      const z1 = T.DK1 + c.h;
      const a = crateDraw(Pl, front, c.x0, 3, c.x1, 37, T.DK1, z1);
      crateSet(crates[k], a); crates[k].sil.classList.toggle("hi", lit); k++;
      let ztop = z1, ytop0 = 3, ytop1 = 37;
      if (c.top) {
        const t = c.top, b = crateDraw(Pl, front, t.x0, t.y0, t.x1, t.y1, z1, z1 + t.h);
        crateSet(crates[k], b); crates[k].sil.classList.toggle("hi", lit); k++;
        ztop = z1 + t.h; ytop0 = t.y0; ytop1 = t.y1;
      }
      // the strap: from the deck's edge, up the near side, over the lid; a ratchet on the near side
      const xm = (c.x0 + c.x1) / 2 + (c.top ? 0 : 0), s = [];
      for (const off of [-0.7, 0.7]) {
        const x = xm + off, pts = [Pl(x, W, T.DK1 - 0.4), Pl(x, 37, z1)];
        if (c.top) pts.push(Pl(x, ytop1, z1), Pl(x, ytop1, ztop));
        pts.push(Pl(x, ytop0, ztop));
        s.push(open(pts));
      }
      setD(straps[i].p[0], s.join(""));
      // ratchet body on the strap, part way up the near side
      const fr = (t) => { const y = lerp(W, 37, t), z = lerp(T.DK1 - 0.4, z1, t); return [y, z]; };
      const [ya, za] = fr(0.18), [yb, zb] = fr(0.36);
      setD(straps[i].p[1], poly([Pl(xm - 1.7, ya, za), Pl(xm + 1.7, ya, za), Pl(xm + 1.7, yb, zb), Pl(xm - 1.7, yb, zb)]));
      setD(straps[i].p[2], DOTS([Pl(xm, (ya + yb) / 2 + 0.2, (za + zb) / 2)], 0.5));
    });

  }

  function draw() {
    const dx = pos.x, sh = lean.x, ang = -dx / T.RW;
    const P = P0, W = T.W;
    const Pl = (x, y, z) => P0(x + sh * (z - T.DK1), y, z); // the load, sheared by its lean
    const mv = dx.toFixed(2);
    if (mv !== moveKey) { moveKey = mv; const q = P0(dx, 0, 0); body.setAttribute("transform", `translate(${r2(q[0] - o0[0])} ${r2(q[1] - o0[1])})`); }
    const wk = ang.toFixed(3);
    if (wk !== wheelKey) {
      wheelKey = wk;
      T.AX.forEach((ax, i) => wheel(farW[i], P, ax, -0.5, 6.5, ang, false));
      T.AX.forEach((ax, i) => wheel(nearW[i], P, ax, 33.4, 40.6, ang, true));
    }
    const lk = sh.toFixed(4) + hot;
    if (lk !== loadKey) { loadKey = lk; drawLoad(Pl, W); }
    if (staticDone) return;
    staticDone = true;

    setD(shade, hatch(P0, 6, 2, 140, 43, 2.4));

    // chassis rails
    const [cr, ci] = rings(8, 9, 120, 31, 1, 0.5);
    const ch = prism(P, front, cr, ci, 10.5, T.DK0);
    setD(chassis.p[0], ch.sil); setD(chassis.p[1], ch.crease);

    // the flatbed: deck, its rub rail, stake pockets and the planks at its ends
    const [dr, di] = rings(3, 0, 104, W, 1.2, 0.6);
    const dk = prism(P, front, dr, di, T.DK0, T.DK1);
    setD(deck.p[0], dk.sil); setD(deck.p[1], dk.crease);
    const fy = onY(P, W), pk = [];
    for (let x = 9; x < 102; x += 11.5) pk.push(RECT(fy, x, T.DK0 + 0.7, x + 2.6, T.DK1 - 0.7));
    setD(deck.p[2], pk.join("") + L(onX(P, 104), 2, T.DK0 + 1.7, W - 2, T.DK0 + 1.7));
    setD(deck.p[3], L(fy, 4, T.DK0 + 1.7, 103, T.DK0 + 1.7));

    // tool box under the deck, with lid line and two latches
    const [br, bi] = rings(58, 31, 76, 39.5, 1, 0.5);
    const bx = prism(P, front, br, bi, 9.5, 17.2), fb = onY(P, 39.5);
    setD(box.p[0], bx.sil); setD(box.p[1], bx.crease);
    setD(box.p[2], L(fb, 59, 15.4, 75, 15.4));
    setD(box.p[3], DOTS([fb(62, 13.4), fb(72, 13.4)], 0.55));

    // fuel tank, a cylinder along x, with two straps
    const tk = bar(P, [86, 35.2, 11], X, Y, Z, circ(4.4, 36), circ(3.5, 36), 0, 16);
    setD(tank.p[0], tk.sil); setD(tank.p[1], tk.crease);
    const seen = (q) => q.nu * V[1] + q.nv * V[2] > 0, band = run(circ(4.45, 36), seen);
    setD(tank.p[2], [3.2, 12.8].map((s) => open(band.map((q) => P(86 + s, 35.2 + q.u, 11 + q.v)))).join(""));

    // side guard between the axles
    const fg = onY(P, 39.6);
    setD(guard.p[0], L(fg, 56, 11.2, 84.5, 11.2) + L(fg, 56, 15, 84.5, 15));
    setD(guard.p[1], [58, 70, 82].map((x) => L(fg, x, 11.2, x, T.DK0)).join(""));

    // headboard behind the cab, with its rails
    const [hr, hi] = rings(101, 1, 104, 39, 0.8, 0.4);
    const hb = prism(P, front, hr, hi, T.DK1, 46);
    setD(head.p[0], hb.sil); setD(head.p[1], hb.crease);

    // exhaust stack
    const ex = bar(P, [104.8, 36.4, 0], Z, X, Y, circ(1.5, 20), circ(1.0, 20), 20, 57);
    setD(exhaust.p[0], ex.sil); setD(exhaust.p[1], ex.crease);
    const ring2 = run(circ(1.55, 20), (q) => q.nu * V[0] + q.nv * V[1] > 0);
    setD(exhaust.p[2], [30, 46].map((z) => open(ring2.map((q) => P(104.8 + q.u, 36.4 + q.v, z)))).join(""));

    // the cab: a loft with a raked windscreen
    const cx0 = 106, cx1 = 139, cy0 = 1, cy1 = 39, zb0 = 13, zw = 33, zt = 50, rake = 4.5;
    const lower = rrect(cx0, cy0, cx1, cy1, 4, 4), upper = rrect(cx0, cy0 + 0.6, cx1 - rake, cy1 - 0.6, 4, 4);
    setD(cab.p[0], loft(P, [[lower, zb0], [lower, zw], [upper, zt]]));
    setD(cab.p[1], open(ringAt(P, run(rrect(cx0 + 1.4, cy0 + 2, cx1 - rake - 1.4, cy1 - 2, 2.6, 4), front), zt)) + open(ringAt(P, run(lower, front), zw)));
    const fs = onY(P, cy1), ff = onX(P, cx1);
    // windscreen on the raked face: u across (y), t up the rake
    const ws = (y, t) => P(cx1 - rake * t - 0.05, y, zw + (zt - zw) * t);
    const glass = rrect(5, 0.14, 35, 0.88, 0.07, 3).map((q) => ws(q.u, q.v));
    // door, its window, handle and the wheel arch
    const door = [RR(fs, rrect(111, 15, 130.5, 47, 2, 3))];
    const win = RR(fs, rrect(113, 35, 129, 46, 2.4, 3));
    const arch = ARC(fs, 122, T.RW, 11.4, 22, 158, 26);
    setD(cab.p[2], poly(glass) + door.join("") + arch);
    setD(cab.p[3], win + L(fs, 126, 31.5, 129, 31.5) + seg(ws(9, 0.14), ws(17, 0.04)) + seg(ws(22, 0.14), ws(30, 0.04))
      + RR(ff, rrect(9, 17, 31, 29, 1.2, 3)));
    const grille = [];
    for (let z = 19; z < 28; z += 2) grille.push(L(ff, 11, z, 29, z));
    setD(cab.p[4], grille.join("") + L(fs, 107.5, 33, 137, 33));
    setD(cab.p[5], DOTS([12, 16, 20, 24, 28].map((y) => P(cx1 - rake - 0.6, y, zt - 0.2)), 0.5));
    setD(lights, RR(ff, rrect(2.5, 18.5, 7.5, 23, 1.2, 3)) + RR(ff, rrect(32.5, 18.5, 37.5, 23, 1.2, 3)));

    // roof fairing
    const f0 = rrect(110, 5, 133, 35, 5, 4), f1 = rrect(116, 8, 131, 32, 4, 4);
    setD(fairing.p[0], loft(P, [[f0, zt], [f1, zt + 7]]));
    setD(fairing.p[1], open(ringAt(P, run(rrect(117.4, 9.4, 129.6, 30.6, 3, 4), front), zt + 7)));

    // bumper
    const [ur, ui] = rings(135.5, 0, 141.5, W, 1.4, 0.6);
    const bu = prism(P, front, ur, ui, 9.5, 15);
    setD(bumper.p[0], bu.sil); setD(bumper.p[1], bu.crease);
    setD(bumper.p[2], L(onX(P, 141.5), 3, 12.2, W - 3, 12.2));

    // mirror on its arm
    const [mr, mi] = rings(138.6, 41.2, 140.2, 45, 0.6, 0.3);
    const mm = prism(P, front, mr, mi, 33, 43);
    setD(mirror.p[0], mm.sil);
    setD(mirror.p[1], seg(P(137, 39, 41), P(139.4, 42, 41)) + seg(P(137, 39, 35), P(139.4, 42, 35)));

    // rear mudguards over the tandem, in front of the wheels
    // each a curved plate: its near edge and far edge as arcs, the surface between them filled
    // one tandem fender over both rear wheels: an arc over each, joined flat across the top
    const arc = (ax, y, a0, a1) => Array.from({ length: 13 }, (_, k) => { const a = rad(a0 + ((a1 - a0) * k) / 12); return P(ax + 10.4 * Math.cos(a), y, T.RW + 10.4 * Math.sin(a)); });
    const edge = (y) => arc(28, y, 172, 90).concat(arc(46, y, 90, 8));
    setD(guards.p[0], poly(edge(41.4).concat(edge(34.4).reverse())));
    setD(guards.p[1], open(edge(39.8).slice(2, -2)));

    // the cab step under the door
    const [sr, si] = rings(106.4, 36.5, 112.8, 40.5, 0.8, 0.4);
    const stp = prism(P, front, sr, si, 8.4, 10.6);
    setD(step.p[0], stp.sil); setD(step.p[1], stp.crease);
  }

  const B = register(stage, (dt) => {
    let m = stepS(pos, dt);
    const acc = (-pos.k * (pos.x - pos.t) - pos.c * pos.v) / pos.m;
    lean.t = clamp(-acc * 0.00011, -0.075, 0.075);
    if (stepS(lean, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);

  function aim() {
    if (over) {
      pos.t = clamp(over[0] - 72, -reach, reach);
      let best = 1e9; hot = -1;
      if (over[1] > -16 && over[1] < 60) for (const c of LOAD) {
        const d = Math.abs((c.x0 + c.x1) / 2 + pos.x - over[0]);
        if (d < best && d < 30) { best = d; hot = c.n; }
      }
    } else { pos.t = base * reach; hot = -1; }
    lights.setAttribute("class", over || base > 0.02 ? "nf" : "nf hi");
    const m = pos.t / 16;
    read.textContent = over || base > 0.02 ? `drive ${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(1)} m` + (hot > 0 ? ` · crate 0${hot}` : "") : "rest";
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], 0); aim(); },
    leave: () => { over = null; aim(); },
  }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { reach = v; aim(); }, drive: (v) => { base = v ?? 0; aim(); }, destroy: bag.dispose };
};

/* ======================================================================
 * 2. Pallet: a timber pallet (boards, blocks and stringers, as built)
 * carrying two layers: banded crates and filled sacks. The pointer's height
 * picks a layer; it and everything above it rise clear, so the top of what
 * is under it shows: the bare deck boards and their nails, or the lower
 * layer's lids. The picked layer is bright. Intensity: the gap.
 * ==================================================================== */

const PL = { L: 108, W: 72, TOP: 13.2 };

/**
 * A filled sack lying flat: a puffy loft (narrow foot, full belly, smaller
 * lid), the lid seam, the belly seam, a sewn-shut end (a seam across the lid
 * with stitches over it), folded corners and a printed label with lines of
 * text. Reads as a bag, not a cushion, mainly because of the low height and
 * the label.
 */
function sackDraw(P, front, x0, y0, x1, y1, z0, h) {
  const z1 = z0 + h, zm = z0 + h * 0.5;
  const base = rrect(x0 + 1.6, y0 + 1.6, x1 - 1.6, y1 - 1.6, 4.5, 5);
  const belly = rrect(x0, y0, x1, y1, 5.5, 6);
  const lid = rrect(x0 + 2.6, y0 + 2.6, x1 - 2.6, y1 - 2.6, 4, 5);
  const sil = loft(P, [[base, z0], [belly, zm], [lid, z1]]);
  const seam = open(ringAt(P, run(rrect(x0 + 3.8, y0 + 3.8, x1 - 3.8, y1 - 3.8, 3, 5), front), z1));
  const bel = open(ringAt(P, run(belly, front), zm));
  const top = onZ(P, z1), lo = [], mid = [];
  // sewn end: a seam across the lid near the +x end, with stitches across it
  const xs = x1 - 5.2;
  mid.push(L(top, xs, y0 + 4, xs, y1 - 4));
  for (let y = y0 + 5; y < y1 - 4.5; y += 2.1) lo.push(L(top, xs - 0.9, y, xs + 0.9, y + 0.7));
  // folded corners at the far end
  for (const [cx, cy, dx, dy] of [[x0 + 3.8, y0 + 3.8, 1, 1], [x0 + 3.8, y1 - 3.8, 1, -1]]) lo.push(L(top, cx, cy, cx + 4 * dx, cy + 2.2 * dy));
  // the printed label: a frame and three lines of text, the first one long
  const lw = (x1 - x0) * 0.42, lx = (x0 + x1) / 2 - 3 - lw / 2, ly0 = y0 + (y1 - y0) * 0.26, ly1 = y1 - (y1 - y0) * 0.26;
  lo.push(RECT(top, lx, ly0, lx + lw, ly1));
  const rows = [0.32, 0.55, 0.75], lens = [0.8, 0.55, 0.65];
  rows.forEach((r, k) => { const y = lerp(ly1, ly0, r); lo.push(L(top, lx + 2, y, lx + 2 + (lw - 4) * lens[k], y)); });
  return { sil, crease: seam, mid: mid.join(""), lo: bel + lo.join(""), dots: "" };
}

const palletEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let gap = value, base = drive0 ?? 0; // sourcing-test-hairline: base lifts the top layer when the pointer is away
  const C = Cam(45, 0.5, 1.56);
  const maxLift = TABLE.pallet[2];
  fit(C, [[-14, -14, -4], [122, 86, -4], [122, -14, -4], [-14, 86, -4], [0, 0, 70 + maxLift * 1.2], [54, 36, 70 + maxLift * 1.2]], 200, 162);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  plinth(g, P, front, -14, -14, 122, 86, 4, 9);
  // hatching under the pallet: it shows only through the gaps between the blocks
  mk("path", { class: "nf lo", d: hatch(P, 0.8, 0.8, 107.2, 71.2, 2.2) }, g);

  // the pallet, piece by piece, back to front
  const box = (x0, y0, x1, y1, z0, z1, r = 0.6) => { const [a, b] = rings(x0, y0, x1, y1, r, 0.35); const el = solid(g); put(el, prism(P, front, a, b, z0, z1)); return el; };
  const BOT = [[0, 9], [31.5, 40.5], [63, 72]], BLX = [[0, 13], [47.5, 60.5], [95, 108]], BLY = [[0, 10], [29.5, 42.5], [62, 72]];
  const TOPB = [[0, 13], [17.5, 27.5], [31, 41], [44.5, 54.5], [59, 72]];
  for (const [y0, y1] of BOT) box(0, y0, 108, y1, 0, 2.2);
  for (const [x0, x1] of BLX) for (const [y0, y1] of BLY) box(x0, y0, x1, y1, 2.2, 9);
  for (const [x0, x1] of BLX) box(x0, 0, x1, 72, 9, 11.1);
  const deckEls = TOPB.map(([y0, y1]) => box(0, y0, 108, y1, 11.1, PL.TOP, 0.5));
  // grain lines on the board ends, and the stamp on the middle front block
  const det = [], fx = onX(P, 108), fy = onY(P, 72);
  for (const [y0, y1] of TOPB) det.push(L(fx, y0 + 1.2, 12.2, y1 - 1.2, 12.2));
  det.push(RECT(fx, 32, 3.6, 40, 7.6), L(fx, 33.2, 5.6, 38.8, 5.6));
  mk("path", { class: "nf lo", d: det.join("") }, g);
  // the stamp on the middle front block: the bright place at rest
  const stamp = mk("path", { class: "nf hi", d: RECT(fy, 50, 3.6, 58, 7.6) + L(fy, 51.2, 5.6, 56.8, 5.6) }, g);
  // nails on the deck boards over the blocks: seen when the load is lifted off
  const nails = [];
  for (const [x0, x1] of BLX) for (const [y0, y1] of TOPB) { const xm = (x0 + x1) / 2; nails.push(P(xm - 3, (y0 + y1) / 2, PL.TOP), P(xm + 3, (y0 + y1) / 2, PL.TOP)); }
  mk("path", { class: "dot m", d: DOTS(nails, 0.45) }, g);
  const deckLine = mk("path", { class: "nf lo", d: TOPB.map(([y0, y1]) => L(onZ(P, PL.TOP), 2, (y0 + y1) / 2 + 2.4, 106, (y0 + y1) / 2 + 2.4)).join("") }, g);
  void deckEls; void deckLine;

  // two layers of load; each layer is a group that rises as one
  const z1 = PL.TOP, z2 = PL.TOP + 28;
  const layers = [
    { name: "1", items: [
      { k: "crate", x0: 1, y0: 1, x1: 53, y1: 35, z: z1, h: 28, bands: true },
      { k: "crate", x0: 55, y0: 1, x1: 107, y1: 35, z: z1, h: 28, bands: true },
      { k: "sack", x0: 1.5, y0: 37, x1: 52.5, y1: 71, z: z1, h: 9.3 },
      { k: "sack", x0: 2.5, y0: 37.6, x1: 51.5, y1: 70.4, z: z1 + 9.3, h: 9.3 },
      { k: "sack", x0: 1.8, y0: 37.2, x1: 52.2, y1: 70.8, z: z1 + 18.6, h: 9.4 },
      { k: "sack", x0: 55.5, y0: 37, x1: 106.5, y1: 71, z: z1, h: 9.3 },
      { k: "sack", x0: 56.2, y0: 37.4, x1: 105.6, y1: 70.6, z: z1 + 9.3, h: 9.3 },
      { k: "sack", x0: 55.6, y0: 37.8, x1: 106.2, y1: 70.2, z: z1 + 18.6, h: 9.4 },
    ], text: "2 crates, 6 sacks" },
    { name: "2", items: [
      { k: "crate", x0: 6, y0: 6, x1: 56, y1: 50, z: z2, h: 24, bands: false },
      { k: "sack", x0: 61, y0: 3, x1: 105, y1: 35, z: z2, h: 9 },
      { k: "sack", x0: 62, y0: 4, x1: 104, y1: 34.5, z: z2 + 9, h: 9 },
      { k: "sack", x0: 61, y0: 37, x1: 105, y1: 69, z: z2, h: 9 },
      { k: "sack", x0: 62, y0: 37.5, x1: 104, y1: 68, z: z2 + 9, h: 9 },
    ], text: "1 crate, 4 sacks" },
  ];
  layers.forEach((Ly) => {
    Ly.g = mk("g", {}, g);
    Ly.sils = [];
    for (const it of Ly.items) {
      const el = crateEls(Ly.g);
      const d = it.k === "crate" ? crateDraw(P, front, it.x0, it.y0, it.x1, it.y1, it.z, it.z + it.h) : sackDraw(P, front, it.x0, it.y0, it.x1, it.y1, it.z, it.h);
      crateSet(el, d);
      Ly.sils.push(el.sil);
      if (it.bands) {
        // two steel bands round the crate, each two close lines, with a seal on the near side
        const b = [], seals = [], zt = it.z + it.h;
        for (const fr of [0.27, 0.73]) {
          const x = lerp(it.x0, it.x1, fr);
          for (const o of [-0.55, 0.55]) b.push(open([P(x + o, it.y1 + 0.05, it.z + 0.3), P(x + o, it.y1 + 0.05, zt), P(x + o, it.y0, zt)]));
          seals.push(poly([P(x - 1.5, it.y1 + 0.1, it.z + 9), P(x + 1.5, it.y1 + 0.1, it.z + 9), P(x + 1.5, it.y1 + 0.1, it.z + 12), P(x - 1.5, it.y1 + 0.1, it.z + 12)]));
        }
        // the bands on the +x face of the right crate
        if (it.x1 > 100) for (const fr of [0.3, 0.7]) {
          const y = lerp(it.y0, it.y1, fr);
          for (const o of [-0.55, 0.55]) b.push(open([P(it.x1 + 0.05, y + o, it.z + 0.3), P(it.x1 + 0.05, y + o, zt), P(it.x0, y + o, zt)]));
        }
        mk("path", { class: "nf", d: b.join("") }, el.g);
        mk("path", { d: seals.join("") }, el.g);
      }
    }
  });

  const lifts = layers.map(() => spring(0, { k: 120, c: 19, eps: 0.02 }));
  let picked = -2;
  const rise = (z) => P(0, 0, z)[1] - P(0, 0, 0)[1];

  const B = register(stage, (dt) => {
    let m = false, acc = 0;
    lifts.forEach((sp, i) => {
      if (stepS(sp, dt)) m = true;
      acc = sp.x; // each lift is already cumulative
      layers[i].g.setAttribute("transform", `translate(0 ${r2(rise(acc))})`);
    });
    return m;
  });
  bag.add(B.unregister);

  function choose(f) {
    if (f === picked) return;
    picked = f;
    // pick f: layer f and every layer above it rise by the gap; the one above f also opens a little more
    layers.forEach((Ly, i) => {
      lifts[i].t = f < 0 ? (i === layers.length - 1 ? base * gap : 0) : i >= f ? gap + (i > f ? gap * 0.45 : 0) : 0;
      Ly.sils.forEach((s) => s.classList.toggle("hi", i === f));
    });
    stamp.setAttribute("class", f < 0 ? "nf hi" : "nf lo");
    read.textContent = f < 0 ? (base > 0.02 ? `layer ${layers[layers.length - 1].name} · lifted ${Math.round(base * 100)}%` : "rest") : `layer ${layers[f].name} · ${layers[f].text}`;
    B.wake();
  }
  // the layers' middles on screen at rest: the pointer's height is read against these
  const mids = [P(54, 36, z1 + 14)[1], P(54, 36, z2 + 12)[1]];
  const sx = [P(0, 72, 0)[0] - 6, P(108, 0, 0)[0] + 6];
  bag.add(pointer(stage, {
    move: (p) => {
      if (p[0] < sx[0] || p[0] > sx[1]) return choose(-1);
      choose(p[1] < (mids[0] + mids[1]) / 2 ? 1 : 0);
    },
    leave: () => choose(-1),
  }));
  choose(-1);
  bag.add(() => svg.replaceChildren());
  const again = () => { const f = picked; picked = -2; choose(f); };
  return { set: (v) => { gap = v; again(); }, drive: (v) => { base = v ?? 0; again(); }, destroy: bag.dispose };
};

/* ======================================================================
 * 3. Ship: a container ship on layered wave lines. The sea runs slowly on
 * its own (still under reduced motion). The pointer stirs it: rings of
 * swell spread from where it is, and the ship heaves, pitches and rolls
 * on springs with the water under it. At rest the bridge windows are the
 * bright place. Intensity: the swell's height.
 * ==================================================================== */

const SH = { DK: 20, BEAM: 36, XC: 100 };
/** Bays of containers: per bay, the stack height (tiers) in each of five rows. */
const BAYS = [[3, 4, 4, 4, 3], [4, 5, 5, 5, 4], [5, 5, 6, 5, 5], [5, 6, 6, 6, 5], [4, 5, 5, 5, 4], [2, 3, 3, 3, 2]];
const CB = { X0: 44, LEN: 20, GAP: 1.6, Y0: 2.2, WID: 6.0, YG: 0.4, TH: 5.4 };
const ROWS = [-52, -42, -33, -25, -18, -11, -5, 44, 50, 57, 65, 74, 84];
/** A fixed pseudo-random number in 0..1 for n: the sea's strokes are laid out once, the same on every load. */
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** A ring from an outline, with outward normals, for `run`/`facing`. The outline goes counter-clockwise. */
function ringOf(pts) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], tu = b[0] - a[0], tv = b[1] - a[1], l = Math.hypot(tu, tv) || 1;
    return { u: p[0], v: p[1], nu: tv / l, nv: -tu / l };
  });
}
/** The hull's outline at a height: a squared stern with round corners, straight sides, an elliptic bow. */
function hullOutline(xs, xb, bowLen, y0, y1, r) {
  const pts = [], ym = (y0 + y1) / 2, hb = (y1 - y0) / 2, xa = xb - bowLen;
  for (let k = 0; k <= 24; k++) { const a = rad(-90 + (180 * k) / 24); pts.push([xa + bowLen * Math.cos(a), ym + hb * Math.sin(a)]); }
  for (let k = 0; k <= 6; k++) { const a = rad(90 + (90 * k) / 6); pts.push([xs + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]); }
  for (let k = 0; k <= 6; k++) { const a = rad(180 + (90 * k) / 6); pts.push([xs + r + r * Math.cos(a), y0 + r + r * Math.sin(a)]); }
  // counter-clockwise in (x, y): bow from -90 to 90 runs from the y0 side to the y1 side, then stern, then back
  return ringOf(pts);
}

const shipEngine = ({ stage, svg, read }, value, drive0) => {
  const bag = disposer();
  let swell = value, driven = drive0 ?? 0; // sourcing-test-hairline: driven raises the swell when the pointer is away
  const C = Cam(45, 0.5, 1.14);
  fit(C, [[-40, -48, 0], [240, -48, 0], [-40, 82, 0], [240, 82, 0], [8, 18, 74], [190, 18, 30]], 200, 164);
  const P0 = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const deckR = hullOutline(0, 206, 56, 0, SH.BEAM, 5);
  const wlR = hullOutline(3, 196, 52, 1.6, SH.BEAM - 1.6, 4);
  const bootR = hullOutline(1.4, 201.5, 54, 0.8, SH.BEAM - 0.8, 4.5);
  const bowR = ringOf(deckR.filter((q) => q.u >= 172).map((q) => [q.u, q.v]).concat([[172, SH.BEAM - 0.2], [172, 0.2]]));

  // the sea behind, the ship, the sea in front
  const back = ROWS.filter((y) => y < 0).map((y) => ({ y, el: mk("path", { class: "nf lo" }, g) }));
  const wakeEl = mk("path", { class: "nf lo" }, g);
  // the ship is drawn once into this group; its pose (heave, pitch, roll sway) is one matrix a frame
  const shipG = mk("g", {}, g);
  const hullP = part(shipG, ["sil", "nf", "nf lo", "nf lo"]);
  const bowP = part(shipG, ["sil", "nf lo"]);
  const funnel = part(shipG, ["sil", "nf lo", "nf"]);
  const house = part(shipG, ["sil", "nf lo", "nf lo", "nf lo"]);
  const bridge = part(shipG, ["sil", "nf lo", "nf hi"]);
  const mast = part(shipG, ["nf", "nf lo"]);
  const cols = [];
  BAYS.forEach((bay, i) => bay.forEach((h, j) => cols.push({ i, j, h, prt: part(shipG, ["sil", "nf lo", "nf lo", "nf"]) })));
  const rail = part(shipG, ["nf", "nf lo"]);
  const boat = part(shipG, ["sil", "nf lo", "nf"]);
  const fore = ROWS.filter((y) => y > 0).map((y, k) => ({ y, el: mk("path", { class: k < 5 ? "nf" : "nf lo" }, g) }));
  const foam = mk("path", { class: "nf" }, g);

  const heave = spring(0, { k: 26, c: 7, eps: 0.003 }), pitch = spring(0, { k: 26, c: 7, eps: 0.0002 }), roll = spring(0, { k: 22, c: 5, eps: 0.0002 });
  const amp = spring(0, { k: 14, c: 7, eps: 0.002 });
  const sx = spring(SH.XC, { k: 30, c: 11, eps: 0.05 }), sy = spring(60, { k: 30, c: 11, eps: 0.05 });
  let clock = 0, over = false, staticDone = false, poseKey = "";

  const base = (x, y, t) => 0.8 * Math.sin(0.09 * x + 0.46 * y - 1.05 * t) + 0.45 * Math.sin(0.047 * x - 0.29 * y - 0.66 * t + 2.1);
  const stir = (x, y, t) => {
    if (amp.x < 0.01) return 0;
    const d = Math.hypot(x - sx.x, (y - sy.x) * 1.3);
    return amp.x * Math.exp(-(d * d) / (2 * 52 * 52)) * Math.sin(0.15 * d - 2.6 * t);
  };
  const water = (x, y, t) => base(x, y, t) + stir(x, y, t);

  /**
   * Rows of sea. Each row is laid over an ellipse of water as short strokes
   * (fixed lengths and gaps), each stroke a low crest: it rides the wave
   * height and arches up in its middle. The strokes drift astern, so the
   * ship reads as under way; a stroke leaving the ellipse shortens, one
   * entering grows, so nothing pops.
   */
  const rowSpan = (y) => { const dy = (y - 18) / 92, half = 172 * Math.sqrt(Math.max(0, 1 - dy * dy)); return [100 - half, 100 + half]; };
  [...back, ...fore].forEach((row, k) => {
    const [xa, xb] = rowSpan(row.y), st = [];
    let x = xa + rnd(k + 1) * 14, n = 0;
    while (x < xb + 30) { const len = 12 + rnd(k * 31 + n) * 30; st.push([x, x + len, 0.7 + rnd(k * 7 + n) * 0.9]); x += len + 9 + rnd(k * 17 + n) * 20; n++; }
    row.xa = xa; row.xb = xb; row.span = x - xa; row.st = st;
  });
  function sea(row, t) {
    const off = reducedMotion() ? 0 : (t * 4.2) % row.span, out = [];
    for (const [a0, b0, cr] of row.st) {
      let a = a0 - off, b = b0 - off;
      if (b < row.xa) { a += row.span; b += row.span; }
      const ca = Math.max(a, row.xa), cb = Math.min(b, row.xb);
      if (cb - ca < 2.5) continue;
      const pts = [];
      for (let x = ca; x <= cb + 0.01; x += Math.min(2.4, (cb - ca) / 2)) {
        const s = (x - a) / (b - a), edge = Math.min(1, (x - row.xa) / 26, (row.xb - x) / 26);
        pts.push(P0(x, row.y, (water(x, row.y, t) + cr * Math.sin(Math.PI * s)) * edge));
      }
      out.push(open(pts));
    }
    return out.join("");
  }

  function draw() {
    const t = clock;
    const h = heave.x, pt = pitch.x, rl = roll.x, cp = Math.cos(pt), sp = Math.sin(pt), cr = Math.cos(rl), sr = Math.sin(rl);
    // the ship's pose: roll about the keel line, pitch about midships, then heave
    const pose = (x, y, z) => {
      const y1 = 18 + (y - 18) * cr - z * sr, z1 = (y - 18) * sr + z * cr;
      const x2 = SH.XC + (x - SH.XC) * cp - z1 * sp, z2 = (x - SH.XC) * sp + z1 * cp;
      return P0(x2, y1, z2 + h);
    };
    // The pose as a 2D matrix, exact on the ship's centre line (y = 18) and within half a unit across its beam
    // at these small angles: three points before and after, solved by Cramer's rule.
    const src = [[SH.XC, 18, 0], [SH.XC + 100, 18, 0], [SH.XC, 18, 50]].map((q) => [P0(...q), pose(...q)]);
    const [[s1, d1], [s2, d2], [s3, d3]] = src;
    const det = s1[0] * (s2[1] - s3[1]) - s1[1] * (s2[0] - s3[0]) + (s2[0] * s3[1] - s3[0] * s2[1]);
    const solve = (v1, v2, v3) => [
      (v1 * (s2[1] - s3[1]) - s1[1] * (v2 - v3) + (v2 * s3[1] - v3 * s2[1])) / det,
      (s1[0] * (v2 - v3) - v1 * (s2[0] - s3[0]) + (s2[0] * v3 - s3[0] * v2)) / det,
      (s1[0] * (s2[1] * v3 - s3[1] * v2) - s1[1] * (s2[0] * v3 - s3[0] * v2) + v1 * (s2[0] * s3[1] - s3[0] * s2[1])) / det,
    ];
    const [ma, mc, me] = solve(d1[0], d2[0], d3[0]), [mb, md, mf] = solve(d1[1], d2[1], d3[1]);
    const mx = [ma, mb, mc, md, me, mf].map((v) => +v.toFixed(5)).join(" ");
    if (mx !== poseKey) { poseKey = mx; shipG.setAttribute("transform", `matrix(${mx})`); }
    back.forEach((r) => setD(r.el, sea(r, t)));
    fore.forEach((r) => setD(r.el, sea(r, t)));

    // wake astern: two lines spreading back from the stern
    const wk = [];
    // short strokes spreading from the stern quarters, the far ones fainter
    for (const s of [-1, 1]) for (const o of [0, 3.4]) for (let k = 0; k < 4; k++) {
      const a = -3 - o * 2.5 - k * 7.5, b = a - 4.2, ya = 18 + s * (16 + o + (-a) * 0.45), yb = 18 + s * (16 + o + (-b) * 0.45);
      wk.push(seg(P0(a, ya, water(a, ya, t) * 0.8), P0(b, yb, water(b, yb, t) * 0.8)));
    }
    setD(wakeEl, wk.join(""));

    if (!staticDone) {
    staticDone = true;
    const P = P0;
    // the hull: a loft from the waterline to the deck; the sheer line, boot top and plate seams on the near side
    setD(hullP.p[0], loft(P, [[wlR, 0], [deckR, SH.DK]]));
    const nearDeck = run(deckR, front);
    setD(hullP.p[1], open(ringAt(P, nearDeck, SH.DK)));
    const boot = run(bootR, front);
    setD(hullP.p[2], open(ringAt(P, boot, 4.2)) + open(ringAt(P, boot, 5.4)));
    const seams = [];
    for (let x = 24; x < 150; x += 21) seams.push(seg(P(x, SH.BEAM - 1.25, 6.2), P(x, SH.BEAM, SH.DK - 0.6)));
    // draft marks at the bow, a hawse pipe and the anchor
    for (let z = 1.4; z < 13; z += 2.2) seams.push(seg(P(193, 31.4, z), P(195.2, 30.9, z)));
    seams.push(poly(Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return P(186 + 1.6 * Math.cos(a), 31.9, 15.4 + 1.2 * Math.sin(a)); })));
    seams.push(seg(P(186, 32, 14.2), P(186, 32.4, 9.4)) + seg(P(184, 32.4, 10.2), P(188, 32.2, 10.2)));
    setD(hullP.p[3], seams.join(""));

    // the forecastle bulwark at the bow
    setD(bowP.p[0], loft(P, [[bowR, SH.DK], [bowR, SH.DK + 4.5]]));
    setD(bowP.p[1], open(ringAt(P, run(bowR, front), SH.DK + 4.5)));

    // funnel, behind the house
    const [fr, fi] = rings(4, 11, 13, 25, 3, 0.8);
    const fu = prism(P, front, fr, fi, SH.DK, 72);
    setD(funnel.p[0], fu.sil); setD(funnel.p[1], fu.crease);
    const fband = run(fr, front);
    setD(funnel.p[2], open(ringAt(P, fband, 66)) + open(ringAt(P, fband, 63.6)));

    // the house: windows in rows on its two seen faces
    const [hr, hi] = rings(14, 3, 36, 33, 2, 0.8);
    const ho = prism(P, front, hr, hi, SH.DK, 56);
    setD(house.p[0], ho.sil); setD(house.p[1], ho.crease);
    const wx = [], fx = onX(P, 36), fy = onY(P, 33);
    for (let z = SH.DK + 7; z < 53; z += 7) {
      for (let y = 6; y < 30; y += 3.4) wx.push(RECT(fx, y, z, y + 1.9, z + 2.3));
      for (let x = 17; x < 33; x += 3.4) wx.push(RECT(fy, x, z, x + 1.9, z + 2.3));
    }
    setD(house.p[2], wx.join(""));
    const decks = [];
    for (let z = SH.DK + 5.2; z < 54; z += 7) decks.push(L(fx, 4, z, 32, z) + L(fy, 15, z, 35, z));
    setD(house.p[3], decks.join(""));

    // the bridge with its wings, and the windows across its front
    const [brr, bri] = rings(25, -4, 37.5, 40, 1.4, 0.6);
    const br = prism(P, front, brr, bri, 55, 61);
    setD(bridge.p[0], br.sil); setD(bridge.p[1], br.crease);
    const bx = onX(P, 37.5), bw = [];
    for (let y = -2; y < 38; y += 3) bw.push(RECT(bx, y, 57, y + 2.2, 59.6));
    setD(bridge.p[1], br.crease + bw.join(""));
    setD(bridge.p[2], L(bx, -3, 60.2, 39, 60.2));

    // mast and radar on the bridge top
    setD(mast.p[0], seg(P(31, 18, 61), P(31, 18, 76)) + seg(P(31, 13, 71), P(31, 23, 71)));
    setD(mast.p[1], seg(P(30, 15.5, 73.2), P(32, 15.5, 73.2)) + seg(P(30, 20.5, 73.2), P(32, 20.5, 73.2)));

    // containers: each column is a stack; tier lines and corrugation on what shows
    const top = (i, j) => (i < 0 || i >= BAYS.length || j < 0 || j >= 5 ? 0 : BAYS[i][j]);
    const zb = SH.DK + 1.4;
    for (const c of cols) {
      const x0 = CB.X0 + c.i * (CB.LEN + CB.GAP), x1 = x0 + CB.LEN, y0 = CB.Y0 + c.j * (CB.WID + CB.YG), y1 = y0 + CB.WID;
      const z1 = zb + c.h * CB.TH;
      const [rg, ig] = rings(x0, y0, x1, y1, 0.5, 0.3);
      const s = prism(P, front, rg, ig, zb, z1);
      setD(c.prt.p[0], s.sil); setD(c.prt.p[1], s.crease);
      const lo = [], mid = [];
      const fy2 = onY(P, y1), fx2 = onX(P, x1), ft = onZ(P, z1);
      // tier joints on both seen faces and the lid's end lines
      for (let k = 1; k < c.h; k++) { const z = zb + k * CB.TH; mid.push(L(fy2, x0, z, x1, z), L(fx2, y0, z, y1, z)); }
      mid.push(L(ft, x0 + 0.8, y0, x0 + 0.8, y1), L(ft, x1 - 0.8, y0, x1 - 0.8, y1));
      // corrugation, only where a face is not covered by the next stack
      const ny = top(c.i, c.j + 1), nx = top(c.i + 1, c.j);
      for (let k = ny; k < c.h; k++) {
        const za = zb + k * CB.TH + 0.6, zc = zb + (k + 1) * CB.TH - 0.6, pitchR = (c.i + c.j + k) % 3 === 0 ? 1.7 : 1.25;
        for (let x = x0 + 1.4; x < x1 - 1.2; x += pitchR) lo.push(L(fy2, x, za, x, zc));
        lo.push(L(fy2, x0 + 0.7, za - 0.3, x0 + 0.7, zc + 0.3), L(fy2, x1 - 0.7, za - 0.3, x1 - 0.7, zc + 0.3));
      }
      for (let k = nx; k < c.h; k++) {
        const za = zb + k * CB.TH + 0.6, zc = zb + (k + 1) * CB.TH - 0.6;
        // door end: two leaves, four locking bars
        lo.push(L(fx2, (y0 + y1) / 2, za, (y0 + y1) / 2, zc));
        for (const f of [0.2, 0.38, 0.62, 0.8]) lo.push(L(fx2, lerp(y0, y1, f), za + 0.4, lerp(y0, y1, f), zc - 0.4));
      }
      // lashing rods: crossed, on the first two tiers of the exposed bay ends
      if (nx < 2) for (let k = Math.max(nx, 0); k < Math.min(2, c.h); k++) {
        const za = zb + k * CB.TH, zc = za + CB.TH;
        mid.push(seg(P(x1 + 0.9, y0 + 0.4, zb - 1), P(x1 + 0.9, y1 - 0.4, zc)), seg(P(x1 + 0.9, y1 - 0.4, zb - 1), P(x1 + 0.9, y0 + 0.4, zc)));
      }
      setD(c.prt.p[2], lo.join(""));
      setD(c.prt.p[3], mid.join(""));
    }

    // the near rail: posts and two rails along the deck edge
    const rl0 = [], rl1 = [];
    for (let x = 8; x < 172; x += 4.2) rl1.push(seg(P(x, SH.BEAM - 0.4, SH.DK), P(x, SH.BEAM - 0.4, SH.DK + 3.2)));
    rl0.push(seg(P(6, SH.BEAM - 0.4, SH.DK + 3.2), P(172, SH.BEAM - 0.4, SH.DK + 3.2)));
    rl1.push(seg(P(6, SH.BEAM - 0.4, SH.DK + 1.7), P(172, SH.BEAM - 0.4, SH.DK + 1.7)));
    setD(rail.p[0], rl0.join("")); setD(rail.p[1], rl1.join(""));

    // the lifeboat on its davit, on the near side of the house
    const [lr, li] = rings(16, 34, 31, 39.5, 2.6, 0.8);
    const lb = prism(P, front, lr, li, 34, 38.4);
    setD(boat.p[0], lb.sil); setD(boat.p[1], lb.crease);
    setD(boat.p[2], seg(P(18.5, 33, 40.4), P(18.5, 35.4, 38.6)) + seg(P(28.5, 33, 40.4), P(28.5, 35.4, 38.6)) + L(onY(P, 39.5), 17.5, 36.2, 29.5, 36.2));

    }

    // foam along the waterline and the bow wave
    const fm = [];
    for (let x = 30; x < 176; x += 9) fm.push(seg(P0(x, SH.BEAM + 1.6, water(x, 38, t)), P0(x + 4.6, SH.BEAM + 1.6, water(x + 4.6, 38, t))));
    const bw2 = [], yHull = (x) => (x > 146 ? 18 + 16.5 * Math.sqrt(Math.max(0, 1 - ((x - 146) / 50) ** 2)) : 34.4);
    for (const [o, x0] of [[1.2, 195], [4.4, 188]]) bw2.push(open(Array.from({ length: 11 }, (_, k) => { const x = x0 - k * 6.2, y = yHull(x) + o + k * 1.05; return P0(x, y, water(x, y, t) + 0.5); })));
    setD(foam, fm.join("") + bw2.join(""));
  }

  const B = register(stage, (dt) => {
    let m = false;
    if (!reducedMotion()) clock += dt;
    for (const s of [amp, sx, sy]) if (stepS(s, dt)) m = true;
    const t = clock;
    const hb = water(190, 18, t), hs = water(14, 18, t), hn = water(100, 38, t), hf = water(100, -2, t), hm = water(100, 18, t);
    pitch.t = Math.atan2(hb - hs, 176) * 2.4;
    roll.t = Math.atan2(hn - hf, 40) * 0.9;
    heave.t = (hb + hs + hm) / 3 * 0.9;
    for (const s of [heave, pitch, roll]) if (stepS(s, dt)) m = true;
    draw();
    const deg = (pitch.x * 180) / Math.PI;
    read.textContent = over ? `swell ${amp.x.toFixed(1)} · pitch ${deg >= 0 ? "+" : "−"}${Math.abs(deg).toFixed(1)}°` : "rest";
    if (reducedMotion() && !m) return false;
    return true;
  });
  bag.add(B.unregister);
  bag.add(pointer(stage, {
    move: (p) => { const w = unproj(C, p[0], p[1], 0); over = true; sx.t = clamp(w[0], -20, 230); sy.t = clamp(w[1], -40, 80); amp.t = swell; B.wake(); },
    leave: () => { over = false; amp.t = driven * swell; B.wake(); },
  }));
  bag.add(() => svg.replaceChildren());
  if (driven) amp.t = driven * swell;
  return { set: (v) => { swell = v; amp.t = over ? v : driven * v; B.wake(); }, drive: (v) => { driven = v ?? 0; if (!over) amp.t = driven * swell; B.wake(); }, destroy: bag.dispose };
};

/* ---------- the public functions, in the library's own shape, plus drive ----------
 * sourcing-test-hairline: the first set now takes `drive` (0..1, or null) like the second set:
 * the mount option { drive }, fig.drive(v) or fig.update({ drive }). Truck: drives forward along its road
 * (up to its reach). Pallet: the top layer lifts. Ship: the swell rises. The pointer still wins while it
 * is over the figure. */
const toDrive = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : clamp(+v, 0, 1));
function withDrive(id, label, engine) {
  return (el, options = {}) => {
    let eng = null;
    const h = create({ id, label, rest: "rest", engine: (ctx, v) => (eng = engine(ctx, v, toDrive(options.drive))) }, el, options);
    const drive = (v) => { if (eng) eng.drive(toDrive(v)); };
    return { update(next) { h.update(next); if (next && "drive" in next) drive(next.drive); }, drive, destroy: h.destroy };
  };
}
export const truck = withDrive("truck", "A flatbed truck carrying three lashed timber crates. The pointer drives it along the road; the load leans against its straps and settles.", truckEngine);
export const pallet = withDrive("pallet", "A timber pallet with two layers of banded crates and filled sacks. The pointer's height picks a layer and lifts it clear.", palletEngine);
export const ship = withDrive("ship", "A container ship on layered wave lines. The pointer stirs the sea and the ship rides the swell.", shipEngine);
