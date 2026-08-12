# Broadway Scorecard iOS App — Project Context

## CRITICAL RULES

### 1. NEVER Ask User to Run Local Commands
User is **non-technical, often on phone**. Automate everything. Push to Git, use EAS Build / GitHub Actions.

### 1b. Ships Without Pre-Review; OTA by default (owner decisions 2026-07-27, 2026-08-03)
Never block a ship on owner approval or screenshot sign-off — design-review
gates apply to feature direction and App Store releases, not beta builds.
**JS-only changes ship over the air and produce NO TestFlight notification**
(owner chose this 2026-08-03 over ~$1.85/change); the app applies them on the
second launch. That notification is the owner's cue to go look, so it is YOUR
call when to buy one: dispatch with `-f force_build=true` for anything you
actually want reviewed (a visible redesign, a batch of beta-feedback fixes,
anything you'd otherwise ask "can you check this?" about). Silent OTA is right
for bug fixes, copy, and follow-ups to something already seen.

### 2. Git Workflow
- **Main branch only** — no PRs, no feature branches (matches web project).
- **BRANCH CHECK:** `git branch --show-current` before ANY commit/push.
- **Commit frequently** — after each logical unit. WIP commits are fine. Never >2 uncommitted files.
- **Push every ~30 min** or after milestones.
- **15+ min without committing → stop and commit NOW.**

### 3. Never Guess/Fake Data
All show data comes from the web project's public API or pre-built JSON. Never fabricate scores, reviews, or show metadata.

### 4. Test Before Committing (MANDATORY)
Before EVERY commit touching `app/`, `components/`, `lib/`, or config:
1. `npm run typecheck` — zero TypeScript errors
2. `npm run lint` and `npm run lint:design` — no new warnings; 12pt font floor
3. `npm test` — full unit/logic suite, ~2s (RLS tests skip without fixture secrets)
4. `npx expo export --platform ios` — must succeed (catches import/runtime errors)
5. For UI: test on iOS Simulator (use dev auth bypass: `EXPO_PUBLIC_DEV_AUTO_SIGNIN=1`)
6. **Before shipping UI changes: run `/review`** — the single source of truth for QA. Catches visual regressions, data bugs, and UX issues.

`ci.yml` enforces 1-4 on every push to main; `maestro-e2e.yml` runs all 27 E2E
flows nightly. **Never add a test by naming its file in a workflow step** —
every suite is glob-driven so new tests run automatically. Full strategy, the
three test layers, and the rules behind them: `memory/testing.md`.

### 5. Design System
Replicate the web project's visual language:
- **Score badges** — 0-100 numeric for critics, letter grades for audience. Colors by tier.
- **Card layout: `[Thumbnail] [Info] [Score]`** — match the web's three-column flex pattern.
- **Dark theme primary.** Match web palette: background `#0a0a0a`, text `#ECEDEE`, tint `#0a7ea4`.
- Use shared components — never inline score displays or show cards.
- Score column fixed width. Score badges are sacred — never change size/position/shape.

### 6. Fix Systematically, Not One-Off (MANDATORY)
Every fix MUST include prevention. Ask: "How do I prevent this permanently?"

### 7. Always Recommend Next Steps
When wrapping up a task, recommend the best next task. Don't just say "done."

### 8. Feature Parity (Session Start)
Check `memory/feature-parity.md` for P0/P1 web features not yet in app. Note relevant items.

---

## Architecture
**Expo SDK 57** / React Native 0.86 / TypeScript strict / Expo Router / expo-image / reanimated.
Data comes pre-computed from the web project (`https://broadwayscorecard.com/data/`);
all scoring is server-side. Stack detail, the `ComputedShow` shape, the critic-vs-
blended score rule, navigation structure and image URLs: `memory/architecture.md`.

## Repo Layout
- **iOS app:** `~/BroadwayScorecard-app/` → `thomaspryor/BroadwayScorecard-app`
- **Web (source of truth for data + visual language):** `~/Broadwayscore/` →
  `thomaspryor/Broadwayscore`. Types `src/lib/engine.ts`, `src/lib/data-types.ts`;
  scoring `src/config/scoring.ts`; data loading `src/lib/data-core.ts`;
  components to replicate `src/components/show-cards/`.

---

## Deployment — EAS builds cost ~$1.85 each, so DO NOT reach for one by reflex
- **Dev:** `npx expo start` → Expo Go on iPhone
- **Shipping:** `gh workflow run eas-build.yml --ref main`, then verify with
  `npx eas-cli build:list`. The workflow runs `scripts/ship.js`, which picks a
  native build ONLY when the native fingerprint moved and otherwise ships a free
  OTA update. Check locally first with `node scripts/ship.js --dry-run`.
- **ONE ship per session, at the end.** Builds 69-72 were four dispatches in one
  session (2026-08-03) sharing a fingerprint; the first three were waste. Batch
  fixes, ship once — ship-check findings belong to the same batch.
- **Only these change the fingerprint** (i.e. actually need a build): a native
  dependency added/removed/upgraded, `app.json`/`app.config.*` native config, an
  SDK bump, a config plugin, app icon/splash. Everything in `app/`,
  `components/`, `lib/`, `hooks/` is JavaScript and goes OTA.
- **Never end "merged + pushed"** without shipping — a session that did left the
  owner on a stale build (2026-07-24, build 54). See rule 1b for build-vs-OTA.
- **App Store:** EAS Submit (future)

## File Hygiene
CLAUDE.md (**limit: 100 lines**). Keep it concise. Detailed notes → `memory/{topic}.md`.

## Design Proposals
Fidelity rules, the owner-confirmed Claude Design venue + link format, and the
publishing recipe: `memory/design-proposals.md`. Read it before showing the
owner any proposed design — HTML re-creations have been rejected twice.
