// tests/or-set.test.mjs
// Run with: npm test
//
// Verifies the CRDT properties that make the OR-Set safe to replicate:
// add-wins conflict resolution, idempotent merge, and order-independent
// (commutative) convergence on both membership and value.
import { ORSet } from '../src/store/or-set.js';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('ok   -', name); }
  else { fail++; console.log('FAIL -', name); }
};
const clone = set => ORSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));

// basic add / has / values
const s = new ORSet();
s.add('a|||x', { artist: 'A', album: 'X' });
s.add('b|||y', { artist: 'B', album: 'Y' });
ok('has after add', s.has('a|||x'));
ok('values length 2', s.values().length === 2);

// remove
s.remove('a|||x');
ok('has false after remove', !s.has('a|||x'));
ok('values length 1 after remove', s.values().length === 1);

// JSON persistence round-trip
const round = clone(s);
ok('roundtrip preserves value', round.values().length === 1 && round.values()[0].album === 'Y');
ok('roundtrip preserves tombstone', !round.has('a|||x'));

// add-wins: a concurrent add (replica 2) beats a remove (replica 1)
const r1 = new ORSet();
r1.add('k', { v: 1 });
const r2 = clone(r1);  // r2 has observed the original add
r1.remove('k');        // r1 retracts the dot it observed
r2.add('k', { v: 2 }); // r2 mints a new dot r1 never saw
r1.merge(r2);
ok('add-wins: element survives concurrent add + remove', r1.has('k'));

// idempotent merge
const before = JSON.stringify(r1.toJSON());
r1.merge(r2);
ok('merge idempotent', JSON.stringify(r1.toJSON()) === before);

// commutative convergence on membership AND value
const a = new ORSet(); a.add('p', { v: 'p' }); a.add('q', { v: 'q' }); a.remove('p');
const b = new ORSet(); b.add('q', { v: 'q2' }); b.add('r', { v: 'r' });
const ab = clone(a).merge(b);
const ba = clone(b).merge(a);
const fingerprint = x => x.values().map(v => v.v).sort().join(',');
ok('merge commutative (converges to same value, both orders)', fingerprint(ab) === fingerprint(ba));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
