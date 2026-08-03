# Architecture — stack, data strategy, key types, navigation, image URLs

Moved out of CLAUDE.md 2026-08-03 to keep the root file under its 100-line cap.

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

