// Entry point for `node --import ./tests/register-alias.mjs` — installs the
// "@/..." resolver in tests/alias-hooks.mjs.
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
