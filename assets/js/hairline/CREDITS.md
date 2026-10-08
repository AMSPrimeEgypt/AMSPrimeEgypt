# Credits

**Engine: Hairline, by Lucas Marques. MIT licence (see `LICENSE`).**
- `hairline-core.js` is the engine from `upstream/hairline-ext.js`, cut down to the core. The 27 original demo figures were left out to save weight.
- Small additions, each marked "sourcing-test-hairline" in the file:
  - `hold(stage, on)` makes a figure sleep even when it would like to move.
  - `live()` and `ticks()` are counters used by the proof runs.
  - `pace(n)` lets figures move on every second frame while the page scrolls. They catch up in time, so nothing moves less far.

**Figures: Esslam's own new code, written on that engine.**
- `figures-custom.js` holds the truck, pallet and ship.
  - It is generated from `upstream/figures-custom.js` by `tools/patch-figures-drive.cjs`.
  - That step gives these three figures the same `drive` option (0 to 1) the others already had, and points the import at `hairline-core.js`.
- `figures-more.js` holds the aircraft, fruit crate, grain sacks and vegetable crate.
  - It is `upstream/figures-more.js` with only the import changed.

**Unchanged copies:** `upstream/` keeps the files exactly as received, for reference.
