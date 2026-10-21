import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = readFileSync("assets/js/loader.js", "utf8");

function page({ readyState = "loading", reducedMotion = false, storageFails = false } = {}) {
  const classes = new Set();
  const events = new Map();
  const timers = new Map();
  const label = {};
  let removed = false;
  let timerId = 0;
  const loader = { classList: { add() {} }, remove() { removed = true; } };
  const on = (name, handler) => events.set(name, handler);
  const window = {
    addEventListener: on,
    removeEventListener: name => events.delete(name),
    matchMedia: () => ({ matches: reducedMotion }),
  };
  const document = {
    readyState,
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    addEventListener: on,
    getElementById: id => id === "site-loader-label" ? label : removed ? null : loader,
  };
  runInNewContext(source, {
    window, document,
    localStorage: { getItem() { if (storageFails) throw new Error("blocked"); return "es"; } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    events, classes, label, timers,
    get removed() { return removed; },
    runTimer(ms) {
      const entry = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(entry, `Expected timer for ${ms}ms`);
      timers.delete(entry[0]);
      entry[1].fn();
    },
  };
}

test("normal loading localizes status and releases the page without waiting 3.5 seconds", () => {
  const p = page();
  assert.ok(p.classes.has("loader-pending"));
  p.events.get("DOMContentLoaded")();
  assert.equal(p.label.textContent, "Cargando Kuwago…");
  p.events.get("load")();
  assert.equal([...p.timers.values()].some(timer => timer.ms === 8000), false);
  p.runTimer(200);
  assert.equal(p.classes.has("loader-pending"), false);
  assert.ok(p.removed);
});

test("stalled resources release the page even before body parsing completes", () => {
  const p = page();
  p.runTimer(8000);
  p.runTimer(200);
  p.events.get("DOMContentLoaded")();
  assert.equal(p.classes.has("loader-pending"), false);
  assert.ok(p.removed);
});

test("a completed document and unavailable storage work with reduced motion", () => {
  const p = page({ readyState: "complete", reducedMotion: true, storageFails: true });
  assert.equal(p.label.textContent, "Loading Kuwago…");
  p.runTimer(0);
  assert.equal(p.classes.has("loader-pending"), false);
  assert.ok(p.removed);
});

test("restoring a cached page dismisses the loader", () => {
  const p = page();
  p.events.get("pageshow")({ persisted: true });
  p.runTimer(200);
  assert.equal(p.classes.has("loader-pending"), false);
});
