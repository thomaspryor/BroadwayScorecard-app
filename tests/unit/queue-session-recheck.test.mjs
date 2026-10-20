// Both sync queues read the signed-in account once at the start of a run. A
// sign-out or account switch while the run is in flight sent the remaining
// writes under another session (or none): RLS rejected them and the offline
// queue dropped them, an update matching 0 rows was marked synced, and the
// photo queue deleted the only local copy of a dropped photo. Each loop now
// re-checks the account around every request and stops when it changed.
// The loops import React Native modules, so this checks their source shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const between = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));

test('offline queue re-checks the account before, after and on failure of each op', () => {
  const loop = between(read('lib/offline-queue.ts'), 'async function runFlush', 'function reportDroppedOp');
  const body = between(loop, 'for (const op of queue)', 'if (removed.size > 0');
  assert.match(loop, /const sameAccount = async \(\) => \(await getSessionUserId\(client\)\) === userId/);
  const checks = body.match(/if \(!\(await sameAccount\(\)\)\) break;/g) || [];
  assert.equal(checks.length, 3, 'before the request, after success, before deciding on a failure');
  assert.ok(body.indexOf('sameAccount') < body.indexOf('executeOperation'), 'checked before the request');
  assert.ok(body.lastIndexOf('sameAccount') < body.indexOf('decideOnFailure'), 'checked before a failure can drop the op');
});

test('photo queue re-checks the account per item and before a failure can drop a photo', () => {
  const src = read('lib/photo-upload-queue.ts');
  const attempt = between(src, 'async function attemptUpload', 'async function applyResults');
  const catchAt = attempt.indexOf('} catch (e) {\n    // Signed out');
  assert.ok(catchAt > 0, 'outer catch starts with the account check');
  assert.ok(attempt.indexOf('stillSignedInAs(item.userId)') < attempt.indexOf('decidePhotoFailure'));
  const run = between(src, 'async function runPhotoFlush', '/** User-initiated retry');
  assert.ok(run.indexOf('stillSignedInAs(userId)') < run.indexOf('attemptUpload(item)'), 'checked before each upload');
});
