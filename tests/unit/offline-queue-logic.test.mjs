// Offline write queue + photo upload queue decision rules.
// Run: node --experimental-strip-types --test tests/unit/offline-queue-logic.test.mjs
//
// The queues used to lose data: supabase errors are plain objects, so the
// duplicate check never fired; queued inserts had no client id; every account's
// ops were replayed under whoever was signed in; a flush could overwrite an op
// enqueued while it ran; and a failing op was retried forever. These are the
// pure rules lib/offline-queue.ts and lib/photo-upload-queue.ts now follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OP_ATTEMPTS,
  MAX_PHOTO_ATTEMPTS,
  applyFlushResult,
  classifyQueueError,
  createMutex,
  decideOnFailure,
  decidePhotoFailure,
  deriveOwner,
  errorInfo,
  errorMessage,
  isFlushableBy,
  isOwnPendingPhotoFile,
  isStorageDuplicate,
  needsDurableCopy,
  nextListPosition,
  parseQueue,
  pendingInsertIds,
  pendingPhotoUri,
  singleFlight,
} from '../../lib/offline-queue-logic.ts';

const op = (over = {}) => ({
  id: 'op1',
  table: 'reviews',
  action: 'insert',
  data: { id: 'r1', user_id: 'u1' },
  filters: {},
  createdAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

// ─── errorInfo ───────────────────────────────────────────────

test('errorInfo reads a PostgREST plain-object error', () => {
  const info = errorInfo({ code: '23505', message: 'duplicate key value', details: 'Key (id)=(x) already exists.', hint: null });
  assert.equal(info.code, '23505');
  assert.equal(info.message, 'duplicate key value');
  assert.match(info.text, /already exists/);
});

test('errorInfo reads an Error, a string and nothing', () => {
  assert.equal(errorInfo(new Error('boom')).message, 'boom');
  assert.equal(errorInfo('plain').message, 'plain');
  assert.deepEqual(errorInfo(null), { code: '', statusCode: '', status: null, message: '', text: '' });
  assert.equal(errorMessage({}, 'fallback'), 'fallback');
});

test('errorInfo reads a storage error statusCode', () => {
  const info = errorInfo({ name: 'StorageApiError', message: 'The resource already exists', status: 400, statusCode: '409' });
  assert.equal(info.statusCode, '409');
  assert.equal(info.status, 400);
});

// ─── classifyQueueError ──────────────────────────────────────

test('classifies duplicates (row and storage) as duplicate', () => {
  assert.equal(classifyQueueError({ code: '23505', message: 'duplicate key value violates unique constraint' }), 'duplicate');
  assert.equal(classifyQueueError({ message: 'The resource already exists', statusCode: '409' }), 'duplicate');
  assert.equal(isStorageDuplicate({ message: 'The resource already exists', statusCode: '409' }), true);
  assert.equal(isStorageDuplicate({ message: 'Payload too large', statusCode: '413' }), false);
});

test('classifies network and expired-token failures as deferred', () => {
  assert.equal(classifyQueueError({ message: 'TypeError: Network request failed', code: '' }), 'deferred');
  assert.equal(classifyQueueError(new TypeError('Load failed')), 'deferred');
  assert.equal(classifyQueueError({ code: 'PGRST301', message: 'JWT expired' }), 'deferred');
});

test('classifies RLS, FK, bad value and not-null as permanent', () => {
  for (const code of ['42501', '23503', '22P02', '23502']) {
    assert.equal(classifyQueueError({ code, message: 'x' }), 'permanent', code);
  }
  assert.equal(classifyQueueError({ message: 'new row violates row-level security policy', statusCode: '403' }), 'permanent');
});

test('classifies anything else as retry', () => {
  assert.equal(classifyQueueError({ code: '500', message: 'Internal server error' }), 'retry');
  assert.equal(classifyQueueError(new Error('weird')), 'retry');
});

// ─── Ownership ───────────────────────────────────────────────

test('deriveOwner prefers userId, then filters.user_id, then data.user_id', () => {
  assert.equal(deriveOwner({ userId: 'a', filters: { user_id: 'b' }, data: { user_id: 'c' } }), 'a');
  assert.equal(deriveOwner({ filters: { user_id: 'b' }, data: { user_id: 'c' } }), 'b');
  assert.equal(deriveOwner({ filters: {}, data: { user_id: 'c' } }), 'c');
  assert.equal(deriveOwner({ filters: { id: 'l1' } }), null);
});

test('only the signed-in account (or ownerless legacy ops) can flush', () => {
  assert.equal(isFlushableBy(op(), 'u1'), true);
  assert.equal(isFlushableBy(op(), 'u2'), false);
  assert.equal(isFlushableBy(op(), null), false);
  assert.equal(isFlushableBy(op({ data: undefined, filters: { id: 'l1' } }), 'u2'), true);
});

// ─── decideOnFailure ─────────────────────────────────────────

test('a duplicate replay counts as done', () => {
  assert.deepEqual(decideOnFailure(op(), { code: '23505', message: 'dup' }), { action: 'done' });
});

test('an owned op with a permanent error is dropped at once', () => {
  const d = decideOnFailure(op(), { code: '23503', message: 'fk' });
  assert.equal(d.action, 'drop');
  assert.equal(d.reason, 'permanent:23503');
});

test('an ownerless op with a permanent error is retried, not dropped', () => {
  const d = decideOnFailure(op({ data: undefined, filters: { id: 'l1' } }), { code: '42501', message: 'rls' });
  assert.equal(d.action, 'keep');
  assert.equal(d.op.attempts, 1);
});

test('retry errors count attempts and drop at the ceiling', () => {
  let cur = op();
  for (let i = 1; i < MAX_OP_ATTEMPTS; i++) {
    const d = decideOnFailure(cur, { code: '500', message: 'server' });
    assert.equal(d.action, 'keep');
    assert.equal(d.op.attempts, i);
    assert.equal(d.op.lastError, 'server');
    cur = d.op;
  }
  assert.deepEqual(decideOnFailure(cur, { code: '500', message: 'server' }), { action: 'drop', reason: 'max-attempts' });
});

test('network failures never use up an attempt', () => {
  const d = decideOnFailure(op({ attempts: 4 }), { message: 'TypeError: Network request failed', code: '' });
  assert.equal(d.action, 'keep');
  assert.equal(d.op.attempts, 4);
});

// ─── Queue bookkeeping ───────────────────────────────────────

test('applyFlushResult keeps ops enqueued during the flush', () => {
  const a = op({ id: 'a' });
  const b = op({ id: 'b' });
  const late = op({ id: 'late' }); // enqueued while the flush ran
  const result = applyFlushResult([a, b, late], new Set(['a']), new Map([['b', { ...b, attempts: 1 }]]));
  assert.deepEqual(result.map(o => o.id), ['b', 'late']);
  assert.equal(result[0].attempts, 1);
});

test('parseQueue tolerates missing and corrupt storage', () => {
  assert.deepEqual(parseQueue(null), []);
  assert.deepEqual(parseQueue('{not json'), []);
  assert.deepEqual(parseQueue('{"a":1}'), []);
  assert.deepEqual(parseQueue('[{"id":"x"}]'), [{ id: 'x' }]);
});

test('pendingInsertIds lists rows queued inserts will create', () => {
  const ids = pendingInsertIds([
    op({ id: '1', data: { id: 'r1' } }),
    op({ id: '2', action: 'delete', data: undefined, filters: { id: 'r2' } }),
    op({ id: '3', table: 'lists', data: { id: 'l1' } }),
    op({ id: '4', data: { user_id: 'u1' } }), // legacy insert without id
  ], 'reviews');
  assert.deepEqual([...ids], ['r1']);
});

// ─── nextListPosition ────────────────────────────────────────

test('offline list position goes after every known item', () => {
  assert.equal(nextListPosition([], 0, 1000), 1000);
  assert.equal(nextListPosition([], 3, 1000), 4000);
  assert.equal(nextListPosition([7500], 3, 1000), 8500);
  assert.equal(nextListPosition([NaN], 1, 1000), 2000);
  // Two offline adds in a row get distinct, increasing positions
  const first = nextListPosition([], 2, 1000);
  const second = nextListPosition([first], 3, 1000);
  assert.ok(second > first);
});

// ─── Photo queue ─────────────────────────────────────────────

test('photo failure: FK means the review is gone (orphaned)', () => {
  assert.deepEqual(decidePhotoFailure({ attempts: 0 }, { code: '23503', message: 'fk' }), { action: 'orphaned' });
});

test('photo failure: duplicate row is done, RLS is dropped', () => {
  assert.deepEqual(decidePhotoFailure({ attempts: 0 }, { code: '23505', message: 'dup' }), { action: 'done' });
  assert.equal(decidePhotoFailure({ attempts: 0 }, { code: '42501', message: 'rls' }).action, 'drop');
});

test('photo failure: abandoned exactly once, at the ceiling', () => {
  const before = decidePhotoFailure({ attempts: MAX_PHOTO_ATTEMPTS - 2 }, { message: 'server' });
  assert.equal(before.abandoned, false);
  const at = decidePhotoFailure({ attempts: MAX_PHOTO_ATTEMPTS - 1 }, { message: 'server' });
  assert.equal(at.action, 'keep');
  assert.equal(at.attempts, MAX_PHOTO_ATTEMPTS);
  assert.equal(at.abandoned, true);
  // A manual retry past the ceiling is not reported again
  assert.equal(decidePhotoFailure({ attempts: MAX_PHOTO_ATTEMPTS }, { message: 'server' }).abandoned, false);
  // Offline does not use up an attempt, and is marked deferred so the photo
  // keeps its status (no retry badge for being offline)
  const offline = decidePhotoFailure({ attempts: 2 }, { message: 'Network request failed' });
  assert.equal(offline.attempts, 2);
  assert.equal(offline.deferred, true);
  assert.equal(at.deferred, undefined);
});

test('photo file paths: durable copy only for cache files, delete only own files', () => {
  const doc = 'file:///var/app/Documents/';
  const cache = 'file:///var/app/Library/Caches/';
  assert.equal(pendingPhotoUri(doc, 'p1'), 'file:///var/app/Documents/pending-photos/p1.jpg');
  assert.equal(pendingPhotoUri('file:///var/app/Documents', 'p1'), 'file:///var/app/Documents/pending-photos/p1.jpg');
  assert.equal(needsDurableCopy(`${cache}ImageManipulator/x.jpg`, cache), true);
  assert.equal(needsDurableCopy(`${doc}pending-photos/p1.jpg`, cache), false);
  assert.equal(needsDurableCopy(`${cache}x.jpg`, null), false);
  assert.equal(isOwnPendingPhotoFile(`${doc}pending-photos/p1.jpg`, doc), true);
  assert.equal(isOwnPendingPhotoFile(`${cache}x.jpg`, doc), false);
  assert.equal(isOwnPendingPhotoFile(`${doc}other/p1.jpg`, doc), false);
  assert.equal(isOwnPendingPhotoFile(`${doc}pending-photos/p1.jpg`, null), false);
});

// ─── Concurrency ─────────────────────────────────────────────

const tick = (ms) => new Promise(r => setTimeout(r, ms));

test('createMutex runs critical sections one at a time, even after a throw', async () => {
  const lock = createMutex();
  const log = [];
  const a = lock(async () => { log.push('a1'); await tick(20); log.push('a2'); throw new Error('a failed'); });
  const b = lock(async () => { log.push('b1'); await tick(1); log.push('b2'); return 'b'; });
  await assert.rejects(a, /a failed/);
  assert.equal(await b, 'b');
  assert.deepEqual(log, ['a1', 'a2', 'b1', 'b2']);
});

test('createMutex: a read-modify-write cannot lose a concurrent append', async () => {
  const lock = createMutex();
  let store = [];
  const append = (x) => lock(async () => { const q = [...store]; await tick(5); q.push(x); store = q; });
  await Promise.all([append(1), append(2), append(3)]);
  assert.deepEqual(store, [1, 2, 3]);
});

test('singleFlight shares one in-flight run, then allows a new one', async () => {
  let runs = 0;
  const flush = singleFlight(async () => { runs++; await tick(10); return runs; });
  const [x, y] = await Promise.all([flush(), flush()]);
  assert.equal(runs, 1);
  assert.equal(x, 1);
  assert.equal(y, 1);
  assert.equal(await flush(), 2);
});

test('singleFlight resets after a failed run', async () => {
  let n = 0;
  const flush = singleFlight(async () => { n++; if (n === 1) throw new Error('first'); return n; });
  await assert.rejects(flush(), /first/);
  assert.equal(await flush(), 2);
});
