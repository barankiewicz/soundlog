# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm install       # install dependencies and populate node_modules
npm run build     # copy + patch vendor libs into src/libs/, then zip Chrome + Firefox builds into dist/
```

There is no test suite. Manual testing is done by loading the unpacked extension in the browser.

---

## Architecture

SoundLog is a Manifest V3 browser extension with two separate JS execution contexts that share only IndexedDB. Never assume a variable or module instance in one context is visible in the other.

**Background (`background.js`)** runs as a persistent event page (Firefox) or service worker (Chrome). It owns the authoritative Yjs document instance. It polls Last.fm every 15 minutes via browser alarms, pipes raw scrobbles through the RxJS aggregation pipeline in `src/core/stream.js`, and writes qualified album cards to the CRDT store via `syncAlbumToCRDT` in `src/store/crdt-db.js`. The historical scan (`runHistoricalScan`) follows the same write path, page by page.

**Popup (`popup/popup.js`)** is a short-lived page that renders the review queue and settings. It imports `src/store/crdt-db.js` independently, which creates its own `Y.Doc` + `IndexeddbPersistence` instance. This instance reads IndexedDB once at creation and does not receive subsequent writes from the background. Always call `readFreshAlbumQueue()` and `removeFreshAlbumFromQueue()` from the popup -- these create a throwaway doc, wait for `whenSynced`, and return fresh data. Never call `getAlbumQueue()` or `removeAlbumFromQueue()` from popup context; those use the stale module-level singleton.

**Data flow:**

```
Last.fm API
    |
background.js (alarm every 15 min)
    |
src/core/stream.js  -- RxJS: filter > groupBy artist+album > mergeMap > toArray > map > filter(>= 5 unique tracks)
    |
src/store/crdt-db.js  -- syncAlbumToCRDT writes to Y.Doc, IndexeddbPersistence persists to IndexedDB
    |
popup/popup.js  -- readFreshAlbumQueue() spins up fresh Y.Doc, reads IndexedDB, renders cards
```

**Vendor libraries** live in `src/libs/` and are NOT in source control. They are copied from `node_modules/` by `build.js` each time. Do not edit them by hand; edit `build.js` instead. The RxJS UMD bundle gets a one-line patch during copy to replace the top-level `this` IIFE argument with `globalThis` so it attaches to `window.rxjs` inside a strict ES module context.

**Manifests** are split: `config/manifest.chrome.json` and `config/manifest.firefox.json`. The repo-root `manifest.json` is gitignored -- it is not the source of truth.

**State layer** (`src/store/state.js`) exposes Preact Signals: `pendingReviews` and `matchingStrategy`. These are not yet wired to the popup render loop (work in progress -- popup currently uses manual `innerHTML`).

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
