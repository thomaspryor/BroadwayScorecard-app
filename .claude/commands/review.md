Post-implementation QA review for the Broadway Scorecard iOS app. Run this AFTER code is written but BEFORE shipping to TestFlight/production. Catches data bugs, type errors, auth flow issues, and UX problems that the implementing session missed.

## When to use

Run `/review` after completing a feature or significant change, before deploying. The workflow is:
1. Idea → `/sanity-check` → Plan → `/critique` → Implement → **`/review`** → Ship

**Use when:** A session just finished building something and you want to verify it's solid before shipping.

## Instructions

### Phase 1: Understand what was built

Identify what to review. This is either:
- The text passed as arguments: $ARGUMENTS
- If no arguments, look at the most recent completed work in the conversation

**Gather scope:**
1. Run `git diff main --stat` (or `git diff HEAD~N --stat` if on main) to see all changed files
2. Read the key changed files to understand what was built
3. Identify which screens/tabs are affected
4. Note any new data fetching, caching changes, or schema updates

Write a brief scope summary: what changed, which screens are affected, what data is involved.

### Phase 2: Automated checks (run ALL in parallel)

Run all of these simultaneously via Bash:

1. **TypeScript check:** `npx tsc --noEmit 2>&1 | tail -20`
2. **Lint check:** `npx expo lint 2>&1 | tail -20`
3. **Export test:** `npx expo export --platform ios 2>&1 | tail -30` (catches import errors, missing modules, runtime crashes at bundle time)

If any fail, report them immediately — these are P0 blockers. Do NOT continue to later phases until these pass.

### Phase 3: Data contract audit

This phase checks that the app correctly handles the data it consumes from the web project's API.

1. **Fetch live data:**
   ```bash
   curl -s https://broadwayscorecard.com/data/search-shows.json | head -c 2000
   ```
   Spot-check edge cases the changed code handles (null scores, missing images, empty arrays).

2. **For show detail changes:** Fetch 2-3 specific show JSONs and verify the code handles all fields:
   ```bash
   curl -s https://broadwayscorecard.com/data/shows/hamilton.json | head -c 3000
   ```

3. **Null/undefined audit:** For every data field accessed in changed files, verify the code handles:
   - Field missing entirely (undefined)
   - Field present but null
   - Field present but empty string/array
   - Unexpected type (string where number expected)

Report findings: what looks correct, what looks suspicious, what's clearly wrong.

### Phase 4: Auth flow verification

Run this phase for ANY change that touches auth-gated code (`useAuth`, `AuthProvider`, `ShowPageRating`, `SignInSheet`, `deferred-auth`, `useUserReviews`, `useWatchlist`, `my-shows`). If no auth-related files were changed, skip to Phase 5.

**Critical rule:** React Native modules import native code (`react-native`, `expo-*`, `@react-native-*`). These CANNOT be `require()`d in Node.js. All verification in this phase is done by **reading source code**, not running scripts.

**A. Feature flag branches:** Read `app/_layout.tsx` and all changed files. For every `featureFlags.userAccounts` check, verify BOTH branches:
- Flag ON + authenticated → full feature renders
- Flag ON + unauthenticated → sign-in CTA / `showSignIn()` called
- Flag OFF → feature hidden (early return / null), no crashes

**B. Deferred auth lifecycle:**
If changes touch rating, watchlist, or sign-in, trace this EXACT sequence through source code:
1. Read `lib/deferred-auth.ts` — verify `savePendingAction()` stores: `type`, `showId`, `rating?`, `reviewText?`, `dateSeen?`, `returnRoute`, `timestamp`
2. In the consuming component (e.g. `components/user/ShowPageRating.tsx`):
   - `savePendingAction()` called BEFORE `showSignIn()`
   - Find the useEffect that calls `getPendingAction()` — verify it depends on `isAuthenticated` or `user?.id`, NOT just component mount (otherwise race condition: getPendingAction fires before onAuthStateChange)
   - After execution: `clearPendingAction()` is called
3. TTL: action expires after 1 hour (`3600000ms`)
4. Storage key: `@bsc:pending_action` (AsyncStorage)

**C. useAuth() consumers:** For every component calling `useAuth()`:
- Handles `loading === true`? (show ActivityIndicator, not flash of wrong state)
- Handles `user === null`? (show sign-in CTA, not crash)
- Uses correct `showSignIn()` context: `'rating'` | `'watchlist'` | `'generic'`
- Works with `DEFAULT_AUTH` fallback (defined at `lib/auth-context.tsx`): all fields return safe no-ops

**D. Data hook null safety:** Verify `useUserReviews(userId)` and `useWatchlist(userId)` are called with `user?.id || null`, not `user.id`.

**E. Pure logic smoke tests:**
For changes to files that DON'T import React Native (e.g., `lib/analytics.ts`, `lib/deferred-auth.ts` if it only uses AsyncStorage via injection, pure helpers in `lib/`), write and run a Node.js test script:
```bash
node -e "const mod = require('./lib/MODULE'); assert(typeof mod.EXPORT === 'function'); ..."
```
**Rule:** If any test script prints `MODULE_NOT_FOUND` or `Cannot find module`, mark that check as **SKIPPED** (not PASSED) and fall back to source reading.

### Phase 5: Style + UX code review

Since we cannot screenshot React Native, this phase uses source analysis and AI review instead.

**A. Style audit:** Read `constants/theme.ts` (or equivalent design tokens file). For every new style in changed files, verify:
- Colors reference the token system, not hardcoded hex values
- Fonts use the app's typography scale
- Spacing uses consistent multiples (4pt/8pt grid)
- Score badges match the web project's visual language (size, color tiers, positioning)

**B. Claude subagent — Code-path UX review:**
Use the Agent tool with subagent_type "general-purpose":

> You are a QA engineer reviewing a just-completed feature in a React Native/Expo iOS app. You have access to the codebase. Your job is to find bugs, edge cases, and UX issues.
>
> **DATA REVIEW:**
> 1. Read the key source files for this feature. Check: are there any code paths that could produce wrong data? (wrong sort order, missing null checks, off-by-one errors, stale cache)
> 2. Check edge cases: What's the weirdest/emptiest/most extreme data this feature will encounter? Will it render correctly?
>
> **UX REVIEW:**
> 3. Walk through the user journey by reading component render logic. What does each state look like? (loading, empty, error, populated, scrolled)
> 4. For auth-gated features: trace unauthenticated path (tap → SignInSheet → sign in → action completes) AND authenticated path (tap → action immediately)
> 5. Does the sign-in sheet show the right context message? Is there a loading flash between "checking auth" and "showing content"?
> 6. What happens if the user cancels sign-in? Does the UI revert cleanly?
> 7. Check all interactive elements have: loading state, error state, empty state, success state
> 8. Verify touch targets are minimum 44pt (Apple HIG)
> 9. Check Pressable/TouchableOpacity have proper hitSlop or padding
>
> **REGRESSION CHECK:**
> 10. Did any shared component get modified? If so, check 2-3 other screens that use it — did they break?
> 11. Are there any new TypeScript `any` types, suppressed errors, or TODO comments that indicate shortcuts?
>
> Reference specific files and line numbers. Under 500 words. Bullet points only.
>
> WHAT WAS BUILT: [describe the feature and list key files]

**C. GPT-4o — Fresh-eyes UX review:**
Write a description of the component tree + user flow to `/tmp/review-ux-context.txt`. Include:
- What the user sees at each step (in plain language, not code)
- The navigation flow (which tab, what they tap, what screen appears)
- For auth-gated features: the full auth flow (what prompts appear when unauthenticated, what happens after sign-in, what happens on cancel, how deferred actions replay)
- What data is displayed and what it means

```bash
curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d "$(jq -n --arg context "$(cat /tmp/review-ux-context.txt)" '{
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {role: "system", content: "You are a theater fan who just downloaded the Broadway Scorecard iOS app. You have never used it before. You are NOT a developer — you are a user.\n\n**YOUR TASKS:**\n\n1. **First impression:** What stands out? What is confusing? What would you tap first? Is it obvious what this screen is for?\n\n2. **Information hierarchy:** Is the most important info the most prominent? Is anything buried that should be front and center?\n\n3. **Trust signals:** Does this feel like a quality app or janky? Would you trust the scores? Is anything inconsistent?\n\n4. **Missing expectations:** As a theater fan, what do you EXPECT to see that is not here?\n\n5. **Auth flow:** If sign-in is involved, does the flow feel natural? Would you understand why you need to sign in? Would you trust the sign-in process?\n\n6. **The one thing:** If you could change ONE thing, what would it be?\n\nBe specific and opinionated. Under 400 words. Bullet points only."},
      {role: "user", content: ("Review this iOS app experience as a first-time user. What is confusing, missing, or wrong?\n\n" + $context)}
    ]
  }')" | jq -r '.choices[0].message.content'
```

### Phase 6: Systematic fix analysis

**For every P0 and P1 issue found, answer TWO questions:**

1. **How do we fix this instance?** (the immediate fix)
2. **How do we prevent this CLASS of problem from ever recurring?** (the systematic fix)

**Examples of systematic fixes:**
- Bug: undefined value crashes component → **Prevent:** TypeScript strict null check, add optional chaining at data boundary
- Bug: component crashes when `user` is null → **Prevent:** Destructure from `useAuth()` with fallback, add `DEFAULT_AUTH` guard
- Bug: deferred action not executed after sign-in → **Prevent:** Integration test verifying pending action lifecycle (save → auth → replay → clear)
- Bug: feature flag not checked around auth code → **Prevent:** Grep check that auth imports are paired with `featureFlags.userAccounts` check
- Bug: hardcoded color instead of theme token → **Prevent:** Lint rule or grep check for hex values outside `constants/theme.ts`
- Bug: data field access without null check → **Prevent:** TypeScript strict null checks enabled, or wrapper that enforces optional chaining at API boundaries

**In the report, for each P0/P1, include:**
- **Fix:** [what to change]
- **Prevent:** [what to add/change so this can't happen again]

If the prevention requires a new test, script, or type — include it in the fix plan. Don't just note it for later.

### Phase 7: Report

Present findings in a structured report:

**P0 — Blockers** (must fix before shipping):
- Build/lint/type errors
- Wrong data displayed
- Broken screens or crashes
- Auth flow broken (deferred action fails, sign-in loop, null user crash)
- Regressions on existing screens

**P1 — Should fix** (fix now, low effort):
- Visual inconsistencies with rest of app
- Missing null/empty state handling
- Auth UX issues (loading flash, wrong context message, cancel doesn't revert)
- Confusing UX that both reviewers flagged
- Touch targets below 44pt

**P2 — Nice to have** (note for follow-up):
- Polish suggestions
- UX improvements only one reviewer flagged
- Edge cases that affect <1% of users

**Summary line:** "Ready to ship" / "Fix N P0 issues first" / "Fix N P0 + recommend fixing N P1 issues"

### Phase 8: Ask the user

Present the report and ask: "Ready to ship as-is, or should I fix the P0/P1 issues first? (Fixes will include systematic prevention.)"
