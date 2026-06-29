// src/store/crdt-db.js
//
// Persistence and queue API over the OR-Set CRDT (src/store/or-set.js).
//
// The popup and background run in separate JS contexts that share only
// IndexedDB. To stay consistent, every operation reads the current state from
// disk, merges it into a working OR-Set, applies the change, and writes back.
// Because merge() is conflict-free, the popup removing an album and the
// background adding one can never clobber each other.
import { ORSet } from '/src/store/or-set.js';

const DB_NAME = 'soundlog-mesh';
const STORE = 'crdt';
const STATE_KEY = 'album-queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function loadState(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => resolve(ORSet.fromJSON(req.result));
    req.onerror = () => reject(req.error);
  });
}

function saveState(db, set) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(set.toJSON(), STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function albumKey(artist, album) {
  return `${artist}|||${album}`.toLowerCase();
}

/**
 * Adds a qualified album to the queue, skipping exact and fuzzy duplicates.
 * De-duplication is text-only (exact key + Levenshtein) so a historical scan
 * never triggers model inference. The AI matcher is reserved for the opt-in
 * strategy surface in matcher-router.js.
 */
export async function syncAlbumToCRDT(albumCard) {
  const db = await openDB();
  try {
    const set = await loadState(db);
    const key = albumKey(albumCard.artist, albumCard.album);

    if (set.has(key)) return;

    const { verifyTextMatch } = await import('/src/core/text-match.js');
    for (const item of set.values()) {
      if (item.artist.toLowerCase() !== albumCard.artist.toLowerCase()) continue;
      if (verifyTextMatch(item.album, albumCard.album) >= 0.85) return;
    }

    set.add(key, albumCard);
    await saveState(db, set);
    console.log(`Committed to CRDT store: ${albumCard.album} by ${albumCard.artist}`);
  } finally {
    db.close();
  }
}

/**
 * Returns the current queue, read fresh from IndexedDB.
 */
export async function getAlbumQueue() {
  const db = await openDB();
  try {
    const set = await loadState(db);
    return set.values();
  } finally {
    db.close();
  }
}

/**
 * Removes an album from the queue once it has been processed.
 */
export async function removeAlbumFromQueue(artist, album) {
  const db = await openDB();
  try {
    const set = await loadState(db);
    set.remove(albumKey(artist, album));
    await saveState(db, set);
    console.log(`Removed from CRDT store: ${album} by ${artist}`);
  } finally {
    db.close();
  }
}

// Every read and write already hits IndexedDB directly, so these aliases exist
// only for the popup call sites that previously needed an explicit fresh read.
export const readFreshAlbumQueue = getAlbumQueue;
export const removeFreshAlbumFromQueue = removeAlbumFromQueue;
