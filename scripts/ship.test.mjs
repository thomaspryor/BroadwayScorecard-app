// BRO-4896: a failed EAS auto-submit must surface Apple's reason in the CI log.
// Run: node --test scripts/ship.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { surfaceSubmitFailure } = require('./ship.js');

const finished = JSON.stringify([{ id: 'a61ff451', status: 'FINISHED' }]);

test('retries the submit for the finished build and logs its output', () => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push(args.join(' '));
    return args.includes('build:list') ? finished : 'submitted OK';
  };
  const r = surfaceSubmitFailure(run, new Error('x'));
  assert.equal(r.buildId, 'a61ff451');
  assert.equal(r.submitted, true);
  assert.ok(calls.some(c => c.includes('submit --platform ios --id a61ff451')));
});

test('captures Apple error text when the retry submit fails', () => {
  const run = (cmd, args) => {
    if (args.includes('build:list')) return finished;
    const e = new Error('exit 1');
    e.stderr = 'ITMS-4238: Redundant Binary Upload (build 82)';
    throw e;
  };
  const r = surfaceSubmitFailure(run, new Error('x'));
  assert.equal(r.submitted, false);
  assert.match(r.detail, /ITMS-4238/);
});

test('does not retry submit when the build itself did not finish', () => {
  const calls = [];
  const run = (cmd, args) => { calls.push(args[1]); return JSON.stringify([{ id: 'b', status: 'ERRORED' }]); };
  const r = surfaceSubmitFailure(run, new Error('x'));
  assert.equal(r.buildId, null);
  assert.deepEqual(calls, ['build:list']);
});

test('never throws when the diagnostics themselves fail', () => {
  const run = () => { throw new Error('no network'); };
  assert.doesNotThrow(() => surfaceSubmitFailure(run, new Error('x')));
});
