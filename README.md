# SoundLog

A browser extension that bridges your Last.fm scrobble history with RateYourMusic reviews. It watches your listening activity, groups plays into album sessions, and builds a local review queue you can work through at your own pace.

No data leaves your browser. No account beyond Last.fm. All processing runs locally.

---

## How it works

SoundLog polls your Last.fm history every 15 minutes. When you have played at least 5 unique tracks from an album, that album gets added to your review queue. Open the popup, write your notes, and hit one button to copy them to your clipboard and land directly on the album's RateYourMusic page.

There is also a one-time historical scan that can backfill your queue from years of past listening -- useful on first install if you have a long scrobble history.

---

## Features

- Automatic background polling every 15 minutes via browser alarms
- Historical backfill: scan 1, 2, 5 years, or your full listening history
- Three matching modes: Levenshtein (lightweight), Hybrid, or local AI via Transformers.js and ONNX WebAssembly
- Queue stored in a local CRDT database (Yjs over IndexedDB) -- offline-first and ready for optional sync later
- One-click workflow: notes copied to clipboard, RateYourMusic search opened
- Targets both Firefox and Chrome from a single codebase

---

## Installation

Requires Node.js 18+ and npm.

```bash
npm install
npm run build
```

The build script copies vendor libraries into `src/libs/`, patches RxJS for a strict ES module context, and produces two zip files in `dist/`: `soundlog-firefox.zip` and `soundlog-chrome.zip`.

**Firefox / LibreWolf**: Go to `about:debugging` > This Firefox > Load Temporary Add-on, then select `dist/soundlog-firefox.zip`.

**Chrome / Chromium**: Go to `chrome://extensions`, enable Developer Mode, click Load Unpacked, and point it at the `dist/stage-chrome/` folder.

To get a Last.fm API key: [last.fm/api/account/create](https://www.last.fm/api/account/create)

---

## Usage

1. Open the extension popup. Enter your Last.fm username and API key and hit Save.
2. In the settings panel, run a historical scan to seed your queue from past listening.
3. The extension polls in the background. New qualified albums show up automatically.
4. Open the popup any time to see your queue. Write notes in the text box, then click "Copy Notes & Rate on RYM."

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Stream processing | RxJS | Groups and aggregates scrobble streams by album using `groupBy` and `mergeMap` |
| Local persistence | Yjs CRDT + y-indexeddb | Conflict-free data structure, offline-first, designed for future sync |
| Reactive state | Preact Signals | Fine-grained updates without a full UI framework |
| Album matching | Transformers.js / ONNX | On-device vector embeddings via WebAssembly, no external API calls |
| Runtime | Raw ES modules, no bundler | Runs directly in the browser extension context during development |

---

## Roadmap

- Complete Preact Signals integration in the popup render loop
- Connect local AI matcher to the matching strategy selector
- Optional cloud sync via y-websocket or y-webrtc
- Queue export to CSV / JSON
- Badge counter on the extension icon showing pending reviews

---

## Contributing

Pull requests are welcome. Open an issue first for anything beyond a small fix so we can discuss direction.

To build locally, see Installation above. There is no test suite yet -- manual testing via browser dev tools is the current workflow.

---

## License

MIT
