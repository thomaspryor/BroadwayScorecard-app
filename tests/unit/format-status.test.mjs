// Format and status pills (lib/score-utils.ts). Website parity
// (src/lib/show-format.ts, ShowPills.tsx): an unknown or missing type is a
// neutral EVENT, never PLAY; opera and special have their own labels and
// colours; ANNOUNCED is blue like UPCOMING, and Quick Facts never calls an
// announced show "Closed".
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFormatInfo, getStatusInfo, getStatusFactLabel } from '../../lib/score-utils.ts';
import { Colors } from '../../constants/theme.ts';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

test('format labels', () => {
  assert.equal(getFormatInfo('musical').label, 'MUSICAL');
  assert.equal(getFormatInfo('play').label, 'PLAY');
  assert.equal(getFormatInfo('opera').label, 'OPERA');
  assert.equal(getFormatInfo('special').label, 'EVENT');
  for (const t of ['', null, undefined, 'concert']) {
    assert.equal(getFormatInfo(t).label, 'EVENT', String(t));
    assert.equal(getFormatInfo(t).color, Colors.text.secondary);
  }
});

test('every format has a distinct colour', () => {
  const colors = ['musical', 'play', 'opera', 'special', ''].map(t => getFormatInfo(t).color);
  assert.equal(new Set(colors).size, colors.length);
});

test('announced is blue and reads Upcoming in Quick Facts', () => {
  assert.deepEqual(getStatusInfo('announced'), { label: 'ANNOUNCED', color: Colors.status.upcoming });
  assert.equal(getStatusFactLabel('announced'), 'Upcoming');
  assert.equal(getStatusFactLabel('upcoming'), 'Upcoming');
  assert.equal(getStatusFactLabel('open'), 'Now Playing');
  assert.equal(getStatusFactLabel('previews'), 'In Previews');
  assert.equal(getStatusFactLabel('closed'), 'Closed');
  assert.equal(getStatusInfo('').label, '');
});

test('contract: the website has no type the app does not label', { skip: SKIP_NO_WEB }, () => {
  const src = readWeb('src/lib/show-format.ts');
  const known = /KNOWN_SHOW_TYPES = \[([^\]]*)\]/.exec(src ?? '')?.[1];
  assert.ok(known, 'found KNOWN_SHOW_TYPES');
  for (const t of [...known.matchAll(/'([^']+)'/g)].map(m => m[1])) {
    assert.notEqual(getFormatInfo(t).color, Colors.text.secondary, `${t} has its own colour`);
  }
});
