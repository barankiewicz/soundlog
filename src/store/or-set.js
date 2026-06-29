// src/store/or-set.js
//
// A state-based Observed-Remove Set (OR-Set) CRDT.
//
// The OR-Set resolves the classic add/remove conflict with add-wins semantics:
// if one replica adds an element while another concurrently removes it, the
// element survives. It does this by tagging every add with a globally unique
// "dot". A remove only retracts the dots it has actually observed, so an add
// that happened elsewhere (with a dot the remover never saw) is untouched.
//
// merge() is a commutative, associative, idempotent union of two states, which
// makes this a convergent replicated data type (CvRDT): any two replicas that
// have seen the same set of operations converge to the same value, regardless
// of order. That is what makes local-to-cloud sync safe to add later without
// touching this logic.
//
// Known trade-off: tombstones accumulate forever. A production OR-Set compacts
// them with version vectors; for a single-user album queue the growth is
// negligible.

export class ORSet {
  constructor(nodeId) {
    // Ephemeral per-instance id. Combined with a counter and timestamp it
    // guarantees dot uniqueness even across the popup and background contexts
    // writing to the same database.
    this.nodeId = nodeId || ORSet._randomId();
    this._counter = 0;
    this.elements = new Map(); // key -> Map<dot, value>
    this.tombstones = new Set(); // retracted dots
  }

  static _randomId() {
    return Math.random().toString(36).slice(2, 10);
  }

  _nextDot() {
    this._counter += 1;
    return `${this.nodeId}:${this._counter}:${Date.now()}`;
  }

  add(key, value) {
    if (!this.elements.has(key)) this.elements.set(key, new Map());
    this.elements.get(key).set(this._nextDot(), value);
  }

  remove(key) {
    const tagged = this.elements.get(key);
    if (!tagged) return;
    for (const dot of tagged.keys()) this.tombstones.add(dot);
    this.elements.delete(key);
  }

  has(key) {
    const tagged = this.elements.get(key);
    if (!tagged) return false;
    for (const dot of tagged.keys()) {
      if (!this.tombstones.has(dot)) return true;
    }
    return false;
  }

  values() {
    const out = [];
    for (const tagged of this.elements.values()) {
      // When a key was added concurrently with different payloads, pick the
      // value of the largest surviving dot. This is deterministic regardless of
      // merge order, so replicas converge on the same value, not just the same
      // membership.
      let bestDot = null;
      let bestValue;
      for (const [dot, value] of tagged) {
        if (this.tombstones.has(dot)) continue;
        if (bestDot === null || dot > bestDot) { bestDot = dot; bestValue = value; }
      }
      if (bestDot !== null) out.push(bestValue);
    }
    return out;
  }

  // Fold another replica's state into this one. Union of dots and tombstones,
  // then drop any dot that has been tombstoned anywhere.
  merge(other) {
    for (const dot of other.tombstones) this.tombstones.add(dot);

    for (const [key, tagged] of other.elements) {
      if (!this.elements.has(key)) this.elements.set(key, new Map());
      const mine = this.elements.get(key);
      for (const [dot, value] of tagged) mine.set(dot, value);
    }

    for (const [key, tagged] of this.elements) {
      for (const dot of [...tagged.keys()]) {
        if (this.tombstones.has(dot)) tagged.delete(dot);
      }
      if (tagged.size === 0) this.elements.delete(key);
    }
    return this;
  }

  toJSON() {
    return {
      counter: this._counter,
      elements: [...this.elements].map(([key, tagged]) => [key, [...tagged]]),
      tombstones: [...this.tombstones]
    };
  }

  static fromJSON(data) {
    const set = new ORSet();
    if (!data) return set;
    set._counter = data.counter || 0;
    set.tombstones = new Set(data.tombstones || []);
    set.elements = new Map((data.elements || []).map(([key, tagged]) => [key, new Map(tagged)]));
    return set;
  }
}
