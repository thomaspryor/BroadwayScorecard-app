// Search queries and list names went to PostHog verbatim. They are the user's
// own text (names, places, anything), and the privacy answers say search
// history is not collected. Only the length leaves the device now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textLengthBucket, textLengthProps } from '../../lib/analytics-redact.ts';

globalThis.__DEV__ = false;
const analytics = await import('../../lib/analytics.ts');

const captured = [];
analytics.setPostHogInstance({
  capture: (event, properties) => captured.push({ event, properties }),
  identify: () => {},
  reset: () => {},
});

test('length buckets', () => {
  assert.equal(textLengthBucket(0), '0');
  assert.equal(textLengthBucket(1), '1-2');
  assert.equal(textLengthBucket(5), '3-5');
  assert.equal(textLengthBucket(8), '6-10');
  assert.equal(textLengthBucket(20), '11-20');
  assert.equal(textLengthBucket(400), '21+');
  assert.equal(textLengthBucket(Number.NaN), '0');
  assert.deepEqual(textLengthProps('query', '  wicked '), { query_length: 6, query_length_bucket: '6-10' });
  assert.deepEqual(textLengthProps('name', undefined), { name_length: 0, name_length_bucket: '0' });
});

test('search and list events carry no user text', () => {
  const secret = 'Dinner with Jane Doe 555-0100';
  captured.length = 0;
  analytics.trackSearchPerformed(secret, 3);
  analytics.trackSearchNoResults(secret);
  analytics.trackListCreated('list-1', secret, true);

  assert.deepEqual(captured.map(c => c.event), ['search_performed', 'search_no_results', 'list_created']);
  for (const { event, properties } of captured) {
    assert.ok(!JSON.stringify(properties).includes('Jane'), `${event} leaked the text`);
    assert.ok(!('query' in properties) && !('name' in properties), `${event} still has a raw text key`);
  }
  assert.equal(captured[0].properties.query_length, secret.length);
  assert.equal(captured[0].properties.result_count, 3);
  assert.equal(captured[2].properties.name_length_bucket, '21+');
  assert.equal(captured[2].properties.list_id, 'list-1');
  assert.equal(captured[2].properties.is_ranked, true);
});
