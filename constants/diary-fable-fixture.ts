/**
 * FABLE design-round fixture (DESIGN ONLY — not shipped).
 *
 * Realistic season of viewings so the D/E/F Diary directions render with
 * believable content. Show IDs resolve against the live catalogue (useShows)
 * so posters, venues, and critic scores are real.
 *
 * Gated behind FABLE_DIARY_VARIANT in app/(tabs)/watched.tsx.
 */

import type { UserReview } from '@/lib/user-types';

const U = 'fable-fixture-user';

function review(
  id: string,
  show_id: string,
  rating: number,
  date_seen: string,
  review_text: string | null,
): UserReview {
  return {
    id,
    user_id: U,
    show_id,
    rating,
    review_text,
    date_seen,
    visibility: 'public',
    created_at: date_seen + 'T20:00:00Z',
    updated_at: date_seen + 'T20:00:00Z',
  };
}

/** Newest → oldest. Dates span a full season (Sept 2025 → June 2026). */
export const FABLE_REVIEWS: UserReview[] = [
  review('d1', 'hamilton-2015', 5.0, '2026-06-14', 'Third time and the goosebumps never fade. Still the best thing in this city.'),
  review('d2', 'maybe-happy-ending-2024', 5.0, '2026-05-30', 'Cried at a love story between two robots. Darren Criss is extraordinary.'),
  review('d3', 'oh-mary-2024', 4.5, '2026-05-10', 'Unhinged in the best way. My face ached from laughing by the curtain.'),
  review('d4', 'sunset-boulevard-2024', 4.0, '2026-04-22', 'Scherzinger is a force of nature. The roving-camera gimmick mostly earns it.'),
  review('d5', 'stereophonic-2024', 5.0, '2026-04-11', 'Felt like being locked in the studio for a year. Not a wasted second.'),
  review('d6', 'dead-outlaw-2025', 4.5, '2026-04-04', 'Strangest, most alive new musical I have seen in years.'),
  review('d7', 'gypsy-2024', 4.5, '2026-03-18', 'Audra. That is the entire review.'),
  review('d8', 'death-becomes-her-2024', 4.0, '2026-02-28', 'Camp spectacle done exactly right. Megan Hilty is having the time of her life.'),
  review('d9', 'buena-vista-social-club-2025', 4.5, '2026-02-11', 'The band gets a mid-show standing ovation and completely earns it.'),
  review('d10', 'john-proctor-is-the-villain-2025', 4.0, '2026-01-24', 'Sadie Sink and a room of teenagers rewriting the Crucible. Sharp.'),
  review('d11', 'merrily-we-roll-along-2023', 5.0, '2025-12-20', 'Groff, Radcliffe, Mendez. Devastating told backwards.'),
  review('d12', 'the-outsiders-2024', 4.0, '2025-11-29', 'The rumble staging is genuinely unreal. Stay gold.'),
  review('d13', 'hells-kitchen-2024', 3.5, '2025-11-08', 'Maleah Joi Moon is a star. The book is thin but the songs carry it.'),
  review('d14', 'water-for-elephants-2024', 3.5, '2025-10-18', 'The circus work is thrilling; the story underneath it is a little soft.'),
  review('d15', 'hamilton-2015', 5.0, '2025-10-11', 'Brought my sister for her first time. Watching her discover it was the whole night.'),
  review('d16', 'suffs-2024', 4.0, '2025-09-27', 'History I should have known, staged with real fire.'),
  review('d17', 'the-great-gatsby-2024', 2.5, '2025-09-06', 'Gorgeous to look at, hollow at the center.'),
];
