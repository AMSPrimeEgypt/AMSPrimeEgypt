const el = document.querySelector("[data-exportfig]");
if (el) {
  const live = document.documentElement.classList.contains("live");
  const touch = matchMedia("(pointer: coarse), (max-width: 63.99em)").matches;
  import("/assets/js/figures.js" + new URL(import.meta.url).search).then((m) => {
    m.within(el, async () => {
      try {
        await m.loadCore();
        const mod = await m.loadFig("container");
        const ns = el.querySelector("noscript");
        if (ns) ns.remove();
        const fig = mod.container(el, { intensity: 0.5, theme: "light", drive: live ? 0 : 1 });
        el.dataset.ready = "1";
        if (!live) return;
        let done = false, queued = false;
        const update = () => {
          queued = false;
          if (done) return;
          const r = el.getBoundingClientRect(), vh = innerHeight;
          const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.7)));
          fig.drive(p);
          if (p >= 1) { done = true; removeEventListener("scroll", onScroll); }
        };
        const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
        if (touch) {
          const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fig.drive(1); } }, { threshold: 0.35 });
          io.observe(el);
        } else {
          addEventListener("scroll", onScroll, { passive: true });
          update();
        }
      } catch (e) {  }
    });
  }).catch(() => {});
}
