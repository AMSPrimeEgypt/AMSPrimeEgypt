const root = document.documentElement;
const live = root.classList.contains("live");
const HL = "/assets/js/hairline/";

let coreP = null;
const loadCore = () => (coreP ||= import(HL + "hairline-core.js").then((m) => {
  const core = m.core;
  window.__hl = { live: core.live, ticks: core.ticks };
  let paceT = 0;
  addEventListener("scroll", () => { if (!paceT) core.pace(2); clearTimeout(paceT); paceT = setTimeout(() => { paceT = 0; core.pace(1); }, 180); }, { passive: true });
  return core;
}));
const FIRST = ["truck", "pallet", "ship"];
const RANGES = ["hayBale", "frozenBag", "fruitTray", "produceCrate", "oliveJar", "chocolate", "groceryCarton", "household", "armchair"];
let modA = null, modB = null, modC = null, modR = null;
const loadFig = (name) => name === "container" ? (modC ||= import(HL + "figure-container.js"))
  : RANGES.includes(name) ? (modR ||= import(HL + "figures-ranges.js"))
  : FIRST.includes(name) ? (modA ||= import(HL + "figures-custom.js"))
  : (modB ||= import(HL + "figures-more.js"));
let ready = false;
const waiting = [];
function armWatchers() { if (ready) return; ready = true; for (const start of waiting.splice(0)) start(); }
addEventListener("scroll", armWatchers, { once: true, passive: true });
const idle = () => (window.requestIdleCallback || setTimeout)(armWatchers, { timeout: 1500 });
if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
const within = (el, fn) => {
  const start = () => {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: "100% 0px" });
    io.observe(el);
  };
  ready ? start() : waiting.push(start);
};

const settling = new Map();
const quietWaiters = [];
function settled() { if (!settling.size) quietWaiters.splice(0).forEach((r) => r()); }
const whenJourneyQuiet = () => (settling.size ? new Promise((r) => quietWaiters.push(r)) : Promise.resolve());

(() => {
  const section = document.getElementById("journey");
  if (!section) return;
  const INTENSITY = { truck: 1, pallet: 0.6, ship: 0.6, aircraft: 0.6, fruitCrate: 0.6 };
  const wideMQ = matchMedia("(min-width: 720px) and (min-height: 540px)");
  let core = null, set = null, setWide = null, mounting = null, state = window.__journey || null, activeK = -2;

  async function mount(el, drive = 0) {
    const name = el.dataset.fig;
    const mod = await loadFig(name);
    const ns = el.querySelector("noscript");
    if (ns) ns.remove();
    const h = mod[name](el, { intensity: INTENSITY[name], theme: "light", drive });
    const f = {
      el, name, h, d: drive, held: false,
      drive(v) { v = Math.round(v * 1000) / 1000; if (v !== f.d) { f.d = v; h.drive(v); } },
      hold(on) { on = !!on; if (on !== f.held) { f.held = on; core.hold(el, on); } },
      destroy() { core.hold(el, false); h.destroy(); },
    };
    return f;
  }

  function apply() {
    if (!set || !state) return;
    for (const f of set) if (!f.held || f.stop === state.active) f.drive(live ? state.drive[f.stop] : 0);
    if (!live) { for (const f of set) f.hold(false); return; }
    const k = state.active, modeKey = k + state.mode;
    if (modeKey === activeK) return;
    activeK = modeKey;
    for (const f of set) {
      const mine = f.stop === k && (!f.mode || f.mode === state.mode);
      if (mine) { clearTimeout(settling.get(f)); settling.delete(f); f.hold(false); f.drive(state.drive[f.stop]); continue; }
      if (f.held || settling.has(f)) continue;
      stopSettling();
      settling.set(f, setTimeout(() => { settling.delete(f); f.hold(true); settled(); }, 700));
    }
  }
  function stopSettling() { for (const [g, t] of settling) { clearTimeout(t); g.hold(true); settling.delete(g); } settled(); }
  window.__hlJourney = (s) => { state = s; if (set && setWide === s.wide) apply(); };

  async function mountSet() {
    const wide = wideMQ.matches;
    if (set && setWide === wide) return;
    if (mounting) return mounting;
    mounting = (async () => {
      core = await loadCore();
      if (set) { for (const f of set) f.destroy(); set = null; }
      const els = [...section.querySelectorAll(wide ? ".jplate > .hl" : ".jstop > .jvig")];
      const out = [];
      for (const el of els) {
        const holder = el.closest(".jplate") || el.closest(".jstop");
        const f = await mount(el, 0);
        f.stop = +holder.dataset.stop;
        f.mode = el.classList.contains("m-air") || holder.classList.contains("m-air") ? "air"
               : el.classList.contains("m-sea") || holder.classList.contains("m-sea") ? "sea" : null;
        f.hold(live);
        out.push(f);
        await new Promise((r) => (window.requestIdleCallback || setTimeout)(r, { timeout: 120 }));
      }
      set = out; setWide = wide; activeK = -2; mounting = null;
      state = window.__journey || state;
      apply();
    })();
    return mounting;
  }
  within(section, mountSet);
  wideMQ.addEventListener("change", () => { if (set) { activeK = -2; mountSet(); } });
})();

(() => {
  const el = document.getElementById("cband-fig");
  if (!el) return;
  const touch = matchMedia("(pointer: coarse), (max-width: 63.99em)").matches;
  let core = null, fig = null, mounting = null, released = false;

  async function mountFig() {
    if (mounting) return mounting;
    mounting = (async () => {
      const [c, mod] = await Promise.all([loadCore(), loadFig("container")]);
      core = c;
      fig = mod.container(el, { intensity: 0.5, theme: "dark", drive: live ? 0 : 1 });
      if (live) core.hold(el, true);
    })();
    return mounting;
  }
  within(el, mountFig);
  if (!live) return;

  let done = false, queued = false;
  const update = () => {
    queued = false;
    if (done || !fig) return;
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.7)));
    fig.drive(p);
    if (p >= 1) { done = true; removeEventListener("scroll", onScroll); }
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  async function release() {
    await mountFig();
    await whenJourneyQuiet();
    if (!released) { released = true; core.hold(el, false); }
    if (touch) { fig.drive(1); return; }
    if (!done) { addEventListener("scroll", onScroll, { passive: true }); update(); }
  }
  const io = new IntersectionObserver((es) => {
    const inView = es.some((e) => e.isIntersecting);
    if (inView) { release(); if (touch) io.disconnect(); }
    else if (!touch) removeEventListener("scroll", onScroll);
  }, touch ? { threshold: 0.35 } : {});
  io.observe(el);
})();

export { loadCore, loadFig, within };
