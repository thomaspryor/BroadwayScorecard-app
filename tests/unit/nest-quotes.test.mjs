// BRO-4881: review quotes showed doubled quote marks (“"Kramer/Fauci" is...”).
// Same cases as the website's tests/unit/nest-quotes.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nestQuotes, formatPullQuote } from '../../lib/nest-quotes.ts';

test('straight-quoted title inside a pull quote becomes single quotes', () => {
  assert.equal(
    nestQuotes('"Kramer/Fauci" is the most beautiful show I’ve seen this year.'),
    '‘Kramer/Fauci’ is the most beautiful show I’ve seen this year.',
  );
});

test('a quote wrapped entirely in its own marks loses the wrapper', () => {
  assert.equal(nestQuotes('“A quietly devastating evening.”'), 'A quietly devastating evening.');
});

test('a stray opening or closing mark is dropped', () => {
  assert.equal(nestQuotes('"You will be thrilled by the performances...'), 'You will be thrilled by the performances...');
  assert.equal(nestQuotes('It soars.”'), 'It soars.');
});

test('odd inner marks are left as written; a trailing inch mark is kept', () => {
  const odd = 'In the Still of the Night, “Gloria,” “You Can‘t Hurry Love.';
  assert.equal(nestQuotes(odd), odd);
  assert.equal(nestQuotes('He stands a towering 6\'2"'), 'He stands a towering 6\'2"');
});

test('plain text is unchanged', () => {
  const plain = 'Daniel Fish’s brief, potent Kramer/Fauci makes the argument.';
  assert.equal(nestQuotes(plain), plain);
});

test('formatPullQuote wraps, nests and ends with punctuation', () => {
  assert.equal(formatPullQuote('"Kramer/Fauci" soars'), '“‘Kramer/Fauci’ soars.”');
  assert.equal(formatPullQuote('It works!'), '“It works!”');
});

test('every curly-wrapped review quote in the app goes through nestQuotes', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tsx')) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          const m = line.match(/\{'(?:\\u201C|“)'\}\{([^}]*[qQ]uote[^}]*|[a-z]\.t\b[^}]*)\}/);
          if (m && !m[1].includes('nestQuotes(')) offenders.push(`${path.relative(root, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'components'));
  assert.deepEqual(offenders, []);
});
