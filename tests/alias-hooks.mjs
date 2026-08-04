// Resolve the app's "@/..." path alias (tsconfig paths) plus extensionless
// specifiers for plain `node --test` runs.
//
// Without this, any module that imports another module by alias — which is
// most of lib/ — is unloadable outside Metro, so pure logic could not be
// unit-tested at all. scripts/advanced-filters.test.mjs had been failing on
// exactly that (ERR_MODULE_NOT_FOUND '@/lib') since it was written.
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];

/** Node cannot import a directory, so a bare-path hit only counts when it is a
 *  FILE. existsSync could not tell the difference, so '@/lib/stats' resolved to
 *  the directory and died with ERR_UNSUPPORTED_DIR_IMPORT before reaching the
 *  '/index' branch below — which silently disabled every test that imports a
 *  barrel (stats-scope, stats-aisle-mates). */
function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function firstExisting(base) {
  if (isFile(base)) return base;
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    if (isFile(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + '/index' + ext);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/** Metro imports JSON with a bare specifier; node requires an explicit import
 *  attribute. Adding it here keeps lib/ source Metro-shaped. */
async function finish(url, context, nextResolve) {
  if (url.pathname.endsWith('.json')) {
    return { url: url.href, format: 'json', importAttributes: { type: 'json' }, shortCircuit: true };
  }
  return nextResolve(url.href, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(new URL(specifier.slice(2), ROOT));
    if (resolved) return finish(resolved, context, nextResolve);
  }
  // Relative specifiers inside the resolved module are extensionless too —
  // lib/stats/index.ts re-exports './types'. Metro fills the extension in; the
  // node runner does not, so the alias hop only got us one module deeper.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const resolved = firstExisting(new URL(specifier, context.parentURL));
    if (resolved) return finish(resolved, context, nextResolve);
  }
  return nextResolve(specifier, context);
}
