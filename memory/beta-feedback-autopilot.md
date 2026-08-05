# Overnight beta-feedback autopilot

Built 2026-08-04 on the owner's request: scan TestFlight beta feedback, implement
the fixes overnight, and require approval for feedback that is not the owner's.

## What runs

`~/Library/LaunchAgents/com.broadwayscorecard.feedback-overnight.plist` fires
nightly at 02:15 local and runs `scripts/feedback/overnight-launchd.sh`, which
runs `scripts/feedback/overnight.js`:

1. `scripts/feedback/pull.js` — dispatches `fetch-beta-feedback.yml`, waits,
   downloads the encrypted artifact, decrypts it, ingests it into the ledger.
2. Owner items become `queued`. Everyone else's become `needs-approval`.
3. Up to `--max` (default 6) queued items go to a headless `claude` run in a
   fresh worktree. The agent implements, gates, commits, and records outcomes.
4. The driver — not the agent — runs the four gates again, merges, pushes, and
   ships an OTA update.
5. Morning report lands in `~/Documents/claude-outputs/beta-feedback-overnight-*.md`.

## The approval rule

`OWNER_EMAILS` in `scripts/feedback/ledger.js` is the whole basis for the split.
Matched exactly, lowercased and trimmed, never by pattern — a lookalike address
like `thomas.pryor@gmail.com.attacker.net` must not be auto-processed. Locked by
`scripts/feedback/ledger.test.mjs`, which runs in `eas-build.yml`.

Approve a tester's item with:

    node scripts/feedback/ledger.js --approve <id>

## Where state lives

`~/.claude/broadwayscore-feedback/` — **deliberately not in the repo**. The repo
is public and every submission carries the tester's email, device, and
screenshots of their account. Override with `BSC_FEEDBACK_HOME`.

    ledger.json      id -> {role, status, comment, commit, note}
    items/<id>.json  full normalised submission
    images/<id>-<n>.jpg
    runs/<stamp>.*   per-run log, seed prompt, agent transcript
    env              mode-600, holds CLAUDE_CODE_OAUTH_TOKEN for launchd
    DISABLED         create this file to stop the automation

Statuses: `queued` `needs-approval` `approved` `in-progress` `done` `deferred`
`rejected`. Only `queued` and `approved` are ever picked up.

## Guardrails, and why each exists

- **Refuses to run on a dirty tree or off main.** The agent branches from the
  checkout; uncommitted work would be swept into an unreviewed overnight commit.
- **Never buys a native build.** The driver reads `ship.js --dry-run` and skips
  shipping if the decision is BUILD, because a build costs $1.85 and that is the
  owner's call. The agent is also told not to touch `ios/`, `app.json`,
  `plugins/`, or dependencies.
- **The agent never merges, pushes, or ships.** Those three steps cost money or
  reach the owner's phone, so they live in the driver where they always run the
  same way.
- **Gates run twice** — once by the agent before committing, once by the driver
  on the merged branch. A branch that fails is left in place, unmerged.
- **Deferring is encouraged.** The seed prompt tells the agent that a wrong fix
  shipped overnight is worse than an item left for a human, and to defer
  anything ambiguous, large, or needing a product decision.
- **Stranded items go back on the queue.** If the agent dies mid-run, anything
  left `in-progress` is requeued instead of being silently dropped.

## Ledger backfill (2026-08-04)

The first 62 submissions (2026-07-25 through 2026-08-04 02:13Z) were marked
`done` with commit `pre-ledger`: they were worked in manual batches before any
record existed. The cutoff is item #62 ("last card on each row needs to be a bit
off screen"), which commit 574cf85 demonstrably addressed by adding carousel
peek. Items from 03:45Z on 2026-08-04 onward were the first real queue.

## Gotchas found while building this

- Only the **app-scoped** ASC collection paths work.
  `/v1/betaFeedbackScreenshotSubmissions?filter[app]=` answers 403
  `FORBIDDEN_ERROR ... does not allow GET_COLLECTION`. Use
  `/v1/apps/{id}/betaFeedback{Screenshot,Crash}Submissions`. Crash submissions
  were silently never fetched until this was fixed.
- Screenshots must be saved as `<submissionId>-<n>.jpg`. The original fetcher
  wrote `img-001.jpg` in flat discovery order, which destroyed the only link
  between an image and the comment describing it — and nearly every comment says
  "this screen" without naming it.
- Screenshot URLs are pre-signed and expire in about 7 days, so the bytes are
  pulled at fetch time, not lazily.
