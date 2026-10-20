// Mezzanine export parser (lib/mezzanine-parse.ts, used by app/import.tsx).
// Run: node --experimental-strip-types --test tests/unit/mezzanine-parse.test.mjs
//
// Picking the wrong file used to show JSON.parse's raw message ("Unexpected
// token < in JSON at position 0"). And "today" was a UTC date, so after about
// 8pm ET an unrated show booked for tomorrow imported as already seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMezzanineExport, MEZZANINE_FILE_ERROR } from '../../lib/mezzanine-parse.ts';

const fixture = readFileSync(new URL('../../.maestro/fixtures/mezzanine-import.json', import.meta.url), 'utf8');

test('the real E2E fixture parses into diary rows', () => {
  const { entries, notices } = parseMezzanineExport(fixture, '2026-10-20');
  assert.ok(entries.length > 0);
  assert.deepEqual(notices, []);
  const titanique = entries.find(e => e.title === 'Titanique');
  assert.equal(titanique.kind, 'diary');
  assert.equal(titanique.date, '2026-05-05');
  assert.equal(titanique.rating, 4);
  assert.equal(titanique.venue, 'St. James Theatre');
  assert.equal(titanique.mezzShowId, 'mezz-ci-titanique-001');
});

test('non-JSON, HTML and wrong-shape files all get the plain message', () => {
  for (const bad of ['<html>nope</html>', '', '{"data":{}}', '[]', 'null', '{"data":{"diaryEntries":"x"}}']) {
    assert.throws(() => parseMezzanineExport(bad, '2026-10-20'), { message: MEZZANINE_FILE_ERROR }, bad);
  }
});

test('the error never quotes the file', () => {
  try {
    parseMezzanineExport('SECRET-CONTENT{', '2026-10-20');
    assert.fail('expected a throw');
  } catch (e) {
    assert.ok(!e.message.includes('SECRET'));
  }
});

test('unrated entry dated tomorrow (local) is a plan, not a viewing', () => {
  const file = JSON.stringify({ data: { diaryEntries: [
    { show: { name: 'Oh, Mary!', id: 'a' }, rating: null, date: '2026-10-21T00:00:00.000Z' },
  ] } });
  const [row] = parseMezzanineExport(file, '2026-10-20').entries;
  assert.equal(row.kind, 'watchlist');
  assert.equal(row.listName, 'Upcoming');
  assert.equal(row.fromDiary, true);
});

test('unrated entry dated today stays in the diary', () => {
  const file = JSON.stringify({ data: { diaryEntries: [
    { show: { name: 'Oh, Mary!', id: 'a' }, rating: 0, date: '2026-10-20' },
  ] } });
  const [row] = parseMezzanineExport(file, '2026-10-20').entries;
  assert.equal(row.kind, 'diary');
});

test('rows without a show name are counted, not crashed on', () => {
  const file = JSON.stringify({ data: {
    diaryEntries: [{ rating: 4 }, { show: { name: '' } }, { show: { name: 'Six', id: 9 }, rating: '4.5', date: 'garbage' }],
    lists: [{ name: 'Want', shows: [{ name: 'Wicked' }, { id: 'x' }] }],
  } });
  const { entries, notices } = parseMezzanineExport(file, '2026-10-20');
  assert.equal(entries.length, 2);
  const six = entries.find(e => e.title === 'Six');
  assert.equal(six.rating, 4.5);
  assert.equal(six.date, null);
  assert.equal(six.mezzShowId, '9');
  assert.equal(entries.find(e => e.title === 'Wicked').listName, 'Want');
  assert.match(notices[0], /^3 entries in the file had no readable show name/);
});
