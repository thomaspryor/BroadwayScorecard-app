#!/usr/bin/env node
/**
 * Pure helpers for turning an App Store Connect crashLog relationship
 * response into a normalised item field. No network, no fs — kept separate
 * from fetch-beta-feedback.js so the shape-parsing logic is unit-testable
 * without hitting the live API (task #1055).
 *
 * Verified shape (2026-08-05, live run against item AK1jBS_JWG4VL6RCQX2nyLw):
 *   GET /v1/betaFeedbackCrashSubmissions/{id}/crashLog ->
 *     { data: { type: 'betaCrashLogs', id, attributes: { logText: '...' } } }
 * `logText` is the raw Apple crash-report text (Incident Identifier, thread
 * state, binary images, backtrace). It is NOT symbolicated: app-code frames
 * show only addresses. The observed sample crashed inside dyld itself
 * (missing framework at launch) so it was fully readable without a dSYM —
 * a crash inside application code would need the dSYM from the matching EAS
 * build to turn addresses into function names, which this does not attempt.
 */

/** Extract the crash log text from a crashLog endpoint response body.
 *  Returns null if the shape doesn't match — missing relationship, an error
 *  page, or an ASC response shape change. */
function extractLogText(body) {
  const text = body && body.data && body.data.attributes && body.data.attributes.logText;
  return typeof text === 'string' && text.length ? text : null;
}

/** Filename a given item's crash log is written under, alongside screenshots. */
function crashLogFilename(itemId) {
  return `${itemId}.crashlog.txt`;
}

module.exports = { extractLogText, crashLogFilename };
