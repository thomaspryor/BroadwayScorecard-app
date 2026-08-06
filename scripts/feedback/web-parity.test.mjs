// Pure-logic coverage for the web-parity diff (task #1077). No network, no
// simulator — that's exercised separately (see the module header). This
// covers the route mapping, response parsing, and report formatting: the
// parts a regression could silently break without ever touching a screen.
//
// Run: node --test scripts/feedback/web-parity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  webRouteForScreen,
  webRouteForShow,
  comparableCaptures,
  parseParityResponse,
  summarizeParityResults,
} = require('./web-parity.js');

test('screens with a real web equivalent map to their route', () => {
  assert.equal(webRouteForScreen('Home'), '/');
  assert.equal(webRouteForScreen('Browse'), '/shows');
});

test('app-only screens with no web equivalent have no route', () => {
  for (const label of ['Watched', 'To Watch', 'Lists', 'Settings']) {
    assert.equal(webRouteForScreen(label), undefined);
  }
});

test('a show slug maps to its web show page', () => {
  assert.equal(webRouteForShow('hamilton'), '/show/hamilton');
});

test('comparableCaptures keeps only ok captures with a known web route', () => {
  const captures = [
    { label: 'Home', ok: true, path: '/tmp/home.png' },
    { label: 'Browse', ok: true, path: '/tmp/browse.png' },
    { label: 'Watched', ok: true, path: '/tmp/watched.png' }, // no web route
    { label: 'Home', ok: false, path: null }, // failed capture, duplicate label
  ];
  const kept = comparableCaptures([captures[0], captures[1], captures[2]]).map((c) => c.label);
  assert.deepEqual(kept, ['Home', 'Browse']);
});

test('comparableCaptures drops a capture with no path even if ok is true', () => {
  const captures = [{ label: 'Home', ok: true, path: null }];
  assert.deepEqual(comparableCaptures(captures), []);
});

test('comparableCaptures handles empty and missing input', () => {
  assert.deepEqual(comparableCaptures([]), []);
  assert.deepEqual(comparableCaptures(null), []);
  assert.deepEqual(comparableCaptures(undefined), []);
});

test('parseParityResponse extracts departures from clean JSON', () => {
  const content = JSON.stringify({
    departures: [{ element: 'score badge', web: 'small, bordered', ios: 'large, no border', severity: 'notable' }],
    notes: 'badge sizing differs',
  });
  const result = parseParityResponse(content);
  assert.equal(result.hasDivergence, true);
  assert.equal(result.departures.length, 1);
  assert.equal(result.departures[0].element, 'score badge');
  assert.equal(result.notes, 'badge sizing differs');
});

test('parseParityResponse reports no divergence for an empty departures array', () => {
  const result = parseParityResponse(JSON.stringify({ departures: [], notes: '' }));
  assert.equal(result.hasDivergence, false);
  assert.deepEqual(result.departures, []);
});

test('parseParityResponse tolerates prose or code fences around the JSON', () => {
  const content = 'Here is my answer:\n```json\n' + JSON.stringify({ departures: [], notes: 'fine' }) + '\n```';
  const result = parseParityResponse(content);
  assert.equal(result.hasDivergence, false);
  assert.equal(result.notes, 'fine');
});

test('parseParityResponse throws on unparseable content rather than silently passing', () => {
  assert.throws(() => parseParityResponse('not json at all'));
  assert.throws(() => parseParityResponse(''));
  assert.throws(() => parseParityResponse(null));
});

test('parseParityResponse throws on malformed JSON instead of guessing', () => {
  assert.throws(() => parseParityResponse('{"departures": [oops]}'));
});

test('parseParityResponse throws when the model reports it could not load an image, instead of a silent clean pass', () => {
  // The prompt tells the model to return departures:[] plus this phrase in
  // notes when an image fails to load — that shape is otherwise identical to
  // a genuine "no departures found" pass. Swallowing it would report a
  // comparison that never happened as clean.
  const content = JSON.stringify({ departures: [], notes: 'could not load image: web reference' });
  assert.throws(() => parseParityResponse(content), /could not load/i);
});

test('parseParityResponse defaults a missing departures field to empty, not a crash', () => {
  const result = parseParityResponse(JSON.stringify({ notes: 'no departures key at all' }));
  assert.deepEqual(result.departures, []);
  assert.equal(result.hasDivergence, false);
});

test('summarizeParityResults returns null when there is nothing to summarize', () => {
  assert.equal(summarizeParityResults([]), null);
  assert.equal(summarizeParityResults(null), null);
});

test('summarizeParityResults reports a clean pass when no screen diverged', () => {
  const results = [{ label: 'Home', hasDivergence: false, departures: [], notes: '', error: null }];
  const summary = summarizeParityResults(results);
  assert.equal(summary.hasFindings, false);
  assert.equal(summary.hasErrors, false);
  assert.match(summary.summary, /no departures/);
});

// The scenario from the acceptance criteria: a branch that shrinks a score
// badge away from the web spec. This is what the report-formatting side must
// surface -- the actual "does the vision call plumbing catch it" question is
// answered by a live comparison against real screenshots, done separately as
// part of this task's verification (see the PR/task notes), not re-run on
// every test invocation.
test('summarizeParityResults surfaces a shrunk score badge as a finding, not silently', () => {
  const results = [{
    label: 'Home',
    hasDivergence: true,
    departures: [{ element: 'score badge', web: 'compact size with a gold border', ios: 'noticeably larger, no border', severity: 'notable' }],
    notes: 'badge sizing and border differ from web',
    error: null,
  }];
  const summary = summarizeParityResults(results);
  assert.equal(summary.hasFindings, true);
  assert.match(summary.summary, /score badge/);
  assert.match(summary.summary, /compact size with a gold border/);
  assert.match(summary.summary, /noticeably larger, no border/);
});

test('summarizeParityResults separates comparison errors from real findings', () => {
  const results = [
    { label: 'Home', hasDivergence: false, departures: [], notes: '', error: null },
    { label: 'Browse', hasDivergence: false, departures: [], notes: '', error: 'playwright screenshot failed: timeout' },
  ];
  const summary = summarizeParityResults(results);
  assert.equal(summary.hasFindings, false);
  assert.equal(summary.hasErrors, true);
  assert.match(summary.summary, /Browse: comparison could not run/);
});

test('summarizeParityResults includes multiple departures across multiple screens', () => {
  const results = [
    { label: 'Home', hasDivergence: true, departures: [{ element: 'score badge', web: 'A', ios: 'B', severity: 'notable' }], notes: '', error: null },
    { label: 'Browse', hasDivergence: true, departures: [{ element: 'card width', web: 'C', ios: 'D', severity: 'minor' }], notes: '', error: null },
  ];
  const summary = summarizeParityResults(results);
  assert.equal(summary.lines.length, 2);
  assert.match(summary.lines[0], /^Home/);
  assert.match(summary.lines[1], /^Browse/);
});
