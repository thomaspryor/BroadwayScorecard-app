// lib/fetch-utils.ts: request timeouts, single-flight dedupe and the LRU that
// caps the offline show-detail cache (wired in lib/api.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchWithTimeout, FetchTimeoutError, singleFlight, touchLru, parseLruIndex } from '../../lib/fetch-utils.ts';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('a stalled request rejects with a timeout instead of hanging', async () => {
  const stalled = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(fetchWithTimeout('https://x/y.json', {}, async r => r, 20, stalled), FetchTimeoutError);
});

test('a prompt response passes through and other errors are not relabelled', async () => {
  const ok = async () => ({ ok: true, text: async () => 'body' });
  assert.equal(await fetchWithTimeout('u', {}, r => r.text(), 1000, ok), 'body');
  const offline = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(fetchWithTimeout('u', {}, r => r, 1000, offline), TypeError);
});

test('overlapping calls share one request; the next call refetches', async () => {
  let calls = 0;
  let release;
  const fn = singleFlight(() => { calls++; return new Promise(r => { release = r; }); });
  const a = fn();
  const b = fn();
  assert.equal(a, b);
  release('v1');
  assert.deepEqual(await Promise.all([a, b]), ['v1', 'v1']);
  const c = fn();
  release('v2');
  assert.equal(await c, 'v2');
  assert.equal(calls, 2);
});

test('a failed flight clears, so a retry is a fresh request', async () => {
  let calls = 0;
  const fn = singleFlight(async () => { calls++; if (calls === 1) throw new Error('boom'); return 'ok'; });
  await assert.rejects(fn(), /boom/);
  assert.equal(await fn(), 'ok');
});

test('LRU keeps the most recent N and reports what fell out', () => {
  assert.deepEqual(touchLru(['a', 'b', 'c'], 'd', 3), { next: ['b', 'c', 'd'], evicted: ['a'] });
  assert.deepEqual(touchLru(['a', 'b', 'c'], 'a', 3), { next: ['b', 'c', 'a'], evicted: [] });
  assert.deepEqual(touchLru(['a', 'b', 'c', 'd', 'e'], 'f', 2).evicted, ['a', 'b', 'c', 'd']);
  assert.deepEqual(touchLru([], 'a', 0), { next: ['a'], evicted: [] }, 'cap below 1 still keeps the current show');
});

test('LRU index parsing survives garbage', () => {
  assert.equal(parseLruIndex(null), null, 'missing index means "adopt existing keys"');
  assert.deepEqual(parseLruIndex('not json'), []);
  assert.deepEqual(parseLruIndex('{"a":1}'), []);
  assert.deepEqual(parseLruIndex('["a",2,"b"]'), ['a', 'b']);
});

test('api.ts evicts the same keys cache.ts writes', () => {
  const prefix = file => /const DETAIL_PREFIX = '([^']+)'/.exec(read(file))?.[1];
  assert.ok(prefix('lib/cache.ts'));
  assert.equal(prefix('lib/api.ts'), prefix('lib/cache.ts'));
  const lruKey = /const DETAIL_LRU_KEY = '([^']+)'/.exec(read('lib/api.ts'))?.[1];
  assert.ok(lruKey && !lruKey.startsWith(prefix('lib/cache.ts')), 'the LRU index key is not itself a detail key');
});

test('every network call in api.ts goes through the timeout wrapper', () => {
  const src = read('lib/api.ts');
  assert.equal(/(^|[^.\w])fetch\(/m.test(src), false, 'no bare fetch( in lib/api.ts');
});
