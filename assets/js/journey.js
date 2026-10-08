(function () {
  "use strict";
  var root = document.documentElement;
  var live = root.classList.contains("live");
  var section = document.getElementById("journey");
  if (!section) return;

  function q(s) { return section.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(section.querySelectorAll(s)); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ramp(v, a, b) { return clamp((v - a) / (b - a)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function S(p, a, b) { return smooth(ramp(p, a, b)); }

  var wideMQ = matchMedia("(min-width: 720px) and (min-height: 540px)");
  var N = 5;
  var STOP_P = [0.04, 0.22, 0.42, 0.64, 0.86];
  var END_P = 0.97;
  var DONE_P = STOP_P[N - 1];
  var KEYS = {
    sea: [[0, 0], [0.22, 1], [0.26, 1], [0.42, 2], [0.46, 2], [0.64, 4], [0.68, 4], [0.86, 6], [0.9, 6], [0.97, 7]],
    air: [[0, 0], [0.22, 1], [0.26, 1], [0.42, 2], [0.46, 2], [0.64, 3], [0.68, 3], [0.86, 5], [0.9, 5], [0.97, 6]]
  };

  var legs = qa(".jstops .jleg i");
  var stampSets = [qa(".jroute .jstamp"), qa(".jstops .jstamp")];
  var reveal = { sea: q("#j-cut-sea .jreveal"), air: q("#j-cut-air .jreveal") };
  var head = q(".jworld-head .jhd");
  var plates = qa(".jworld .jplate");
  var wrap = q(".jstops-wrap"), spinePaths = qa(".jspine path"), spine = q(".jspine"),
      sReveal = q("#j-sreveal"), marker = q("#j-mk"), nodes = qa(".jspine circle.jnode"), heads = qa(".jstop-head"), vigs = qa(".jstop > .jvig");
  var btns = qa(".jmode[data-set]");
  var mode = section.getAttribute("data-mode") || "sea";
  var header = document.querySelector(".site-header");
  var hdrPx = 0;
  function measureHeader() {
    var h = header ? Math.round(header.getBoundingClientRect().height) : 0;
    if (!h) h = parseFloat(getComputedStyle(section).getPropertyValue("--hdr")) || 0;
    if (h !== hdrPx) { hdrPx = h; section.style.setProperty("--hdr", h + "px"); }
  }

  var G = {};
  function build(m) {
    var d = q("#j-rt-" + m).getAttribute("d"), nums = d.match(/-?[\d.]+/g).map(Number), v = [], cum = [0];
    for (var i = 0; i < nums.length; i += 2) v.push([nums[i], nums[i + 1]]);
    for (var j = 1; j < v.length; j++) cum.push(cum[j - 1] + Math.hypot(v[j][0] - v[j - 1][0], v[j][1] - v[j - 1][1]));
    G[m] = { v: v, cum: cum, keys: KEYS[m].map(function (k) { return [k[0], cum[k[1]]]; }) };
  }
  function pointAt(g, L) {
    for (var i = 1; i < g.v.length; i++) if (L <= g.cum[i] || i === g.v.length - 1) {
      var a = g.v[i - 1], b = g.v[i], t = Math.min(1, Math.max(0, (L - g.cum[i - 1]) / ((g.cum[i] - g.cum[i - 1]) || 1)));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    return g.v[0];
  }
  function headAt(g, p) {
    var k = g.keys;
    if (p <= k[0][0]) return k[0][1];
    for (var i = 1; i < k.length; i++) if (p <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (p - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
    return k[k.length - 1][1];
  }

  var ones = [1, 1, 1, 1, 1], zeros = [0, 0, 0, 0, 0];
  var J = window.__journey = { wide: true, mode: mode, active: -1, em: ones.slice(), drive: zeros.slice(), v: 0 };
  function publish() { J.v++; if (window.__hlJourney) window.__hlJourney(J); }

  var stamped = 0, lastOp = {}, lastTf = {}, done = null, moving = null;
  function stampTo(n) {
    while (stamped < n) {
      for (var s = 0; s < stampSets.length; s++) if (stampSets[s][stamped]) stampSets[s][stamped].classList.add("is-on");
      stamped++;
    }
  }
  function setDone(on) { if (on !== done) { done = on; section.classList.toggle("is-done", on); } }
  function setMoving(on) { if (on !== moving) { moving = on; section.classList.toggle("is-moving", on); } }
  var started = null;
  function setStarted(on) { if (on !== started) { started = on; section.classList.toggle("is-started", on); } }
  function setTf(el, key, t) {
    if (lastTf[key] === t) return;
    lastTf[key] = t;
    el.setAttribute("transform", t);
  }
  function setEm(el, key, e) {
    var v = (Math.round(e * 20) / 20).toFixed(2);
    if (lastOp[key] === v) return;
    lastOp[key] = v;
    el.style.setProperty("--em", v);
  }
  function setLegs(p) {
    for (var k = 0; k < N; k++) {
      var end = k < N - 1 ? STOP_P[k + 1] : END_P;
      var v = clamp((p - STOP_P[k]) / (end - STOP_P[k])).toFixed(3);
      if (lastOp["leg" + k] !== v) { lastOp["leg" + k] = v; if (legs[k]) legs[k].style.transform = "scaleX(" + v + ")"; }
    }
  }
  function stopsReached(p) { var n = 0; for (var k = 0; k < N; k++) if (p >= STOP_P[k]) n = k + 1; return n; }

  function renderWide(p) {
    var g = G[mode], L = headAt(g, p), pt = pointAt(g, L);
    setTf(reveal[mode], "r" + mode, "translate(" + pt[0].toFixed(2) + " 0)");
    setTf(head, "hd", "translate(" + pt[0].toFixed(2) + " " + pt[1].toFixed(2) + ")");
    var h1 = S(p, 0.3, 0.36), h2 = S(p, 0.55, 0.61), h3 = S(p, 0.78, 0.84);
    var em = [1 - h1, 1, h1 - h2, h2 - h3, h3];
    var drive = [Math.sin(Math.PI * ramp(p, 0.04, 0.26)), 0, ramp(p, 0.46, 0.64), ramp(p, 0.68, 0.86), ramp(p, 0.88, 0.98)];
    var active = 0, PL = [0, 2, 3, 4];
    for (var a = 1; a < PL.length; a++) if (em[PL[a]] > em[active]) active = PL[a];
    for (var i = 0; i < plates.length; i++) setEm(plates[i], "em" + i, em[+plates[i].getAttribute("data-stop")]);
    var n = stopsReached(p);
    setLegs(p);
    stampTo(n);
    setDone(p >= DONE_P);
    setMoving(p > 0.06);
    setStarted(p > 0.02);
    J.wide = true; J.mode = mode; J.active = active; J.em = em; J.drive = drive;
    publish();
  }

  var spineH = 0, nodeY = [];
  function measureNarrow() {
    spineH = wrap.offsetHeight;
    spine.setAttribute("viewBox", "0 0 40 " + spineH);
    for (var i = 0; i < spinePaths.length; i++) spinePaths[i].setAttribute("d", "M20 0V" + spineH);
    sReveal.setAttribute("y", -spineH);
    sReveal.setAttribute("height", spineH);
    var top = wrap.getBoundingClientRect().top;
    nodeY = heads.map(function (h) { return Math.round(h.getBoundingClientRect().top - top + 11); });
    for (var k = 0; k < nodes.length; k++) nodes[k].setAttribute("cy", nodeY[k]);
  }
  function renderNarrow(y) {
    var yy = Math.min(Math.max(y, 0), spineH).toFixed(1);
    setTf(sReveal, "sr", "translate(0 " + yy + ")");
    setTf(marker, "mk", "translate(20 " + yy + ")");
    var n = 0;
    for (var k = 0; k < N; k++) if (y >= nodeY[k]) n = k + 1;
    stampTo(n);
    setDone(n >= N);
    var vh = window.innerHeight, best = -1, bestD = 1e9, drive = zeros.slice();
    for (var i = 0; i < vigs.length; i++) {
      var r = vigs[i].getBoundingClientRect();
      if (!r.height) continue;
      var stop = +vigs[i].parentNode.getAttribute("data-stop"), c = r.top + r.height / 2, d = Math.abs(c - vh * 0.5);
      drive[stop] = ramp(vh * 0.9 - c, 0, vh * 0.6);
      if (r.bottom > 0 && r.top < vh && d < bestD) { bestD = d; best = stop; }
    }
    J.wide = false; J.mode = mode; J.active = best; J.em = ones.slice(); J.drive = drive;
    publish();
  }

  var wide = wideMQ.matches;
  function frame() {
    ticking = false;
    if (wide) {
      var r = section.getBoundingClientRect(), vh = window.innerHeight;
      var span = r.height - (vh - hdrPx);
      renderWide(span > 0 ? clamp((hdrPx - r.top) / span) : 1);
    } else {
      var w = wrap.getBoundingClientRect(), vh2 = window.innerHeight;
      var span2 = spineH - vh2 * 0.23;
      renderNarrow(spineH * (span2 > 0 ? clamp((vh2 * 0.62 - w.top) / span2) : 1));
    }
  }
  function finish() {
    if (wide) renderWide(1); else renderNarrow(spineH);
    for (var i = 0; i < plates.length; i++) setEm(plates[i], "em" + i, 1);
    setDone(true);
    J.active = -1; J.em = ones.slice(); J.drive = zeros.slice();
    publish();
  }
  function setup() {
    measureHeader();
    wide = wideMQ.matches;
    if (!wide) measureNarrow();
    lastOp = {}; lastTf = {};
    if (live) frame(); else finish();
  }

  function setMode(m) {
    if (m === mode || !G[m]) return;
    mode = m;
    section.setAttribute("data-mode", m);
    btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set") === m)); });
    if (live) frame(); else finish();
  }
  btns.forEach(function (b, i) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-set")); });
    b.addEventListener("keydown", function (e) {
      var k = e.key, j = -1;
      if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % btns.length;
      else if (k === "ArrowLeft" || k === "ArrowUp") j = (i + btns.length - 1) % btns.length;
      else if (k === "Home") j = 0; else if (k === "End") j = btns.length - 1;
      if (j < 0) return;
      e.preventDefault();
      btns[j].focus();
      setMode(btns[j].getAttribute("data-set"));
    });
  });

  var ticking = false, active = true;
  function onScroll() {
    if (!active || ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  build("sea"); build("air");
  setup();
  if (!live) {
    window.addEventListener("resize", function () { requestAnimationFrame(setup); });
    return;
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      active = entries[0].isIntersecting;
      if (!active) requestAnimationFrame(frame);
    }, { rootMargin: "120px 0px" }).observe(section);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  var resizeQueued = false;
  window.addEventListener("resize", function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; setup(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setup);
})();
