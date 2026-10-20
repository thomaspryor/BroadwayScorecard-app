/**
 * Pure decision rules for the offline write queue (lib/offline-queue.ts) and
 * the diary photo upload queue (lib/photo-upload-queue.ts).
 *
 * No react-native / expo imports: tests load this file directly with
 * `node --experimental-strip-types` (see tests/unit/offline-queue-logic.test.mjs).
 */

/** AsyncStorage key of the offline write queue. Shared so the photo queue can
 *  check for a pending review insert without importing offline-queue.ts
 *  (which imports the photo queue for its auto flush). */
export const OFFLINE_QUEUE_KEY = '@bsc:offlineQueue';

/** A failing op is retried this many times before it is dropped and reported. */
export const MAX_OP_ATTEMPTS = 5;

export interface QueuedOperation {
  id: string;
  table: 'reviews' | 'watchlist' | 'lists' | 'list_items';
  action: 'insert' | 'update' | 'delete';
  /** Row data for insert, or partial data for update */
  data?: Record<string, unknown>;
  /** WHERE filters for update/delete (e.g. { id: '...', user_id: '...' }) */
  filters: Record<string, string>;
  createdAt: string;
  /** Account that queued the op. Absent on ops queued before 2026-10. */
  userId?: string;
  /** Failed replays so far (network outages are not counted). */
  attempts?: number;
  lastError?: string | null;
}

// ─── Errors ──────────────────────────────────────────────────

export interface ErrorInfo {
  /** Postgres / PostgREST code ('23505', 'PGRST301', ...), '' when absent */
  code: string;
  /** Storage API statusCode ('409', '403', ...), '' when absent */
  statusCode: string;
  /** HTTP status when the error carries one */
  status: number | null;
  /** Human-readable message */
  message: string;
  /** message + details + error, for pattern matching */
  text: string;
}

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/**
 * Reads code/message from ANY error shape. supabase-js returns PostgREST
 * errors as plain objects ({ code, message, details, hint }), not Error
 * instances, so `e instanceof Error ? e.message : ''` sees nothing.
 */
export function errorInfo(e: unknown): ErrorInfo {
  if (e == null) return { code: '', statusCode: '', status: null, message: '', text: '' };
  if (typeof e !== 'object') {
    const message = String(e);
    return { code: '', statusCode: '', status: null, message, text: message };
  }
  const o = e as Record<string, unknown>;
  const message = str(o.message);
  const text = [message, str(o.details), str(o.error)].filter(Boolean).join(' ');
  return {
    code: str(o.code),
    statusCode: str(o.statusCode),
    status: typeof o.status === 'number' ? o.status : null,
    message,
    text,
  };
}

/** Message of any error shape, or `fallback` when it has none. */
export function errorMessage(e: unknown, fallback = ''): string {
  return errorInfo(e).message || fallback;
}

/**
 * - `duplicate`: the row is already there (an earlier replay landed but its
 *   response was lost) — counts as success
 * - `deferred`: no connection / expired token — keep, do not count an attempt
 * - `permanent`: can never succeed (RLS, missing parent row, bad value)
 * - `retry`: anything else — keep and count an attempt
 */
export type QueueErrorClass = 'duplicate' | 'deferred' | 'permanent' | 'retry';

const PERMANENT_CODES = new Set([
  '42501', // RLS / insufficient privilege
  '23503', // foreign key: parent row gone
  '22P02', // invalid text representation (e.g. a non-uuid id)
  '23502', // not-null violation
  '23514', // check constraint
]);
const NETWORK_RE = /network request failed|failed to fetch|fetch failed|load failed|network ?error|timed? ?out|timeout|aborterror|internet connection/i;
const AUTH_RE = /jwt expired|invalid jwt/i;
const DUPLICATE_RE = /duplicate key|already exists/i;

export function classifyQueueError(e: unknown): QueueErrorClass {
  const info = errorInfo(e);
  if (info.code === '23505' || info.statusCode === '409' || info.status === 409 || DUPLICATE_RE.test(info.text)) {
    return 'duplicate';
  }
  if (NETWORK_RE.test(info.text) || AUTH_RE.test(info.text) || info.code.startsWith('PGRST30')) {
    return 'deferred';
  }
  if (PERMANENT_CODES.has(info.code) || /row-level security/i.test(info.text)) return 'permanent';
  return 'retry';
}

// ─── Ownership ───────────────────────────────────────────────

/** The account an op belongs to, or null for a legacy op that never recorded one. */
export function deriveOwner(op: Pick<QueuedOperation, 'userId' | 'filters' | 'data'>): string | null {
  const v = op.userId ?? op.filters?.user_id ?? op.data?.user_id;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Ops the signed-in user may replay: their own, plus legacy ops with no
 * derivable owner (RLS still scopes those to the caller, so another account's
 * op can only fail under this session, never write into the wrong account).
 * Other accounts' ops stay queued until that account signs back in.
 */
export function isFlushableBy(op: QueuedOperation, userId: string | null): boolean {
  if (!userId) return false;
  const owner = deriveOwner(op);
  return owner === null || owner === userId;
}

// ─── Failure decisions ───────────────────────────────────────

export type FailureDecision =
  | { action: 'done' }
  | { action: 'drop'; reason: string }
  | { action: 'keep'; op: QueuedOperation };

export function decideOnFailure(
  op: QueuedOperation,
  e: unknown,
  maxAttempts: number = MAX_OP_ATTEMPTS,
): FailureDecision {
  const cls = classifyQueueError(e);
  if (cls === 'duplicate') return { action: 'done' };
  const lastError = errorMessage(e, 'Unknown error').slice(0, 300);
  if (cls === 'deferred') return { action: 'keep', op: { ...op, lastError } };
  // A legacy op with no recorded owner may simply belong to another account
  // (RLS rejects it under this session), so it is retried like any other
  // failure instead of being dropped on the first permanent error.
  if (cls === 'permanent' && deriveOwner(op) !== null) {
    return { action: 'drop', reason: `permanent:${errorInfo(e).code || 'rls'}` };
  }
  const attempts = (op.attempts ?? 0) + 1;
  if (attempts >= maxAttempts) return { action: 'drop', reason: 'max-attempts' };
  return { action: 'keep', op: { ...op, attempts, lastError } };
}

/**
 * Applies a flush's outcome to the queue as it is NOW (re-read after the
 * flush), so ops enqueued while the flush ran are never overwritten.
 */
export function applyFlushResult<T extends { id: string }>(
  current: T[],
  removedIds: ReadonlySet<string>,
  updated: ReadonlyMap<string, T>,
): T[] {
  return current.filter(op => !removedIds.has(op.id)).map(op => updated.get(op.id) ?? op);
}

/** Parses a persisted queue, tolerating missing/corrupt storage. */
export function parseQueue<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Ids of rows a queued insert into `table` will create. */
export function pendingInsertIds(queue: QueuedOperation[], table: QueuedOperation['table']): Set<string> {
  const ids = new Set<string>();
  for (const op of queue) {
    const id = op.data?.id;
    if (op.table === table && op.action === 'insert' && typeof id === 'string') ids.add(id);
  }
  return ids;
}

// ─── Lists ───────────────────────────────────────────────────

/**
 * Position for a show added to a list while offline: after every position we
 * know of. `knownPositions` are positions seen from the server or assigned
 * locally; `itemCount * gap` covers a list whose positions were never loaded
 * (online adds use max + gap, so an untouched list's last item sits there).
 */
export function nextListPosition(knownPositions: number[], itemCount: number, gap: number): number {
  const finite = knownPositions.filter(p => Number.isFinite(p));
  return Math.max(0, itemCount * gap, ...finite) + gap;
}

// ─── Photo upload queue ──────────────────────────────────────

export const MAX_PHOTO_ATTEMPTS = 5;
export const PENDING_PHOTO_DIR = 'pending-photos/';

/**
 * - `done`: uploaded already (duplicate row) — remove from the queue
 * - `orphaned`: the review is gone (FK) — remove and delete the uploaded file
 * - `drop`: can never succeed — remove and report
 * - `keep`: retry later; `abandoned` is true the first time it hits the
 *   attempts ceiling (auto flush stops; a manual retry can still run it)
 */
export type PhotoFailureDecision =
  | { action: 'done' }
  | { action: 'orphaned' }
  | { action: 'drop'; reason: string }
  | { action: 'keep'; attempts: number; lastError: string; abandoned: boolean };

export function decidePhotoFailure(
  item: { attempts: number },
  e: unknown,
  maxAttempts: number = MAX_PHOTO_ATTEMPTS,
): PhotoFailureDecision {
  const cls = classifyQueueError(e);
  if (cls === 'duplicate') return { action: 'done' };
  const info = errorInfo(e);
  if (info.code === '23503') return { action: 'orphaned' };
  if (cls === 'permanent') return { action: 'drop', reason: `permanent:${info.code || 'rls'}` };
  const lastError = (info.message || 'Upload failed').slice(0, 300);
  if (cls === 'deferred') return { action: 'keep', attempts: item.attempts, lastError, abandoned: false };
  const attempts = item.attempts + 1;
  return { action: 'keep', attempts, lastError, abandoned: attempts === maxAttempts };
}

/** Storage upload of a path that is already there (retry after a partial success). */
export function isStorageDuplicate(e: unknown): boolean {
  return classifyQueueError(e) === 'duplicate';
}

/** Where a queued photo's file is kept until it uploads (iOS purges Caches). */
export function pendingPhotoUri(documentDirectory: string, photoId: string): string {
  const base = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  return `${base}${PENDING_PHOTO_DIR}${photoId}.jpg`;
}

/** True when the file sits in the OS cache directory and must be moved before queueing. */
export function needsDurableCopy(localUri: string, cacheDirectory: string | null): boolean {
  return !!cacheDirectory && localUri.startsWith(cacheDirectory);
}

/** True for files this queue created (safe to delete once uploaded or dropped). */
export function isOwnPendingPhotoFile(localUri: string, documentDirectory: string | null): boolean {
  if (!documentDirectory) return false;
  const base = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  return localUri.startsWith(`${base}${PENDING_PHOTO_DIR}`);
}

// ─── Concurrency primitives ──────────────────────────────────

/**
 * Promise-chain mutex: every read-modify-write of a persisted queue runs
 * through one of these, so a flush writing its result cannot overwrite an op
 * enqueued a moment earlier.
 */
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Concurrent callers share the in-flight run instead of starting a second one. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().finally(() => { inFlight = null; });
    }
    return inFlight;
  };
}
