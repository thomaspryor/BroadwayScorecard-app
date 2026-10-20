// Apple sends the user's name once, on the first authorization, and only on the
// credential. lib/auth-context.tsx dropped it, so Apple accounts never got a
// display name. lib/apple-name.ts decides what to save and when.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appleDisplayName, shouldFillDisplayName } from '../../lib/apple-name.ts';

test('given + family name', () => {
  assert.equal(appleDisplayName({ givenName: 'Audra', familyName: 'McDonald' }), 'Audra McDonald');
  assert.equal(appleDisplayName({ givenName: '  Audra ', middleName: 'Ann', familyName: null }), 'Audra');
});

test('nickname when there is no name; null when Apple sent nothing', () => {
  assert.equal(appleDisplayName({ givenName: null, familyName: null, nickname: 'Audie' }), 'Audie');
  assert.equal(appleDisplayName({ givenName: null, familyName: null }), null);
  assert.equal(appleDisplayName({ givenName: ' ', familyName: '' }), null);
  assert.equal(appleDisplayName(null), null);
  assert.equal(appleDisplayName(undefined), null);
});

test('only an empty display name is filled', () => {
  assert.equal(shouldFillDisplayName('', 'Audra McDonald'), true);
  assert.equal(shouldFillDisplayName(null, 'Audra McDonald'), true);
  assert.equal(shouldFillDisplayName('   ', 'Audra McDonald'), true);
  assert.equal(shouldFillDisplayName('Audra', 'Audra McDonald'), false);
  assert.equal(shouldFillDisplayName('', null), false);
  assert.equal(shouldFillDisplayName('', ''), false);
});
