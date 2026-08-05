// The approval gate is the only thing standing between a stranger's TestFlight
// comment and an unreviewed overnight commit on the owner's phone. It is worth
// a test that runs against a real ledger on disk rather than a mocked one.
//
// Run: node --test scripts/feedback/ledger.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** Each test gets its own BSC_FEEDBACK_HOME so they cannot see each other. */
function freshLedger() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  process.env.BSC_FEEDBACK_HOME = home;
  // ledger.js reads BSC_FEEDBACK_HOME at require time, so drop it from cache.
  delete require.cache[require.resolve('./ledger.js')];
  return { home, ledger: require('./ledger.js') };
}

function stage(home, items) {
  const dir = path.join(home, 'incoming');
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(items));
  return dir;
}

const OWNER = 'thomas.pryor@gmail.com';
const item = (id, email, createdDate = '2026-08-04T12:00:00Z') => ({
  id, email, createdDate, kind: 'screenshot', comment: `comment ${id}`, screenshots: [],
});

test('owner feedback is queued for auto-processing; everyone else waits for approval', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [
    item('own-1', OWNER),
    item('other-1', 'stranger@example.com'),
    item('other-2', 'QA@Example.COM'),
  ]));

  const l = ledger.load();
  assert.equal(l.items['own-1'].status, 'queued');
  assert.equal(l.items['own-1'].role, 'owner');
  assert.equal(l.items['other-1'].status, 'needs-approval');
  assert.equal(l.items['other-2'].status, 'needs-approval');

  // The queue the overnight run consumes must contain ONLY the owner's item.
  assert.deepEqual(ledger.queue().map((i) => i.id), ['own-1']);
  assert.deepEqual(ledger.pendingApproval().map((i) => i.id), ['other-1', 'other-2']);
});

test('owner match is exact — a lookalike address does not get auto-processed', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [
    item('spoof-1', 'thomas.pryor@gmail.com.attacker.net'),
    item('spoof-2', 'not-thomas.pryor@gmail.com'),
    item('spoof-3', 'thomas.pryor@gmail.co'),
    item('case-1', '  Thomas.Pryor@Gmail.com  '),
  ]));

  const l = ledger.load();
  for (const id of ['spoof-1', 'spoof-2', 'spoof-3']) {
    assert.equal(l.items[id].status, 'needs-approval', `${id} must not be treated as the owner`);
  }
  // Case and surrounding whitespace are noise, not a different person.
  assert.equal(l.items['case-1'].status, 'queued');
});

test('approving a third-party item is what moves it into the queue', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [item('other-1', 'stranger@example.com')]));
  assert.deepEqual(ledger.queue().map((i) => i.id), []);

  ledger.setStatus(['other-1'], 'approved');
  assert.deepEqual(ledger.queue().map((i) => i.id), ['other-1']);

  ledger.setStatus(['other-1'], 'rejected');
  assert.deepEqual(ledger.queue().map((i) => i.id), []);
});

test('re-ingesting never resurrects work that is already closed', () => {
  const { home, ledger } = freshLedger();
  const items = [item('own-1', OWNER), item('other-1', 'stranger@example.com')];
  ledger.ingest(stage(home, items));

  ledger.setStatus(['own-1'], 'done', { commit: 'abc1234' });
  ledger.setStatus(['other-1'], 'rejected');

  // The API returns the full history on every pull, so this happens nightly.
  ledger.ingest(stage(home, items));

  const l = ledger.load();
  assert.equal(l.items['own-1'].status, 'done');
  assert.equal(l.items['own-1'].commit, 'abc1234');
  assert.equal(l.items['other-1'].status, 'rejected');
  assert.deepEqual(ledger.queue().map((i) => i.id), []);
});

test('re-ingesting backfills screenshots that failed to download earlier', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [item('own-1', OWNER)]));
  assert.deepEqual(ledger.load().items['own-1'].screenshots, []);

  const withShot = { ...item('own-1', OWNER), screenshots: ['own-1-0.jpg'] };
  const dir = stage(home, [withShot]);
  fs.writeFileSync(path.join(dir, 'images', 'own-1-0.jpg'), 'not-really-a-jpeg');
  ledger.ingest(dir);

  assert.deepEqual(ledger.load().items['own-1'].screenshots, ['own-1-0.jpg']);
  assert.ok(fs.existsSync(path.join(ledger.HOME, 'images', 'own-1-0.jpg')));
});

test('the queue drains oldest first', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [
    item('c', OWNER, '2026-08-03T00:00:00Z'),
    item('a', OWNER, '2026-08-01T00:00:00Z'),
    item('b', OWNER, '2026-08-02T00:00:00Z'),
  ]));
  assert.deepEqual(ledger.queue().map((i) => i.id), ['a', 'b', 'c']);
});

test('in-progress items are not offered to a second run', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [item('own-1', OWNER), item('own-2', OWNER)]));
  ledger.setStatus(['own-1'], 'in-progress');
  assert.deepEqual(ledger.queue().map((i) => i.id), ['own-2']);
});

test('a deferred item stays out of the queue until a human requeues it', () => {
  const { home, ledger } = freshLedger();
  ledger.ingest(stage(home, [item('own-1', OWNER)]));
  ledger.setStatus(['own-1'], 'deferred', { note: 'needs a product decision' });

  assert.deepEqual(ledger.queue().map((i) => i.id), []);
  assert.equal(ledger.load().items['own-1'].note, 'needs a product decision');

  ledger.setStatus(['own-1'], 'queued');
  assert.deepEqual(ledger.queue().map((i) => i.id), ['own-1']);
});
