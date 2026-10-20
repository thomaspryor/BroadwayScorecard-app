// Settings showed only the marketing version ("1.1.0"), so a bug report could
// not say which build or over-the-air update the phone was running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVersionLabel } from '../../lib/app-version.ts';

test('version and build number', () => {
  assert.equal(formatVersionLabel({ version: '1.1.0', build: '73' }), '1.1.0 (73)');
});

test('an OTA update adds its short id', () => {
  assert.equal(
    formatVersionLabel({
      version: '1.1.0',
      build: '73',
      updateId: '0199a3b2-7c1d-4e5f-8a9b-0c1d2e3f4a5b',
      isEmbeddedLaunch: false,
    }),
    '1.1.0 (73) · update 0199a3b2',
  );
});

test('the embedded bundle shows no update id', () => {
  assert.equal(
    formatVersionLabel({ version: '1.1.0', build: '73', updateId: '0199a3b2-7c1d', isEmbeddedLaunch: true }),
    '1.1.0 (73)',
  );
});

test('missing values degrade instead of printing "null"', () => {
  assert.equal(formatVersionLabel({ version: '1.1.0', build: null }), '1.1.0');
  assert.equal(formatVersionLabel({ version: null, build: null, updateId: null }), 'unknown');
});
