/**
 * UK flagship regional houses (RSC, Chichester, ...). A `regional` show at one
 * of these is not a Broadway tryout, so its run line says where it plays
 * ("in Stratford-upon-Avon") instead of "in tryout".
 *
 * Mirrors the website's data/uk-regional-venues.json (match + aliases + city);
 * tests/unit/run-info.test.mjs checks the two lists agree when the website
 * repo is checked out next to this one. Pure: no React Native imports.
 */

export interface UkRegionalVenue {
  match: string;
  city: string;
  aliases: readonly string[];
}

export const UK_REGIONAL_VENUES: readonly UkRegionalVenue[] = [
  {
    match: 'royal shakespeare',
    city: 'Stratford-upon-Avon',
    aliases: ['royal shakespeare company', 'royal shakespeare theatre', 'swan theatre, stratford', 'the other place, stratford'],
  },
  {
    match: 'chichester festival theatre',
    city: 'Chichester',
    aliases: ['chichester festival theatre', 'chichester festival', 'minerva theatre, chichester', 'minerva theatre chichester'],
  },
  { match: 'royal exchange theatre', city: 'Manchester', aliases: ['royal exchange theatre', 'royal exchange manchester'] },
  { match: 'crucible theatre', city: 'Sheffield', aliases: ['crucible theatre', 'sheffield crucible'] },
  { match: 'leeds playhouse', city: 'Leeds', aliases: ['leeds playhouse'] },
  { match: 'bristol old vic', city: 'Bristol', aliases: ['bristol old vic'] },
  { match: 'birmingham rep', city: 'Birmingham', aliases: ['birmingham rep', 'birmingham repertory theatre'] },
  { match: 'nottingham playhouse', city: 'Nottingham', aliases: ['nottingham playhouse'] },
  { match: 'liverpool everyman', city: 'Liverpool', aliases: ['liverpool everyman'] },
  { match: 'royal lyceum', city: 'Edinburgh', aliases: ['royal lyceum theatre', 'royal lyceum', 'lyceum edinburgh'] },
  { match: 'citizens theatre', city: 'Glasgow', aliases: ['citizens theatre', 'citizens theatre glasgow'] },
];

/** City of a UK regional venue, or undefined (web getUkRegionalVenueCity). */
export function getUkRegionalVenueCity(category?: string | null, venue?: string | null): string | undefined {
  if (category !== 'regional' || !venue) return undefined;
  const v = venue.toLowerCase();
  return UK_REGIONAL_VENUES.find(
    entry => v.includes(entry.match) || entry.aliases.some(alias => v.includes(alias)),
  )?.city;
}
