// lib/run-info.ts + parseLocalDate: the run-length and closing lines on show
// cards. Two parity rules: the market suffix is the website's getDurationSuffix
// (a regional tryout is never "on Broadway"), and stored YYYY-MM-DD dates parse
// as local noon, so "Closes Mar 2027" never reads "Feb 2027" in US timezones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDurationSuffix, getRunDuration, getClosingInfo, getOpeningVerb } from '../../lib/run-info.ts';
import { parseLocalDate, toLocalYMD } from '../../lib/date-utils.ts';
import { UK_REGIONAL_VENUES, getUkRegionalVenueCity } from '../../lib/uk-regional-venues.ts';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

test('parseLocalDate keeps the stored calendar date', () => {
  const d = parseLocalDate('2027-03-01');
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 12);
  assert.equal(toLocalYMD(parseLocalDate('2026-01-01T00:00:00Z')), '2026-01-01', 'only the date part is read');
  assert.equal(parseLocalDate(null), null);
  assert.equal(parseLocalDate(''), null);
  assert.equal(parseLocalDate('TBA'), null);
  assert.equal(parseLocalDate('2026-13-45'), null);
});

test('duration suffix per market', () => {
  assert.equal(getDurationSuffix('broadway'), 'on Broadway');
  assert.equal(getDurationSuffix(undefined), 'on Broadway');
  assert.equal(getDurationSuffix('off-broadway'), 'Off-Broadway');
  assert.equal(getDurationSuffix('west-end'), 'in London');
  assert.equal(getDurationSuffix('off-west-end'), 'in London');
  assert.equal(getDurationSuffix('tour'), 'on tour');
  assert.equal(getDurationSuffix('regional', 'La Jolla Playhouse'), 'in tryout');
  assert.equal(getDurationSuffix('regional', 'Royal Shakespeare Theatre'), 'in Stratford-upon-Avon');
  assert.equal(getDurationSuffix('regional', 'Sheffield Crucible'), 'in Sheffield', 'aliases count');
  assert.equal(getDurationSuffix('regional', 'ROYAL LYCEUM THEATRE'), 'in Edinburgh', 'case-insensitive');
  assert.equal(getUkRegionalVenueCity('west-end', 'Royal Shakespeare Theatre'), undefined, 'only regional shows');
});

test('run duration uses the market suffix and only for open shows', () => {
  const now = new Date(2026, 9, 20, 9, 0, 0);
  assert.equal(getRunDuration('2024-10-01', 'open', 'broadway', null, now), '2 years on Broadway');
  assert.equal(getRunDuration('2025-07-20', 'open', 'regional', 'Chichester Festival Theatre', now), '1 year, 3 mo in Chichester');
  assert.equal(getRunDuration('2026-08-20', 'open', 'regional', 'Goodman Theatre', now), '2 mo in tryout');
  assert.equal(getRunDuration('2026-10-19', 'open', 'west-end', null, now), '1 mo in London');
  assert.equal(getRunDuration('2026-08-20', 'closed', 'broadway', null, now), null);
  assert.equal(getRunDuration(null, 'open', 'broadway', null, now), null);
});

test('closing line keeps the stored month (no UTC roll-back)', () => {
  const now = new Date(2026, 9, 20, 23, 30, 0);
  assert.equal(getClosingInfo('2027-03-01', 'open', now), 'Closes Mar 2027');
  assert.equal(getClosingInfo('2026-01-01', 'closed', now), 'Closed Jan 2026');
  assert.equal(getClosingInfo('2026-10-20', 'open', now), 'Closes Oct 2026', 'closing today still says Closes');
  assert.equal(getClosingInfo('2026-10-19', 'open', now), null);
  assert.equal(getClosingInfo(null, 'open', now), null);
});

// ─── Contract with the website (skipped when it is not checked out) ─────────

test('contract: UK regional venue list matches data/uk-regional-venues.json', { skip: SKIP_NO_WEB }, () => {
  const raw = readWeb('data/uk-regional-venues.json');
  assert.ok(raw, 'web venue list present');
  const web = JSON.parse(raw).map(e => ({ match: e.match, city: e.city, aliases: e.aliases ?? [] }));
  assert.deepEqual(UK_REGIONAL_VENUES.map(e => ({ ...e, aliases: [...e.aliases] })), web);
});

test('contract: suffix strings match the website getDurationSuffix', { skip: SKIP_NO_WEB }, () => {
  const src = readWeb('src/lib/date-utils.ts');
  const body = /export function getDurationSuffix[\s\S]*?\n\}/.exec(src ?? '')?.[0];
  assert.ok(body, 'found getDurationSuffix on the website');
  for (const literal of ["'in London'", "'Off-Broadway'", "'in tryout'", "'on tour'", "'on Broadway'", '`in ${ukCity}`']) {
    assert.ok(body.includes(literal), `website still returns ${literal}`);
  }
  const returns = (body.match(/return /g) ?? []).length;
  assert.equal(returns, 5, 'website added or removed a branch: port it to lib/run-info.ts');
});

test('getOpeningVerb: "Opens" until opening night has passed', () => {
  const now = new Date(2026, 9, 20, 9, 0); // Oct 20 2026, local morning
  // Status other than open/closed reads "Opens" whatever the date says.
  assert.equal(getOpeningVerb('2026-11-12', 'previews', now), 'Opens');
  assert.equal(getOpeningVerb('2026-03-01', 'upcoming', now), 'Opens');
  assert.equal(getOpeningVerb('2027-04-01', 'announced', now), 'Opens');
  assert.equal(getOpeningVerb(null, 'announced', now), 'Opens');
  // An "open" show with a future opening date (feed flips status early) still "Opens".
  assert.equal(getOpeningVerb('2026-10-21', 'open', now), 'Opens');
  // Opening tonight or earlier reads "Opened".
  assert.equal(getOpeningVerb('2026-10-20', 'open', now), 'Opened');
  assert.equal(getOpeningVerb('2024-04-25', 'open', now), 'Opened');
  assert.equal(getOpeningVerb('2019-01-10', 'closed', now), 'Opened');
});
