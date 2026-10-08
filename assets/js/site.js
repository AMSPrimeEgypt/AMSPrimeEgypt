(function () {
  "use strict";
  document.documentElement.classList.add("js");
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduce = mq("(prefers-reduced-motion: reduce)");
  var hasIO = "IntersectionObserver" in window;

  var header = document.querySelector(".site-header");
  if (header && hasIO) {
    var mark = document.createElement("div");
    mark.setAttribute("aria-hidden", "true");
    mark.style.cssText = "position:absolute;top:0;left:0;width:1px;height:40px;pointer-events:none;visibility:hidden";
    document.body.prepend(mark);
    new IntersectionObserver(function (e) {
      header.classList.toggle("is-scrolled", !e[e.length - 1].isIntersecting);
    }).observe(mark);
  }

  var reveals = document.querySelectorAll(".section-head, .step, .vstep, .mosaic__item, .spine__item");
  if (!hasIO || reduce) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var nextStep = 0;
    var io = new IntersectionObserver(function (entries) {
      var batch = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        if (el.classList.contains("step") || el.classList.contains("vstep")) {
          var now = performance.now(), start = Math.max(now, nextStep);
          el.style.setProperty("--d", Math.round(start - now) + "ms");
          nextStep = start + (el.classList.contains("vstep") ? 640 : 520);
        } else if (el.classList.contains("mosaic__item")) {
          el.style.setProperty("--d", Math.min(batch++, 5) * 80 + "ms");
        } else if (el.classList.contains("spine__item")) {
          el.style.setProperty("--d", Math.min(batch++, 8) * 60 + "ms");
        }
        el.classList.add("is-in");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  var stage = document.querySelector(".hero__stage");
  var heroEl = document.querySelector(".hero");
  var pauseBtn = document.querySelector(".hero__pause");
  if (stage && heroEl) {
    var layers = stage.querySelectorAll(".hero__layer");
    var mqMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: no-preference)") : null;
    var mqWide = window.matchMedia ? window.matchMedia("(min-width: 64em) and (orientation: landscape)") : null;
    var canLoop = function () { return !!(mqMotion && mqMotion.matches && mqWide && mqWide.matches); };
    var LOOP_KEY = "ams-hero-loop";
    var userPaused = false, offScreen = false, hiddenTab = document.hidden;
    try { userPaused = sessionStorage.getItem(LOOP_KEY) === "paused"; } catch (e) {}
    var setDurations = function () {
      var W = stage.clientWidth || window.innerWidth;
      for (var i = 0; i < layers.length; i++) {
        var el = layers[i];
        var n = parseFloat(getComputedStyle(el).getPropertyValue("--n")) || 1;
        var tile = el.offsetWidth / n;
        var perScreen = parseFloat(el.getAttribute("data-speed")) || 60;
        el.style.setProperty("--dur", (perScreen * tile / W).toFixed(2) + "s");
      }
    };
    var apply = function () {
      stage.classList.toggle("is-paused", userPaused || offScreen || hiddenTab || !canLoop());
      if (pauseBtn) {
        pauseBtn.hidden = !canLoop();
        pauseBtn.classList.toggle("is-paused", userPaused);
        pauseBtn.setAttribute("aria-label", (userPaused ? "Play" : "Pause") + " background animation");
        pauseBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
      }
    };
    setDurations();
    var rt = 0;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { setDurations(); apply(); }, 150); });
    if (pauseBtn) pauseBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      try { if (userPaused) sessionStorage.setItem(LOOP_KEY, "paused"); else sessionStorage.removeItem(LOOP_KEY); } catch (e) {}
      apply();
    });
    if (hasIO) new IntersectionObserver(function (entries) { offScreen = !entries[0].isIntersecting; apply(); }, { threshold: 0.05 }).observe(heroEl);
    document.addEventListener("visibilitychange", function () { hiddenTab = document.hidden; apply(); });
    if (mqMotion && mqMotion.addEventListener) { mqMotion.addEventListener("change", apply); mqWide.addEventListener("change", apply); }
    apply();
  }

  var spine = document.querySelector(".spine");
  if (spine) {
    var touchTap = false;
    var closeSpine = function () {
      spine.classList.remove("has-open");
      spine.querySelectorAll(".is-open").forEach(function (li) { li.classList.remove("is-open"); });
    };
    document.addEventListener("pointerdown", function (e) {
      touchTap = e.pointerType === "touch";
      if (touchTap && !spine.contains(e.target)) closeSpine();
    }, { passive: true });
    spine.addEventListener("click", function (e) {
      if (!touchTap || !mq("(min-width: 64em)")) return;
      var li = e.target.closest(".spine__item");
      if (!li || li.classList.contains("is-open")) return;
      e.preventDefault();
      closeSpine();
      li.classList.add("is-open");
      spine.classList.add("has-open");
    });
  }

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Menu");
      nav.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  var form = document.querySelector("[data-qform]");
  if (form && window.fetch && window.FormData) {
    form.noValidate = true;
    var params = new URLSearchParams(location.search);
    var sel = form.querySelector("[data-product-select]");
    var want = params.get("product");
    if (sel && want) {
      var pick = function (id) {
        for (var i = 0; i < sel.options.length; i++) if (sel.options[i].getAttribute("data-id") === id) { sel.selectedIndex = i; return true; }
        return false;
      };
      if (!pick(want)) pick(want.split("/")[0]);
    }
    var page = form.querySelector("[data-page-field]");
    if (page) {
      try {
        var ref = document.referrer ? new URL(document.referrer) : null;
        page.value = (ref && ref.origin === location.origin ? ref.pathname : "/contact/") + (want ? " (product: " + want + ")" : "");
      } catch (e) {}
    }
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var problem = function (el) {
      var v = el.value.trim();
      if (el.required && !v) return el.getAttribute("data-msg");
      if (v && el.type === "email" && !EMAIL.test(v)) return el.getAttribute("data-msg");
      if (v && el.hasAttribute("data-phone") && (!/^[0-9+()\-\s.]+$/.test(v) || v.replace(/\D/g, "").length < 7)) return el.getAttribute("data-msg");
      return "";
    };
    var show = function (el) {
      var field = el.closest(".field"), msg = problem(el), err = field && field.querySelector(".field__error");
      if (!field || !err) return !msg;
      field.classList.toggle("is-invalid", !!msg);
      field.classList.toggle("is-valid", !msg && !!el.value.trim() && el.required);
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) { err.querySelector("span").textContent = msg; el.setAttribute("aria-describedby", err.id); }
      else el.removeAttribute("aria-describedby");
      return !msg;
    };
    var checked = form.querySelectorAll("input[required], [data-phone]");
    checked.forEach(function (el) {
      el.addEventListener("blur", function () { if (el.value.trim() || el.dataset.touched) show(el); el.dataset.touched = "1"; });
      el.addEventListener("input", function () { if (el.closest(".field").classList.contains("is-invalid")) show(el); });
    });
    var errBox = form.querySelector("[data-form-error]");
    var btn = form.querySelector("[data-submit]");
    var label = form.querySelector("[data-submit-label]");
    var busy = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var first = null;
      checked.forEach(function (el) { el.dataset.touched = "1"; if (!show(el) && !first) first = el; });
      if (first) { first.focus(); return; }
      busy = true;
      if (errBox) errBox.hidden = true;
      btn.classList.add("is-loading");
      btn.setAttribute("aria-disabled", "true");
      label.textContent = "Sending...";
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("status " + r.status); })
        .then(function () {
          var wrap = document.querySelector("[data-qform-wrap]"), done = document.querySelector("[data-qsuccess]");
          if (wrap) wrap.hidden = true;
          if (done) { done.hidden = false; done.focus(); }
        })
        .catch(function () {
          if (errBox) { errBox.hidden = false; errBox.focus(); }
        })
        .then(function () {
          busy = false;
          btn.classList.remove("is-loading");
          btn.removeAttribute("aria-disabled");
          label.textContent = "Send enquiry";
        });
    });
  }

  var bar = document.querySelector("[data-consent]");
  var KEY = "ams-consent";
  var read = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var save = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
  var gaId = document.documentElement.getAttribute("data-ga");
  var granted = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
  window.amsTrack = function (name, params) { if (granted && gaId && window.gtag) window.gtag("event", name, params || {}); };
  var loadAnalytics = function () {
    if (!gaId) return;
    granted = true;
    if (window.__gaLoaded) {
      window["ga-disable-" + gaId] = false;
      window.gtag("consent", "update", { analytics_storage: "granted" });
      return;
    }
    window.__gaLoaded = true;
    window.gtag("consent", "update", { analytics_storage: "granted" });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaId);
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", gaId, { anonymize_ip: true });
  };
  var stopAnalytics = function () {
    granted = false;
    if (gaId) window["ga-disable-" + gaId] = true;
    if (window.__gaLoaded) window.gtag("consent", "update", { analytics_storage: "denied" });
    var host = location.hostname, parts = host.split("."), domains = ["", host, "." + host];
    for (var i = 1; i < parts.length - 1; i++) domains.push("." + parts.slice(i).join("."));
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (n !== "_ga" && n.indexOf("_ga_") !== 0 && n !== "_gid" && n.indexOf("_gat") !== 0) return;
      domains.forEach(function (d) {
        document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (d ? "; domain=" + d : "");
      });
    });
  };
  var showBar = function () {
    if (!bar) return;
    bar.hidden = false;
    document.body.classList.add("has-consent");
    document.body.style.setProperty("--consent-h", bar.offsetHeight + "px");
    document.documentElement.style.scrollPaddingBlockEnd = (bar.offsetHeight + 16) + "px";
  };
  var hideBar = function () {
    if (!bar) return;
    bar.hidden = true;
    document.body.classList.remove("has-consent");
    document.documentElement.style.scrollPaddingBlockEnd = "";
  };
  if (bar) {
    var choice = read();
    if (choice === "accept") loadAnalytics();
    else if (choice !== "reject") showBar();
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-consent-choice]");
      if (!btn) return;
      var v = btn.getAttribute("data-consent-choice");
      save(v);
      hideBar();
      if (v === "accept") loadAnalytics(); else if (v === "reject") stopAnalytics();
    });
    document.querySelectorAll("[data-consent-open]").forEach(function (b) {
      b.addEventListener("click", showBar);
    });
  }
})();
