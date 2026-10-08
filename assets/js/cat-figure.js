const el = document.querySelector("[data-catfig]");
if (el) {
  const lib = () => import("/assets/js/figures.js" + new URL(import.meta.url).search);
  lib().then((m) => {
    m.within(el, async () => {
      try {
        await m.loadCore();
        const name = el.dataset.fig;
        const mod = await m.loadFig(name);
        const ns = el.querySelector("noscript");
        if (ns) ns.remove();
        mod[name](el, { intensity: 0.6, theme: "light", drive: 0 });
        el.dataset.ready = "1";
      } catch (e) {  }
    });
  }).catch(() => {});
}
