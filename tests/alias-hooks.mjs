// Resolve the app's "@/..." path alias (tsconfig paths) plus extensionless
// specifiers for plain `node --test` runs.
//
// Without this, any module that imports another module by alias — which is
// most of lib/ — is unloadable outside Metro, so pure logic could not be
// unit-tested at all. scripts/advanced-filters.test.mjs had been failing on
// exactly that (ERR_MODULE_NOT_FOUND '@/lib') since it was written.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];

function firstExisting(base) {
  if (existsSync(fileURLToPath(base))) return base;
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + '/index' + ext);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(new URL(specifier.slice(2), ROOT));
    if (resolved) return nextResolve(resolved.href, context);
  }
  return nextResolve(specifier, context);
}
