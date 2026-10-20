/**
 * Fuse.js options for searching the show catalog (Browse, the legacy /search
 * screen). `ignoreLocation` matters: without it Fuse only credits matches near
 * the START of a field, so "cursed child" or a creative team member's name
 * deep in the list scored as a miss. The website searches the whole string.
 *
 * tests/unit/fuse-ignore-location.test.mjs fails if any Fuse options object in
 * app/, components/ or lib/ drops ignoreLocation. Pure: no React Native imports.
 */

import type { IFuseOptions } from 'fuse.js';
import type { Show } from './types';

export const SHOW_SEARCH_FUSE_OPTIONS: IFuseOptions<Show> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
    { name: 'creativeTeam.name', weight: 0.7 },
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
};
