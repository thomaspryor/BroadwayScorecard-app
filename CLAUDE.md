# Broadway Scorecard iOS App — Project Context

## CRITICAL RULES

### 1. NEVER Ask User to Run Local Commands
User is **non-technical, often on phone**. Automate everything. Push to Git, use EAS Build / GitHub Actions.

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

### Stack
**Expo SDK 54** / React Native 0.81 / TypeScript strict / Expo Router / expo-image / reanimated

### Data Strategy
The mobile app consumes pre-computed data from the web project. All scoring is done server-side.

**Primary data source:** `https://broadwayscorecard.com/data/` (static JSON files baked at deploy time)
- `search-shows.json` — lightweight show list for browse/search (~380KB)
- Individual show data fetched on demand via show detail endpoint

**Caching:** Cache JSON locally with TTL. Refresh on app foreground after 1 hour stale.

### Key Types (match web project's `engine.ts`)
```
ComputedShow: { id, title, slug, venue, openingDate, closingDate, status, type, category,
  images, synopsis, tags, creativeTeam, ticketLinks,
  criticScore: { score, reviewCount, label, reviews[] },
  audienceScore: { score, platforms[], totalReviewCount },
  compositeScore, confidence }
```

**Score display rule:** `compositeScore` = critic-only (default). `blendedScore` = 50/50 critic + audience (Tony predictions only).

### Navigation Structure
```
(tabs)/
  ├── index.tsx          # Home — featured shows, best-of carousels
  ├── browse.tsx         # Browse — filterable show list
  ├── search.tsx         # Search shows
  └── settings.tsx       # Settings, about
show/[slug].tsx          # Show detail page
```

### Image URLs
Show images served from web CDN: `https://broadwayscorecard.com/images/shows/{show-id}/thumbnail.webp`

---

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

## Deployment (EAS Build)
- **Dev:** `npx expo start` → Expo Go on iPhone
- **TestFlight:** EAS Build → TestFlight (automated via GitHub Actions)
- **App Store:** EAS Submit (future)

## File Hygiene
CLAUDE.md (**limit: 100 lines**). Keep it concise. Detailed notes → `memory/{topic}.md`.

## Design Proposals (MANDATORY — owner escalated twice 2026-07-20)
**HTML/CSS mockups of app UI are BANNED — even "token-accurate" ones.** The design system IS the code (`constants/theme.ts` + components). A design proposal means: implement the variant in a worktree → render in the simulator → `simctl io screenshot` → present REAL before/after captures. When direction isn't obvious, build **2-3 rendered variants**, not one recommendation. JS-only changes iterate via dev-client + Metro from the worktree (verify the installed sim app is actually a dev client — production builds silently ignore the dev-client deep link). Full recipe + gotchas: web repo memory `feedback_ios_design_conservative_real_tokens.md`.
**Venue:** deliver design proposals into the owner's **Claude Design** project via the `DesignSync` tool (grouped cards per screen) — artifacts are a fallback link only, not the primary deliverable (owner escalated 2026-07-21). Embed sim captures from original PNGs at ≥900px, JPEG q90+/PNG — never re-compress or upscale.
