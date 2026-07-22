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

## Design Proposals (principles — owner feedback 2026-07-20/21)
1. **Fidelity honesty.** Anything presented to the owner as "the proposed design" must be rendered by the real product (variant in a worktree → simulator → `simctl io screenshot`) or composited onto real captures. Rough sketches are allowed for private exploration only, must be labeled as sketches, and are never the deliverable — two incidents of HTML re-creations shown as designs were rejected as fake.
2. **Venue (owner-confirmed 2026-07-21):** Claude Design — the dedicated DesignSync project **"iOS App — Proposed Designs"** (projectId d21b75cc-0388-4721-81f5-d886f744919f). CRITICAL ROUTING NUANCE: the owner opens it via **claude.ai/design → "Design systems" tab** (confirmed working); direct `claude.ai/project/<id>` URLs show no-permission for the owner — NEVER hand the owner a raw project URL, always the design-pane path. Do not write proposals into "Broadway Scorecard Design System" (tokens only). Artifact https://claude.ai/code/artifact/708007ba-4153-4d88-bb06-581e3388e8c9 is the fallback copy. (A 2026-07-21 session wrongly concluded Claude Design was unusable after testing only direct URLs — that conclusion is superseded by the owner's confirmed pane access.)
3. **Options where real.** Render 2-3 variants when direction is genuinely contested; one when it's obvious. Don't manufacture options for compliance.
4. **Verify before showing.** Open the deliverable yourself first: every image sharp (embed from original PNGs, ≥900px, no re-compress/upscale), every section populated, no placeholders.
Pipeline gotchas + full recipe: web repo memory `feedback_ios_design_conservative_real_tokens.md` (dev-client vs production build trap, Maestro launchApp/point-taps).
**Owner link format (proven 2026-07-21):** `https://claude.ai/design/<projectId>` — opens with commenting. NEVER `claude.ai/project/<id>` (no-permission for the owner). Proposals live under ios-design-proposals/ in the ORIGINAL project the owner can provably open: https://claude.ai/design/469cbecf-df92-424c-bffd-f3441d1f745e (restored 2026-07-21 after the relocated project d21b75cc proved owner-invisible — projects created by session auth may not be visible to the owner; only 469cbecf has owner-confirmed access, so ALL proposal publishing goes there)
