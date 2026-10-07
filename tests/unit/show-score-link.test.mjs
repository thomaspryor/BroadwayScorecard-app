// lib/show-score-link.ts — the Show Score tile must open the real page from the
// feed, never a URL guessed from the title (BRO-4821: /show/<slug> 404s).
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs \
//        --test tests/unit/show-score-link.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { showScoreLinkUrl } from '../../lib/show-score-link.ts';

test('passes through a real Show Score page URL', () => {
  const u = 'https://www.show-score.com/broadway-shows/other-desert-cities-broadway';
  assert.equal(showScoreLinkUrl(u), u);
});

test('rejects missing, non-string, non-https, foreign-host and bare-root values', () => {
  for (const v of [
    undefined,
    null,
    42,
    '',
    'not a url',
    'http://www.show-score.com/broadway-shows/x',
    'https://example.com/broadway-shows/x',
    'https://www.show-score.com/',
    'https://www.show-score.com/broadway-shows/',
  ]) {
    assert.equal(showScoreLinkUrl(v), null, String(v));
  }
});

test('the show screen never builds a Show Score URL from the title', () => {
  const src = fs.readFileSync(new URL('../../app/show/[slug].tsx', import.meta.url), 'utf8');
  assert.equal(/show-score\.com\/show\//.test(src), false, 'invented /show/<slug> URL is back');
  assert.equal(/ssSlug/.test(src), false, 'title-derived Show Score slug is back');
});
