// Structural guard for the show/[slug], settings, rate/[showId] E2E effort
// (BRO-2014, closed 2026-08-12/13 — see memory/testing.md "Closed 2026-08-12/13:
// show/[slug], settings, rate/[showId]" and memory/handoff-show-page-e2e.md).
//
// These three screens had zero Maestro coverage for months because nothing
// noticed the gap — the same class of problem
// tests/unit/every-user-table-has-a-security-test.test.mjs exists for on the
// security side. This is the E2E-coverage version: it doesn't run Maestro (no
// simulator here), it checks the flow FILES for the specific properties that
// took ~4 hours and a dozen CI dispatch rounds to get right, so a future edit
// can't silently regress them without a real device in the loop.
//
// Runs fast (file reads only) — `node --test tests/e2e/ios_maestro_coverage.test.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SHOW_FLOW = join(REPO_ROOT, '.maestro/show/show-detail.yaml');
const SETTINGS_FLOW = join(REPO_ROOT, '.maestro/settings/delete-account-guard.yaml');
const RATE_FLOW = join(REPO_ROOT, '.maestro/rate/rate-lifecycle.yaml');

function read(path) {
  return readFileSync(path, 'utf8');
}

test('show/[slug] has a Maestro flow that navigates via real search, not the fixture', () => {
  const yaml = read(SHOW_FLOW);
  assert.match(yaml, /tapOn:\s*\n\s*id:\s*"show-card-result"/, 'expected a tap on the real ShowCard search result, not a fixture route');
  assert.doesNotMatch(yaml, /show-rating-fixture/, 'show/[slug] coverage must drive the real screen, not test/show-rating-fixture.tsx');
});

test('show/[slug] flow asserts on real rendered data (title + score), not just that a screen appeared', () => {
  const yaml = read(SHOW_FLOW);
  assert.match(yaml, /assertVisible:\s*\n\s*text:\s*"Score/, 'expected an assertion on the score badge text actually rendering');
});

test('rate/[showId] flow targets the production route, not the local-state fixture', () => {
  const yaml = read(RATE_FLOW);
  assert.match(yaml, /openLink:\s*broadwayscorecard:\/\/rate\//, 'expected a deep link into the real app/rate/[showId].tsx route');
  // The 6 pre-existing show-rating flows all deep-link into
  // broadwayscorecard://test/show-rating-fixture — that route (not the mere
  // string "show-rating-fixture", which the file's explanatory comments
  // legitimately reference) is the one this flow must not use.
  assert.doesNotMatch(
    yaml,
    /openLink:\s*broadwayscorecard:\/\/test\/show-rating-fixture/,
    'rate/[showId] coverage must drive the real screen, not the 6 existing show-rating fixture flows\' route',
  );
});

test('rate/[showId] flow has a CI backstop that deletes what it writes', () => {
  const workflow = read(join(REPO_ROOT, '.github/workflows/maestro-e2e.yml'));
  assert.match(
    workflow,
    /Clean up rate-lifecycle review row[\s\S]*?show_id=eq\.hamilton-2015/,
    'rate-lifecycle.yaml writes a real Supabase row (a Hamilton viewing) — the workflow must delete it, or every CI run leaves a permanent extra row on the shared dev-test account',
  );
});

test('settings delete-account flow can never complete a real account deletion', () => {
  const yaml = read(SETTINGS_FLOW);

  // Parse every tapOn step in order, whichever selector shape it uses —
  // "tapOn: text", "tapOn:\n text:", or "tapOn:\n id:". A destructive tap
  // added via an id: selector (the same style this repo already uses for
  // "show-card-result"/"star-4") must be just as visible here as a text one,
  // or the whole point of this test — that nothing can tap past the warning
  // dialog — has a blind spot.
  const taps = [...yaml.matchAll(/tapOn:\s*(?:\n\s*(?:text:\s*"([^"]+)"|id:\s*"([^"]+)")|\s*"([^"]+)")/g)]
    .map(m => (m[1] ? `text:${m[1]}` : m[2] ? `id:${m[2]}` : `text:${m[3]}`));
  assert.ok(taps.length > 0, 'expected at least one tapOn step in the delete-account-guard flow');

  const deleteIndex = taps.findIndex(t => /^text:.*delete account/i.test(t));
  assert.ok(deleteIndex >= 0, 'expected a tap on "Delete Account" to open the confirmation dialog');

  // The one and only tap allowed after opening the warning dialog is Cancel.
  // A future edit that adds a second destructive tap (a "Yes"/"Confirm"/
  // second "Delete" button, by text OR by id:) here would complete a REAL
  // deletion against the shared dev-test account every other signed-in flow
  // depends on.
  const tapsAfterWarning = taps.slice(deleteIndex + 1);
  assert.deepEqual(
    tapsAfterWarning,
    ['text:Cancel'],
    `the only tap after "Delete Account" must be "Cancel" — found ${JSON.stringify(tapsAfterWarning)}. ` +
    'This flow must never complete a real deletion.',
  );

  // And the flow must actually prove the account survived, not just that
  // Cancel was tapped.
  assert.match(yaml, /assertVisible:\s*"Sign Out"/, 'expected a final assertion that the account is still signed in');
  assert.match(yaml, /assertNotVisible:\s*"Sign In"/, 'expected a final assertion that ruling out a signed-out state (which would follow a real deletion)');
});

// Ties each flow's `id:` selectors back to a real testID in app source — the
// exact kind of drift (a rename nobody updates the flow for) that previously
// could only be caught by a live CI run against a simulator.
test('id: selectors in the show/rate/settings flows resolve to a real testID in app source', () => {
  const APP_DIRS = ['app', 'components'];
  const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'ios', 'android', '.expo']);

  function walk(dir, found = []) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return found; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, found);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  const sourceText = APP_DIRS
    .flatMap(dir => walk(join(REPO_ROOT, dir)))
    .map(f => readFileSync(f, 'utf8'))
    .join('\n');

  const flowIds = new Set();
  for (const flowPath of [SHOW_FLOW, RATE_FLOW, SETTINGS_FLOW]) {
    for (const m of read(flowPath).matchAll(/id:\s*"([^"]+)"/g)) flowIds.add(m[1]);
  }
  assert.ok(flowIds.size > 0, 'expected at least one id: selector across the three flows');

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  for (const id of flowIds) {
    // Three shapes seen in this codebase:
    //   testID="show-card-result"                    (plain JSX attribute)
    //   testID={index === 0 ? 'show-card-result' : …} (conditional expression)
    //   testID={`star-${index}`}                      (template literal, id
    //                                                   only known at runtime
    //                                                   — match on the prefix)
    const plainAttr = new RegExp(`testID=["']${escapeRe(id)}["']`);
    const exprLiteral = new RegExp(`testID=\\{[^}]*['"]${escapeRe(id)}['"]`);
    const templatePrefix = /-\d+$/.test(id)
      && new RegExp(`testID=\\{\`${escapeRe(id.replace(/-\d+$/, '-'))}`).test(sourceText);

    assert.ok(
      plainAttr.test(sourceText) || exprLiteral.test(sourceText) || templatePrefix,
      `flow selector id: "${id}" has no matching testID in app/ or components/ — it was likely renamed and the flow will fail on a real simulator`,
    );
  }
});

test('maestro-e2e.yml can dispatch the show, rate, and settings suites independently', () => {
  const workflow = read(join(REPO_ROOT, '.github/workflows/maestro-e2e.yml'));
  for (const suite of ['show', 'rate', 'settings']) {
    assert.match(
      workflow,
      new RegExp(`^\\s*-\\s*${suite}\\s*$`, 'm'),
      `expected "${suite}" as a workflow_dispatch input option`,
    );
    assert.match(
      workflow,
      new RegExp(`${suite}\\)\\s*PATTERN=".maestro/${suite}/\\*.yaml"`),
      `expected the ${suite} case to map to .maestro/${suite}/*.yaml`,
    );
  }
});
