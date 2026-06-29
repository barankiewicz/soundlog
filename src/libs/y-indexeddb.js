// src/libs/y-indexeddb.js
// Self-contained ESM IndexedDB persistence for Yjs. No lib0 dependency.
import * as Y from '/src/libs/yjs.js';

const STORE = 'updates';

function openDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function readAllUpdates(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeUpdate(db, update) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).add(update);
}

export class IndexeddbPersistence {
  constructor(name, doc) {
    this.name = name;
    this.doc = doc;
    this.synced = false;
    this._db = null;
    this._destroyed = false;
    this._listeners = {};

    this.whenSynced = new Promise(resolve => this.once('synced', resolve));

    this._storeUpdate = (update, origin) => {
      if (this._db && origin !== this) writeUpdate(this._db, update);
    };

    openDB(name).then(db => {
      if (this._destroyed) { db.close(); return; }
      this._db = db;
      return readAllUpdates(db);
    }).then(updates => {
      if (!updates || this._destroyed) return;
      if (updates.length > 0) {
        Y.transact(doc, () => {
          updates.forEach(u => Y.applyUpdate(doc, u));
        }, this, false);
      }
      doc.on('update', this._storeUpdate);
      this.synced = true;
      this.emit('synced', [this]);
    }).catch(err => {
      console.error('y-indexeddb init error:', err);
    });
  }

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  once(event, fn) {
    const wrapper = (...args) => { this.off(event, wrapper); fn(...args); };
    return this.on(event, wrapper);
  }

  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(l => l !== fn);
    }
    return this;
  }

  emit(event, args = []) {
    (this._listeners[event] || []).slice().forEach(fn => fn(...args));
    return this;
  }

  destroy() {
    this._destroyed = true;
    this.doc.off('update', this._storeUpdate);
    if (this._db) { this._db.close(); this._db = null; }
    return Promise.resolve();
  }

  async clearData() {
    await this.destroy();
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export default { IndexeddbPersistence };
