
const root = document.documentElement;
const live = root.classList.contains("live");
const form = document.querySelector("[data-enq-form]");
if (form) start(form);

function start(form) {
  form.noValidate = true;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wrap = $("[data-enq-wrap]"), bar = $("[data-enq-bar]"), done = $("[data-done]");
  const steps = $$(".enq-step", form), N = steps.length;
  const barBtns = $$(".enq-bar__btn", bar);
  const sumTop = $("[data-sum-top]"), sumMain = $("[data-sum]");
  const liveEl = $("[data-live]");
  const missingEl = $("[data-missing]"), failEl = $("[data-fail]");
  const btn = $("[data-submit]"), btnLabel = $("[data-submit-label]");
  const errGoods = $("[data-err-goods]");
  const note = $("#e-note"), country = $("#e-country"), port = $("#e-port");
  const nameEl = $("#e-name"), emailEl = $("#e-email"), phoneEl = $("#e-phone"), consentEl = $("#e-consent");
  const goodsBoxes = $$('input[name="goods[]"]', form);
  const itemBoxes = $$('input[name="items[]"]', form);
  const itemGroups = $$("[data-items-for]", form);
  const itemsEl = $("[data-items]");
  const panelItems = $("[data-panel-items]");
  const productField = $("[data-product-field]");
  const fromProduct = $("[data-fromproduct]");
  const panel = $("[data-panel]");
  const tilesEl = $("[data-tiles]"), panelEmpty = $("[data-panel-goods-empty]");
  const panelMode = $("[data-panel-mode]"), panelDest = $("[data-panel-dest]"), panelPort = $("[data-panel-port]");
  const countryField = $("[data-country-field]");
  const wideMQ = matchMedia("(min-width: 64em)");
  let step = 1, busy = false, product = null;

  try {
    const map = JSON.parse($("#enq-map").textContent);
    const q = new URLSearchParams(location.search);
    const key = (q.get("product") || q.get("category") || "").trim().toLowerCase();
    const hit = map[key] || map[key.split("/")[0]];
    if (hit) {
      const box = goodsBoxes.find((b) => b.dataset.cat === hit.cat);
      if (box) {
        box.checked = true;
        product = hit;
        const it = hit.item && itemBoxes.find((b) => b.dataset.item === hit.item);
        if (it) it.checked = true;
        if (hit.label !== box.value) {
          productField.value = hit.label;
          fromProduct.textContent = "From the product page: " + hit.label + ".";
          fromProduct.hidden = false;
        }
      }
    }
  } catch (e) {  }

  const val = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || "";
  const chosenGoods = () => goodsBoxes.filter((b) => b.checked);
  const mode = () => (val("transport") === "By sea" ? "sea" : val("transport") === "By air" ? "air" : val("transport") ? "unsure" : "");
  const list = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const itemName = (b) => { const n = b.dataset.name, i = n.indexOf(", "); return i < 0 ? n : n.slice(0, i) + " (" + n.slice(i + 2) + ")"; };
  const chosen = () => chosenGoods().map((b) => ({ box: b, name: b.value, items: itemBoxes.filter((i) => i.checked && i.dataset.cat === b.dataset.cat).map(itemName) }));
  const rangeText = (r) => (r.items.length ? r.name + ": " + r.items.join(", ") : r.name);
  const itemsText = () => chosen().filter((r) => r.items.length).map(rangeText).join("; ");
  const itemsCount = () => itemBoxes.filter((i) => i.checked).length;
  function destText() {
    const d = val("destination");
    if (!d) return "";
    return d === "Another country" ? (country.value.trim() || "another country") : d;
  }
  function summary() {
    const n = note.value.trim();
    const goods = chosen().map(rangeText).join("; ");
    const m = mode();
    const way = m === "sea" ? "by sea" : m === "air" ? "by air" : m === "unsure" ? "route to be advised" : "";
    const d = destText(), p = port.value.trim();
    const to = d ? "to " + d + (p ? ", port " + p : "") : "";
    const travel = [way, to].filter(Boolean).join(", ");
    const parts = [goods, n ? "Not listed: " + n.replace(/\.+$/, "") : "", travel ? travel.charAt(0).toUpperCase() + travel.slice(1) : ""].filter(Boolean);
    return parts.length ? "You chose: " + parts.join(". ") + "." : "";
  }

  let tileKey = "";
  const thumbs = new Map();
  function tileFor(b) {
    let li = thumbs.get(b.dataset.cat);
    if (li) return li;
    const pick = b.closest(".pick");
    li = document.createElement("li");
    li.className = "enq-tile";
    li.addEventListener("animationend", () => li.classList.remove("is-new"));
    const fr = document.createElement("span");
    fr.className = "enq-tile__fig";
    const fig = document.createElement("span");
    fig.className = "hl enq-rfig";
    fig.dataset.rfig = pick.querySelector("[data-rfig]").dataset.rfig;
    fr.appendChild(fig);
    const cap = document.createElement("span");
    cap.className = "enq-tile__cap";
    const capNum = document.createElement("span");
    capNum.textContent = pick.querySelector(".pick__num").textContent;
    const capName = document.createElement("span");
    capName.className = "enq-tile__name";
    capName.textContent = b.value;
    cap.append(capNum, capName);
    li.append(fr, cap);
    thumbs.set(b.dataset.cat, li);
    return li;
  }
  function renderTiles() {
    const on = chosenGoods();
    const key = on.map((b) => b.dataset.cat).join("|");
    const n = note.value.trim();
    panelEmpty.hidden = on.length > 0 || !!n;
    const lines = chosen().filter((r) => r.items.length).map((r) => [r.name, r.items.join(", ")]);
    if (n) lines.push(["Not listed", n]);
    panelItems.textContent = "";
    for (const [k, v] of lines) {
      const li = document.createElement("li");
      const b = document.createElement("span"); b.className = "enq-panel__k"; b.textContent = k + ": ";
      li.append(b, v);
      panelItems.appendChild(li);
    }
    panelItems.hidden = !lines.length;
    if (key === tileKey) return;
    const before = new Set(tileKey ? tileKey.split("|") : []);
    tileKey = key;
    tilesEl.textContent = "";
    if (!on.length) for (let i = 0; i < 3; i++) {
      const g = document.createElement("li");
      g.className = "enq-tile enq-tile--ghost"; g.setAttribute("aria-hidden", "true");
      const f = document.createElement("span"); f.className = "enq-tile__fig";
      g.appendChild(f); tilesEl.appendChild(g);
    }
    for (const b of on) {
      const li = tileFor(b);
      li.classList.toggle("is-new", live && !before.has(b.dataset.cat));
      tilesEl.appendChild(li);
    }
    mountThumbs();
  }

  const ranges = new Map();
  let rangesP = null;
  async function mountRange(el) {
    if (!el.dataset.rfig || el.dataset.mounted) return null;
    el.dataset.mounted = "1";
    const m = await lib();
    const core = await m.loadCore();
    const name = el.dataset.rfig;
    const mod = await m.loadFig(name);
    const h = mod[name](el, { intensity: 0.6, theme: "light", drive: 1 });
    const f = { el, h, held: false, t: 0 };
    f.drive = (v) => h.drive(v);
    f.hold = (on) => { on = !!on; if (on !== f.held) { f.held = on; core.hold(el, on); } };
    f.hold(true);
    return f;
  }
  const loadRanges = () => (rangesP ||= (async () => {
    for (const b of goodsBoxes) {
      const f = await mountRange(b.closest(".pick").querySelector("[data-rfig]"));
      if (f) ranges.set(b.dataset.cat, f);
    }
  })().catch(() => {  }));
  function mountThumbs() {
    if (!wideMQ.matches) return;
    for (const li of thumbs.values()) { const el = li.querySelector("[data-rfig]"); if (!el.dataset.mounted) mountRange(el).catch(() => {}); }
  }
  const MOVE_MAX = 2, OUT_MS = 650, BACK_MS = 1300;
  const moving = [], paused = [];
  function endMove(f) {
    clearTimeout(f.t);
    const i = moving.indexOf(f); if (i >= 0) moving.splice(i, 1);
    f.hold(true);
    if (step !== 1) { f.drive(1); paused.push(f); return; }
    resumePaused();
  }
  function resumePaused() {
    while (step === 1 && moving.length < MOVE_MAX && paused.length) {
      const g = paused.shift();
      g.drive(1); g.hold(false); moving.push(g);
      g.t = setTimeout(() => endMove(g), BACK_MS);
    }
  }
  function playRange(cat) {
    const f = ranges.get(cat);
    if (!live || !f) return;
    const j = paused.indexOf(f); if (j >= 0) paused.splice(j, 1);
    if (!moving.includes(f)) {
      if (moving.length >= MOVE_MAX) { const o = moving.shift(); clearTimeout(o.t); o.hold(true); o.drive(1); paused.push(o); }
      moving.push(f);
    }
    clearTimeout(f.t);
    f.hold(false);
    f.drive(0);
    f.t = setTimeout(() => { f.drive(1); f.t = setTimeout(() => endMove(f), BACK_MS); }, OUT_MS);
  }

  const figs = {};
  let libP = null, chain = Promise.resolve();
  const lib = () => (libP ||= import("/assets/js/figures.js" + new URL(import.meta.url).search));
  function ensureFigs() {
    chain = chain.then(async () => {
      const m = await lib();
      const core = await m.loadCore();
      const els = $$("[data-fig]", form).concat(wideMQ.matches ? $$("[data-fig]", panel) : []);
      for (const el of els) {
        const k = (panel.contains(el) ? "panel" : "card") + "-" + (el.dataset.fig === "ship" ? "sea" : "air");
        if (figs[k]) continue;
        const name = el.dataset.fig;
        const mod = await m.loadFig(name);
        const ns = el.querySelector("noscript"); if (ns) ns.remove();
        const h = mod[name](el, { intensity: 0.6, theme: "light", drive: 0 });
        const f = { el, h, d: 0, held: false, t: 0 };
        f.drive = (v) => { v = Math.round(v * 1000) / 1000; if (v !== f.d) { f.d = v; h.drive(v); } };
        f.hold = (on) => { on = !!on; if (on !== f.held) { f.held = on; core.hold(el, on); } };
        f.hold(live);
        figs[k] = f;
      }
    }).catch(() => {  });
    return chain;
  }
  const park = (f, to, ms) => { clearTimeout(f.t); f.hold(false); f.drive(to); f.t = setTimeout(() => f.hold(true), live ? ms : 0); };
  const play = (f) => {
    clearTimeout(f.t); f.hold(false);
    if (!live) { f.drive(1); return; }
    f.drive(0);
    requestAnimationFrame(() => f.drive(1));
    f.t = setTimeout(() => f.hold(true), 2400);
  };
  let appliedMode = "";
  async function applyMode(animate) {
    const m = mode();
    panel.dataset.mode = m;
    if (m === appliedMode && !animate) return;
    const prev = appliedMode;
    appliedMode = m;
    if (!m || m === "unsure") { if (!Object.keys(figs).length) return; }
    await ensureFigs();
    if (mode() !== m) return;
    const other = m === "sea" ? "air" : m === "air" ? "sea" : null;
    let wait = 0;
    for (const w of ["card", "panel"]) {
      for (const which of ["sea", "air"]) {
        const f = figs[w + "-" + which];
        if (!f || which === m) continue;
        if (w === "card" && f.d > 0) { park(f, 0, 700); wait = 750; }
        else f.hold(true);
      }
    }
    const c = figs["card-" + m], p = figs["panel-" + m];
    if (c) { if (animate || prev !== m) play(c); }
    if (p) setTimeout(() => { if (mode() === m) play(p); }, live ? wait : 0);
  }

  let announceT = 0;
  function announce(msg) {
    clearTimeout(announceT);
    liveEl.textContent = "";
    announceT = setTimeout(() => { liveEl.textContent = msg; }, 60);
  }
  function problems() {
    const out = [];
    if (!chosenGoods().length && !note.value.trim()) out.push({ key: "goods", text: "what you are buying", step: 1, el: goodsBoxes[0] });
    if (!nameEl.value.trim()) out.push({ key: "name", text: "your name", step: 4, el: nameEl });
    const e = emailEl.value.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) out.push({ key: "email", text: e ? "a valid email address" : "your email address", step: 4, el: emailEl });
    if (!consentEl.checked) out.push({ key: "consent", text: "the privacy tick", step: 4, el: consentEl });
    return out;
  }
  function renderMissing() {
    const p = problems();
    missingEl.hidden = !p.length;
    missingEl.textContent = "";
    if (!p.length) return;
    missingEl.append("Still needed to send: ");
    p.forEach((x, i) => {
      if (i) missingEl.append(i === p.length - 1 ? " and " : ", ");
      if (x.step !== 4) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "enq-linkbtn"; b.textContent = x.text + " (step " + x.step + ")";
        b.addEventListener("click", () => go(x.step));
        missingEl.appendChild(b);
      } else missingEl.append(x.text);
    });
    missingEl.append(".");
  }
  function render() {
    const s = summary();
    sumMain.textContent = s || "Nothing chosen yet. Use the steps above to go back and choose.";
    sumTop.textContent = s;
    sumTop.hidden = !s || step === N;
    const onCats = new Set(chosenGoods().map((b) => b.dataset.cat));
    itemGroups.forEach((g) => g.classList.toggle("is-on", onCats.has(g.dataset.itemsFor)));
    itemsEl.classList.toggle("is-on", itemGroups.some((g) => onCats.has(g.dataset.itemsFor)));
    renderTiles();
    const m = mode();
    panelMode.textContent = m === "sea" ? "By sea" : m === "air" ? "By air" : m === "unsure" ? "Sea or air, to be advised" : "Sea or air";
    const d = destText();
    panelDest.textContent = d || "Not chosen yet";
    panelDest.classList.toggle("is-empty", !d);
    panel.classList.toggle("has-dest", !!d);
    const p = port.value.trim();
    panelPort.textContent = p ? "Port: " + p : "";
    const doneFlags = [chosenGoods().length > 0 || !!note.value.trim(), !!val("transport"), !!val("destination"), false];
    barBtns.forEach((b, i) => {
      b.classList.toggle("is-done", doneFlags[i]);
      b.querySelector("[data-state]").textContent = doneFlags[i] ? ", done" : "";
      if (i + 1 === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    const other = val("destination") === "Another country";
    countryField.hidden = !other;
    country.disabled = !other;
    if (errGoods.classList.contains("is-shown") && goodsOk()) hideGoodsErr();
    renderMissing();
  }
  const goodsOk = () => chosenGoods().length > 0 || !!note.value.trim();
  const goodsFocus = [...goodsBoxes, note];
  function showGoodsErr() {
    errGoods.querySelector("span").textContent = "Choose at least one range, or write what you need under “Something not listed?”.";
    errGoods.classList.add("is-shown");
    goodsFocus.forEach((el) => el.setAttribute("aria-describedby", errGoods.id));
  }
  function hideGoodsErr() {
    errGoods.classList.remove("is-shown");
    goodsFocus.forEach((el) => el.removeAttribute("aria-describedby"));
  }

  const titleOf = (n) => steps[n - 1].querySelector(".enq-step__title").textContent;
  function go(n, opts = {}) {
    n = Math.max(1, Math.min(N, n));
    const changed = n !== step;
    step = n;
    steps.forEach((s, i) => s.classList.toggle("is-active", i + 1 === n));
    render();
    if (n === 2 || n === 3) ensureFigs().then(() => applyMode(false));
    if (n === 1) resumePaused();
    if (opts.focus === false) return;
    if (changed) announce("Step " + n + " of " + N + ": " + titleOf(n));
    steps[n - 1].querySelector(".enq-step__title").focus({ preventScroll: true });
    const r = bar.getBoundingClientRect();
    if (r.top < 72 || r.top > innerHeight * 0.45) bar.scrollIntoView({ block: "start", behavior: "auto" });
  }
  barBtns.forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
  function next() {
    if (step === 1 && !goodsOk()) {
      showGoodsErr();
      announce("Choose at least one range, or write what you need under Something not listed.");
      goodsBoxes[0].focus();
      return;
    }
    go(step + 1);
  }
  $$("[data-next]", form).forEach((b) => b.addEventListener("click", next));
  $$("[data-back]", form).forEach((b) => b.addEventListener("click", () => go(step - 1)));

  function fieldCheck(el) {
    const v = el.value.trim();
    if (el === consentEl) return consentEl.checked ? "" : el.dataset.msg;
    if (el.required && !v) return el.dataset.msg;
    if (v && el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return el.dataset.msg;
    if (v && el.hasAttribute("data-phone") && (!/^[0-9+()\-\s.]+$/.test(v) || v.replace(/\D/g, "").length < 7)) return el.dataset.msg;
    return "";
  }
  function show(el) {
    const field = el.closest(".field"), err = field.querySelector(".field__error"), msg = fieldCheck(el);
    field.classList.toggle("is-invalid", !!msg);
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) { err.querySelector("span").textContent = msg; el.setAttribute("aria-describedby", err.id); }
    else el.removeAttribute("aria-describedby");
    return !msg;
  }
  const checked = [nameEl, emailEl, phoneEl, consentEl];
  checked.forEach((el) => {
    el.addEventListener("blur", () => { if (el.value.trim() || el.dataset.touched) show(el); el.dataset.touched = "1"; });
    el.addEventListener("input", () => { if (el.closest(".field").classList.contains("is-invalid")) show(el); });
    if (el === consentEl) el.addEventListener("change", () => { if (el.closest(".field").classList.contains("is-invalid")) show(el); });
  });

  form.addEventListener("input", () => render());
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "transport") applyMode(true);
    if (t.matches('input[name="goods[]"]')) {
      if (product && !chosenGoods().some((b) => b.dataset.cat === product.cat)) { productField.value = ""; fromProduct.hidden = true; }
      if (t.checked) {
        playRange(t.dataset.cat);
        const n = itemBoxes.filter((i) => i.dataset.cat === t.dataset.cat).length;
        if (n) announce(t.value + ": " + n + " items listed below the ranges.");
      } else itemBoxes.forEach((i) => { if (i.dataset.cat === t.dataset.cat) i.checked = false; });
    }
    render();
  });
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const t = e.target;
    if (t.matches(".pick__input, .enq-item .check__input")) {
      e.preventDefault();
      if (t.type === "checkbox" || !t.checked) t.click();
      return;
    }
    if (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "radio" && step < N) { e.preventDefault(); next(); }
  });
  let warmed = false;
  const warm = () => { if (warmed) return; warmed = true; (window.requestIdleCallback || setTimeout)(() => ensureFigs().then(() => applyMode(false)), { timeout: 1500 }); };
  form.addEventListener("pointerdown", warm, { once: true });
  form.addEventListener("keydown", warm, { once: true });
  wideMQ.addEventListener("change", () => { if (warmed) ensureFigs().then(() => applyMode(false)); });

  function setBusy(on) {
    busy = on;
    btn.classList.toggle("is-loading", on);
    if (on) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
    btn.setAttribute("aria-busy", on ? "true" : "false");
    btnLabel.textContent = on ? "Sending…" : "Send request";
  }
  async function send() {
    if (busy) return;
    const p = problems();
    failEl.hidden = true;
    if (p.length) {
      checked.forEach((el) => { el.dataset.touched = "1"; show(el); });
      if (p.some((x) => x.key === "goods")) showGoodsErr();
      missingEl.classList.add("is-alert");
      const names = p.map((x) => x.text);
      announce((p.length === 1 ? "One thing needs a look: " : p.length + " things need a look: ") + list(names) + ".");
      renderMissing();
      const first = p.find((x) => x.step === 4);
      if (first) { if (step !== 4) go(4, { focus: false }); first.el.focus(); }
      else { go(1, { focus: false }); (note.value ? note : goodsBoxes[0]).focus(); }
      return;
    }
    let rt = form.querySelector('input[name="_replyto"]');
    if (!rt) { rt = document.createElement("input"); rt.type = "hidden"; rt.name = "_replyto"; form.appendChild(rt); }
    rt.value = emailEl.value.trim();
    setBusy(true);
    announce("Sending your request.");
    let ok = false;
    try {
      const fd = new FormData(form);
      fd.delete("items[]");
      fd.set("items", itemsText());
      fd.set("not_listed", note.value.trim());
      const res = await fetch(form.action, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      ok = res.ok;
    } catch (e) { ok = false; }
    setBusy(false);
    if (ok) {
      wrap.hidden = true; bar.hidden = true; sumTop.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      done.scrollIntoView({ block: "center", behavior: "auto" });
      window.amsTrack && window.amsTrack("generate_lead", { transport: val("transport"), destination: val("destination"), goods_count: goodsBoxes.filter((b) => b.checked).length, items_count: itemsCount() });
      announce("Your request has been sent.");
    } else {
      failEl.hidden = false;
      failEl.focus({ preventScroll: true });
      announce("We could not send this.");
    }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
  $("[data-retry]").addEventListener("click", send);

  render();
  const idleLoad = () => (window.requestIdleCallback || setTimeout)(() => loadRanges(), { timeout: 1200 });
  if (document.readyState === "complete") idleLoad(); else addEventListener("load", idleLoad, { once: true });
  wideMQ.addEventListener("change", mountThumbs);
  appliedMode = "";
  if (wideMQ.matches && !mode()) { warmed = true; (window.requestIdleCallback || setTimeout)(() => ensureFigs().then(() => applyMode(false)), { timeout: 1500 }); }
  if (mode()) { warmed = true; ensureFigs().then(() => applyMode(false)); }
}
