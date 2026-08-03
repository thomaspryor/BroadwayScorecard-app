# Broadway Scorecard iOS App — Project Context

## CRITICAL RULES

### 1. NEVER Ask User to Run Local Commands
User is **non-technical, often on phone**. Automate everything. Push to Git, use EAS Build / GitHub Actions.

### 1b. Ships Without Pre-Review; OTA by default (owner decisions 2026-07-27, 2026-08-03)
Never block a ship on owner approval or screenshot sign-off — design-review
gates apply to feature direction and App Store releases, not beta builds.
**JS-only changes ship over the air and produce NO TestFlight notification**
(owner chose this 2026-08-03 over ~$1.85/change); the app applies them on the
second launch. The push notification is still the owner's cue to go look, so
it is now YOUR call when to buy one: dispatch with `-f force_build=true` for
anything you actually want them to review — a visible redesign, a batch of
beta-feedback fixes, anything you'd otherwise ask "can you check this?" about.
Silent OTA is right for bug fixes, copy, and follow-ups to something they have
already seen. See the Deployment section.

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
1. `npx tsc --noEmit` — zero TypeScript errors
2. `npx expo lint` — no new warnings
2b. `npm run lint:design` — 12pt font floor (owner decision 2026-07-12; sweep 2026-07-20)
3. `npx expo export --platform ios` — must succeed (catches import/runtime errors)
4. For UI: test on iOS Simulator (use dev auth bypass: `EXPO_PUBLIC_DEV_AUTO_SIGNIN=1`)
5. **Before shipping UI changes: run `/review`** — the single source of truth for QA. Catches visual regressions, data bugs, and UX issues.

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
**Expo SDK 54** / React Native 0.81 / TypeScript strict / Expo Router / expo-image / reanimated.
Data comes pre-computed from the web project (`https://broadwayscorecard.com/data/`);
all scoring is server-side. Stack detail, the `ComputedShow` shape, the
critic-vs-blended score rule, navigation structure and image URLs:
`memory/architecture.md`.

## Repo Layout
- **Web:** `~/Broadwayscore/` → GitHub: `thomaspryor/Broadwayscore`
- **iOS app:** `~/BroadwayScorecard-app/` → GitHub: `thomaspryor/BroadwayScorecard-app`

## Web Project Reference
The source web project lives at: `~/Broadwayscore/` (repo: `thomaspryor/Broadwayscore`)
- Types: `src/lib/engine.ts`, `src/lib/data-types.ts`
- Scoring config: `src/config/scoring.ts`
- Data loading: `src/lib/data-core.ts`
- Components to replicate: `src/components/show-cards/`

---

## Deployment — EAS builds cost ~$1.85 each, so DO NOT reach for one by reflex
- **Dev:** `npx expo start` → Expo Go on iPhone
- **Shipping:** `gh workflow run eas-build.yml --ref main`, then verify with
  `npx eas-cli build:list`. The workflow runs `scripts/ship.js`, which picks a
  native build ONLY when the native fingerprint moved and otherwise ships a free
  OTA update. Check locally first with `node scripts/ship.js --dry-run`.
- **ONE ship per session, at the end.** Builds 69-72 were four separate
  dispatches in a single session (2026-08-03) that shared one fingerprint — the
  first three were pure waste. Batch fixes, ship once. Ship-check findings are
  part of the same batch, not a reason to re-dispatch.
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
publishing recipe live in `memory/design-proposals.md`. Read it before showing
the owner any proposed design — HTML re-creations presented as designs have
been rejected twice.
