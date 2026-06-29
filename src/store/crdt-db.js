// src/store/crdt-db.js
import * as Y from '/src/libs/yjs.js'; 

// Change this line to import the whole module object instead of a named export
import YIndexeddb from '/src/libs/y-indexeddb.js'; 
const { IndexeddbPersistence } = YIndexeddb;

// 1. Initialize your core Yjs Document container
export const ydoc = new Y.Doc();

// 2. Bind the document to a local browser IndexedDB named 'soundlog-mesh'
export const provider = new IndexeddbPersistence('soundlog-mesh', ydoc);

// ... keep the rest of your file exactly the same!

// 3. Create the shared array where your album review cards live
const sharedQueueArray = ydoc.getArray('album-review-queue');

/**
 * Saves a qualified album tracking card into the shared CRDT state
 */
export async function syncAlbumToCRDT(albumCard) {
  if (!provider.synced) {
    await new Promise(resolve => provider.once('synced', resolve));
  }

  const { verifyMatchConfidence } = await import('/src/core/matcher-router.js');
  const currentItems = sharedQueueArray.toArray();

  let isDuplicate = false;
  for (const item of currentItems) {
    if (item.artist.toLowerCase() !== albumCard.artist.toLowerCase()) continue;
    // Exact match fast path
    if (item.album.toLowerCase() === albumCard.album.toLowerCase()) {
      isDuplicate = true;
      break;
    }
    // Fuzzy match via the configured strategy (Levenshtein / Hybrid / AI)
    const score = await verifyMatchConfidence(item.album, albumCard.album);
    if (score >= 0.85) {
      isDuplicate = true;
      break;
    }
  }

  if (!isDuplicate) {
    sharedQueueArray.push([albumCard]);
    console.log(`Committed to CRDT store: ${albumCard.album} by ${albumCard.artist}`);
  }
}

/**
 * Reads the entire active queue out of the shared array map
 */
export async function getAlbumQueue() {
  if (!provider.synced) {
    await new Promise(resolve => provider.once('synced', resolve));
  }
  return sharedQueueArray.toArray();
}

/**
 * Creates a throwaway Y.Doc + IndexeddbPersistence to read a fresh snapshot
 * of the queue directly from IndexedDB, bypassing any stale in-memory state.
 * Use this in the popup context where the module-level singleton may be stale.
 */
export async function readFreshAlbumQueue() {
  const freshDoc = new Y.Doc();
  const freshProvider = new IndexeddbPersistence('soundlog-mesh', freshDoc);
  await freshProvider.whenSynced;
  return freshDoc.getArray('album-review-queue').toArray();
}

/**
 * Creates a throwaway Y.Doc + IndexeddbPersistence to remove an album from a
 * fresh snapshot of the queue. Use this in the popup context for the same
 * reason as readFreshAlbumQueue.
 */
export async function removeFreshAlbumFromQueue(artist, album) {
  const freshDoc = new Y.Doc();
  const freshProvider = new IndexeddbPersistence('soundlog-mesh', freshDoc);
  await freshProvider.whenSynced;

  const freshArray = freshDoc.getArray('album-review-queue');
  const currentItems = freshArray.toArray();
  const targetIndex = currentItems.findIndex(item =>
    item.artist.toLowerCase() === artist.toLowerCase() &&
    item.album.toLowerCase() === album.toLowerCase()
  );

  if (targetIndex !== -1) {
    freshArray.delete(targetIndex, 1);
    console.log(`Removed from CRDT store: ${album} by ${artist}`);
  }
}

/**
 * Deletes an album from the queue once it has been processed
 */
export async function removeAlbumFromQueue(artist, album) {
  const currentItems = sharedQueueArray.toArray();
  const targetIndex = currentItems.findIndex(item =>
    item.artist.toLowerCase() === artist.toLowerCase() &&
    item.album.toLowerCase() === album.toLowerCase()
  );

  if (targetIndex !== -1) {
    sharedQueueArray.delete(targetIndex, 1);
    console.log(`Removed from CRDT store: ${album} by ${artist}`);
  }
}