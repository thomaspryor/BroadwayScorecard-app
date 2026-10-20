// Search parity: Fuse.js by default only credits a match near the START of a
// field (location 0, distance 100), so a word deep in a long title or in the
// creative-team list scored as a miss. Every show search sets
// ignoreLocation: true, like the website. This guard fails if a new Fuse
// options object in app/, components/ or lib/ leaves it out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fuse from 'fuse.js';
import { SHOW_SEARCH_FUSE_OPTIONS } from '../../lib/show-search.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test('every IFuseOptions object sets ignoreLocation: true', () => {
  const offenders = [];
  let seen = 0;
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/IFuseOptions<[^>]+>\s*=\s*\{/g)) {
        seen++;
        // The object literal runs to the first line that closes it at column 0.
        const body = src.slice(m.index, src.indexOf('\n};', m.index));
        if (!/ignoreLocation:\s*true/.test(body)) offenders.push(relative(ROOT, file));
      }
    }
  }
  assert.ok(seen >= 3, `found the Fuse option objects (${seen})`);
  assert.deepEqual(offenders, []);
});

test('a word deep in a long title still matches', () => {
  const shows = [
    { title: 'Harry Potter and the Cursed Child', venue: 'Lyric Theatre', creativeTeam: [] },
    { title: 'Purlie Victorious: A Non-Confederate Romp Through the Cotton Patch', venue: 'Music Box Theatre', creativeTeam: [] },
    { title: 'The Phantom of the Opera', venue: 'Majestic Theatre', creativeTeam: [] },
    {
      title: 'A Musical',
      venue: 'Some Theatre',
      creativeTeam: Array.from({ length: 12 }, (_, i) => ({ name: `Person Number${i}` })).concat({ name: 'Stephen Sondheim' }),
    },
  ];
  const fuse = new Fuse(shows, SHOW_SEARCH_FUSE_OPTIONS);
  assert.equal(fuse.search('cursed child')[0]?.item.title, 'Harry Potter and the Cursed Child');
  assert.equal(fuse.search('opera')[0]?.item.title, 'The Phantom of the Opera');
  // A real title from the feed whose words sit past Fuse's default window.
  assert.equal(fuse.search('cotton patch')[0]?.item.title.startsWith('Purlie Victorious'), true);
  // Same query without ignoreLocation misses it: proves the option is load-bearing.
  const strict = new Fuse(shows, { ...SHOW_SEARCH_FUSE_OPTIONS, ignoreLocation: false });
  assert.equal(strict.search('cotton patch').some(r => r.item.title.startsWith('Purlie')), false);
});
