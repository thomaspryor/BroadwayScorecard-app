// Run with: node --experimental-strip-types --test tests/unit/share-payload.test.mjs
// iOS share used to send only the PNG (`{ url: uri }`), dropping the show link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowSharePayload } from '../../lib/share-payload.ts';

const show = { title: 'Bigfoot Ripped My Dog In Half I Saw It', slug: 'bigfoot-ripped-my-dog-in-half-i-saw-it' };

test('ios with image: sends image AND link', () => {
  const p = buildShowSharePayload(show, 'file:///tmp/card.png', 'ios');
  assert.equal(p.url, 'file:///tmp/card.png');
  assert.match(p.message, /https:\/\/broadwayscorecard\.com\/show\/bigfoot-ripped-my-dog-in-half-i-saw-it$/);
});

test('ios without image: message with link only', () => {
  const p = buildShowSharePayload(show, null, 'ios');
  assert.equal(p.url, undefined);
  assert.match(p.message, /broadwayscorecard\.com\/show\//);
});

test('android: message with link, no url', () => {
  const p = buildShowSharePayload(show, 'file:///tmp/card.png', 'android');
  assert.equal(p.url, undefined);
  assert.match(p.message, /broadwayscorecard\.com\/show\//);
});
