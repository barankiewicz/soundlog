# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm install        # install dependencies and populate node_modules
npm run fetch-model # optional: download the local AI model (~23 MB) into models/ (gitignored)
npm run build      # copy + patch vendor libs and ORT wasm into src/libs/, bundle models/, zip Chrome + Firefox builds into dist/
npm test           # run the OR-Set CRDT unit tests (tests/or-set.test.mjs)
```

`npm test` covers the CRDT logic only. Everything else (UI, ingestion, Last.fm calls) is tested manually by loading the unpacked extension in the browser. The build works without `fetch-model`; the AI matching strategy is simply unavailable until the model is present.

---

## Architecture

SoundLog is a Manifest V3 browser extension with two separate JS execution contexts that share only IndexedDB. Never assume a variable or module instance in one context is visible in the other.

**Background (`background.js`)** runs as a persistent event page (Firefox) or service worker (Chrome). It polls Last.fm every 15 minutes via browser alarms, pipes raw scrobbles through the RxJS aggregation pipeline in `src/core/stream.js`, and writes qualified album cards to the CRDT store via `syncAlbumToCRDT` in `src/store/crdt-db.js`. The historical scan (`runHistoricalScan`) follows the same write path, page by page.

**Popup (`popup/popup.js`)** is a short-lived page that renders the review queue and settings. It reads the queue with `readFreshAlbumQueue()` and removes processed albums with `removeFreshAlbumFromQueue()`.

**Storage layer.** The queue is a hand-written observed-remove set (OR-Set) CRDT in `src/store/or-set.js`, persisted to IndexedDB by `src/store/crdt-db.js`. There is no Yjs or external CRDT dependency. Because the popup and background are separate contexts sharing only IndexedDB, every operation in `crdt-db.js` is read-merge-modify-write: it loads the current state from disk, applies the change, and writes back. The OR-Set's conflict-free `merge()` means a popup removal and a background add can never clobber each other. As a result there is no stale-singleton hazard, and `getAlbumQueue`/`removeAlbumFromQueue` are simply aliases for the `*Fresh*` functions -- all paths read from disk.

The OR-Set is a convergent (state-based) CRDT: `merge()` is commutative, associative, and idempotent (see `tests/or-set.test.mjs` for the properties verified). Value resolution for a concurrently-added key is deterministic (largest surviving dot wins), so replicas converge on the same value, not just the same membership. This is what keeps future local-to-cloud sync safe to add without touching the queue logic.

**Data flow:**

```
Last.fm API
    |
background.js (alarm every 15 min)
    |
src/core/stream.js  -- RxJS: filter > groupBy artist+album > mergeMap > toArray > map > filter(>= 5 unique tracks)
    |
src/store/crdt-db.js  -- syncAlbumToCRDT: load OR-Set from IndexedDB, dedup, add, persist
    |
popup/popup.js  -- readFreshAlbumQueue() reads the OR-Set from IndexedDB and renders cards
```

**Vendor libraries** live in `src/libs/` and are NOT in source control (gitignored). They are copied from `node_modules/` by `build.js` each time. Do not edit them by hand; edit `build.js` instead. Two libraries get a string patch during copy: RxJS (replace the top-level `this` IIFE argument with `globalThis` so it attaches to `window.rxjs` in a strict module context) and Transformers.js (replace protobufjs's `eval("require")` probe with a function returning null, since MV3 CSP forbids eval). Only libraries that ship browser-ready, self-contained files are vendored this way (signals, RxJS UMD, the Transformers.js webpack bundle, the webextension polyfill). Libraries published as bare-specifier ES modules with their own dependency graph (such as Yjs, which needs lib0) cannot be dropped in without a bundler, which is why the CRDT is hand-written instead.

**Matching and the AI model.** Queue de-duplication is text-only (`src/core/text-match.js`: exact key + Levenshtein), so a historical scan never loads a model. The AI matcher (`src/core/vector-matcher.js`) is the opt-in surface, reached through `src/core/matcher-router.js`, which honors the popup's strategy selector (Levenshtein / Hybrid / AI). Hybrid only escalates to an embedding for genuinely ambiguous pairs (text score between 0.80 and 0.95). To exercise the AI deliberately, set the strategy in the popup, then call `runMatchTest(a, b)` from the background console (exposed in `background.js`).

The model runs fully offline. `vector-matcher.js` sets `allowLocalModels = true` / `allowRemoteModels = false`, loads weights from `models/` (downloaded by `npm run fetch-model`, gitignored, bundled into the build), and points ONNX at the bundled wasm runtime in `src/libs/ort/` (copied from `node_modules/onnxruntime-web` by `build.js`). `models/*` and `src/libs/ort/*` are declared in `web_accessible_resources` in both manifests. If `models/` is absent, the build still succeeds and the AI path degrades gracefully (the matcher catches the load failure and returns 0).

**Manifests** are split: `config/manifest.chrome.json` and `config/manifest.firefox.json`. The repo-root `manifest.json` is gitignored -- it is not the source of truth.

**State layer** (`src/store/state.js`) exposes Preact Signals: `pendingReviews` and `matchingStrategy`. The popup subscribes to `pendingReviews` through an `effect()` that re-renders the queue whenever the signal changes; queue loads and removals update the signal rather than calling the render function directly.

---

## Hard rules (from original architecture spec)

1. **Full extension paths on all imports.** No bundler resolves bare specifiers at runtime. Every import must include the full path and `.js` extension: `import { foo } from './bar.js'`, never `'./bar'`.

2. **No state in the DOM.** State mutations go through Preact Signals (`.value = ...`). Do not read state back out of DOM attributes or element content.

3. **Cross-context data via storage or Yjs, not shared variables.** Popup and background are separate threads. Use `browser.storage.local` or the fresh-read CRDT functions to pass data across the boundary.

---

## Content Security Policy note

The manifest sets `'wasm-unsafe-eval'` in the CSP to allow ONNX Runtime Web to allocate WebAssembly. `src/core/vector-matcher.js` disables local model downloads (`env.allowLocalModels = false`) and pins the WASM thread count to 1 (`env.backends.onnx.env.wasm.numThreads = 1`) to keep execution safe and single-threaded inside the extension sandbox.

---

## Style notes

No emojis anywhere in the codebase -- not in console.log, comments, or UI strings. No em dashes. UI copy should be short and plain.
