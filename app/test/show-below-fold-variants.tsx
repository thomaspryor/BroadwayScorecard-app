/**
 * Design-proposal fixture for iOS show-page BELOW THE FOLD sections (task #595).
 * Renders real Hamilton + Death of a Salesman cast/audience data (pulled from
 * the web repo's cast-manifest.json + Tony index — see fixtures/ dir) through
 * several real layout options, so they can be screenshotted in the simulator
 * and compared side-by-side against mobile-web. Nothing here is wired into
 * the live show page — proposal-only.
 *
 * DEV ONLY — returns null in production builds.
 *
 * Usage: /test/show-below-fold-variants
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FIXTURES, type ShowFixture, type CastMember, type ReviewFixture } from './fixtures/show-below-fold-fixtures';

type ShowKey = 'hamilton' | 'deathOfASalesman';
type CastVariant = 'current' | 'a' | 'b';
type AudienceVariant = 'current' | 'grid';
type DistributionVariant = 'current' | 'webParity';
type CriticsTakeVariant = 'current' | 'minimal';
type ScorecardVariant = 'current' | 'carded';
type SynopsisVariant = 'current' | 'contextual';
type TicketVariant = 'current' | 'pillRow' | 'primarySecondary';

const AUDIENCE_LABELS: Record<string, { label: string; color: string }> = {
  ss: { label: 'SHOW SCORE', color: '#facc15' },
  mz: { label: 'MEZZANINE', color: '#c084fc' },
  th: { label: 'THEATR', color: '#34d399' },
  bc: { label: 'BWAY.COM', color: '#60a5fa' },
  rd: { label: 'REDDIT', color: '#fb923c' },
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(opt => (
        <Pressable
          key={opt.key}
          testID={`${testIdPrefix}-${opt.key}`}
          onPress={() => onChange(opt.key)}
          style={[styles.segment, value === opt.key && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, value === opt.key && styles.segmentTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ───────────────────────── Cast: Current (shipped) ─────────────────────────
// Mirrors app/show/[slug].tsx exactly: one flat list (today's public API only
// ships the opening-night roster under `cast`), first 6 shown, no tags.
function CastCurrentVariant({ show }: { show: ShowFixture }) {
  const [showAll, setShowAll] = useState(false);
  const cast = show.openingNightCast;
  return (
    <View>
      <Text style={styles.sectionTitle}>Cast ({cast.length})</Text>
      {(showAll ? cast : cast.slice(0, 6)).map((m, i) => (
        <View key={i} style={styles.creditRow}>
          <Text style={styles.creditRole}>{m.role}</Text>
          <Text style={styles.creditName}>{m.name}</Text>
        </View>
      ))}
      {!showAll && cast.length > 6 && (
        <Pressable style={styles.showAllButton} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {cast.length} cast members</Text>
        </Pressable>
      )}
      <Text style={styles.sectionTitle}>Creative Team</Text>
      {show.creativeTeam.map((m, i) => (
        <View key={i} style={styles.creditRow}>
          <Text style={styles.creditRole}>{m.role}</Text>
          <Text style={styles.creditName}>{m.name}</Text>
        </View>
      ))}
    </View>
  );
}

// ───────────────────────── Cast: Option A — Grouped List + Tags ─────────────
function TonyPill({ tony }: { tony: CastMember['tony'] }) {
  if (!tony) return null;
  return (
    <View style={[styles.tonyPill, tony.won ? styles.tonyPillWon : styles.tonyPillNom]}>
      <IconSymbol name={tony.won ? 'trophy.fill' : 'star'} size={10} color={tony.won ? '#FFD700' : Colors.text.muted} />
      <Text style={[styles.tonyPillText, tony.won && styles.tonyPillTextWon]}>{tony.won ? 'Winner' : 'Nom'}</Text>
    </View>
  );
}

function CastGroupA({ title, members }: { title: string; members: CastMember[] }) {
  const [showAll, setShowAll] = useState(false);
  if (members.length === 0) return null;
  const visible = showAll ? members : members.slice(0, 6);
  return (
    <View style={styles.castGroup}>
      <Text style={styles.castGroupLabel}>{title}</Text>
      {visible.map((m, i) => (
        <View key={i} style={styles.creditRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.castNameRow}>
              <Text style={styles.castMemberName}>{m.name}</Text>
              <TonyPill tony={m.tony} />
            </View>
            <Text style={styles.castMemberRole}>{m.role}</Text>
            {m.flags.length > 0 && <Text style={styles.castFlagText}>{m.flags.join(' · ')}</Text>}
          </View>
        </View>
      ))}
      {!showAll && members.length > 6 && (
        <Pressable style={styles.showAllButton} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {members.length} cast members</Text>
        </Pressable>
      )}
    </View>
  );
}

function CastOptionA({ show }: { show: ShowFixture }) {
  const isOpen = show.status === 'open' || show.status === 'previews';
  const originalLabel = show.category?.includes('west-end') ? 'Original London Cast' : 'Original Broadway Cast';
  return (
    <View>
      {isOpen && show.currentCast.length > 0 && <CastGroupA title="Current Cast" members={show.currentCast} />}
      <CastGroupA title={originalLabel} members={show.openingNightCast} />
      <CastGroupA title="Notable Replacements" members={show.replacements} />
      <View style={styles.creativeCard}>
        <Text style={styles.creativeCardLabel}>CREATIVE TEAM</Text>
        {show.creativeTeam.map((m, i) => (
          <View key={i} style={[styles.creditRow, i === show.creativeTeam.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.creditName}>{m.name}</Text>
            <Text style={styles.creditRole}>{m.role}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ───────────────────────── Cast: Option B — Card Grid ───────────────────────
function CastCardB({ member, accent }: { member: CastMember; accent: string }) {
  return (
    <View style={[styles.castCard, { borderLeftColor: accent }]}>
      <View style={styles.castCardTop}>
        <Text style={styles.castCardName} numberOfLines={2}>{member.name}</Text>
      </View>
      <TonyPill tony={member.tony} />
      <Text style={styles.castCardRole} numberOfLines={2}>{member.role}</Text>
      {member.flags.length > 0 && <Text style={styles.castFlagText}>{member.flags.join(' · ')}</Text>}
    </View>
  );
}

function CastGridB({ title, members, accent }: { title: string; members: CastMember[]; accent: string }) {
  const [showAll, setShowAll] = useState(false);
  if (members.length === 0) return null;
  const visible = showAll ? members : members.slice(0, 6);
  return (
    <View style={styles.castGroup}>
      <Text style={styles.castGroupLabel}>{title}</Text>
      <View style={styles.castGrid}>
        {visible.map((m, i) => (
          <View key={i} style={styles.castGridCell}>
            <CastCardB member={m} accent={accent} />
          </View>
        ))}
      </View>
      {!showAll && members.length > 6 && (
        <Pressable style={styles.showAllButton} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {members.length} cast members</Text>
        </Pressable>
      )}
    </View>
  );
}

function CastOptionB({ show }: { show: ShowFixture }) {
  const isOpen = show.status === 'open' || show.status === 'previews';
  const originalLabel = show.category?.includes('west-end') ? 'Original London Cast' : 'Original Broadway Cast';
  return (
    <View>
      {isOpen && show.currentCast.length > 0 && (
        <CastGridB title="Current Cast" members={show.currentCast} accent={Colors.score.teal} />
      )}
      <CastGridB title={originalLabel} members={show.openingNightCast} accent={Colors.brand} />
      <CastGridB title="Notable Replacements" members={show.replacements} accent={Colors.text.muted} />
      <View style={styles.creativeCard}>
        <Text style={styles.creativeCardLabel}>CREATIVE TEAM</Text>
        <View style={styles.castGrid}>
          {show.creativeTeam.map((m, i) => (
            <View key={i} style={styles.castGridCell}>
              <View style={[styles.castCard, { borderLeftColor: Colors.score.teal }]}>
                <Text style={styles.castCardName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.castCardRole}>{m.role}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ───────────────────────── Audience: Current (shipped) — horizontal scroll ──
function AudienceCurrentVariant({ show }: { show: ShowFixture }) {
  if (!show.audience) return null;
  const entries = Object.entries(show.audience.sources).filter(([k]) => AUDIENCE_LABELS[k]);
  return (
    <View>
      <Text style={styles.sectionTitle}>Audience Grade</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
        {entries.map(([key, src]) => {
          const cfg = AUDIENCE_LABELS[key];
          return (
            <View key={key} style={styles.audienceSourceCard}>
              <Text style={[styles.audienceSourceLabel, { color: cfg.color }]}>{cfg.label}</Text>
              <Text style={styles.audienceSourceValue}>{src.sr != null ? `${src.sr}/5` : `${src.s}%`}</Text>
              <Text style={styles.audienceSourceMeta}>{(src.tp ?? src.c).toLocaleString()} {src.tp ? 'mentions' : 'reviews'}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ───────────────────────── Audience: Option — 3-col grid (web parity) ───────
function AudienceGridVariant({ show }: { show: ShowFixture }) {
  if (!show.audience) return null;
  const entries = Object.entries(show.audience.sources).filter(([k]) => AUDIENCE_LABELS[k]);
  return (
    <View>
      <Text style={styles.sectionTitle}>Audience Grade</Text>
      <View style={styles.audienceGrid}>
        {entries.map(([key, src]) => {
          const cfg = AUDIENCE_LABELS[key];
          return (
            <View key={key} style={styles.audienceGridCell}>
              <Text style={[styles.audienceSourceLabel, { color: cfg.color }]}>{cfg.label}</Text>
              <Text style={styles.audienceSourceValue}>{src.sr != null ? `${src.sr}/5` : `${src.s}%`}</Text>
              <Text style={styles.audienceSourceMeta}>{(src.tp ?? src.c).toLocaleString()} {src.tp ? 'mentions' : 'reviews'}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.seeAllLink}>See all audience scores →</Text>
    </View>
  );
}

// ───────────────────────── Score Distribution ───────────────────────────────
const RAVE_COLOR = '#FFD700';
const POSITIVE_COLOR = Colors.score.green;
const MIXED_COLOR = Colors.score.amber;
const NEGATIVE_COLOR = Colors.score.red;

function computeCounts(reviews: ReviewFixture[]) {
  const counts = { Rave: 0, Positive: 0, Mixed: 0, Negative: 0 };
  for (const r of reviews) {
    if (r.bucket === 'Rave') counts.Rave++;
    else if (r.bucket === 'Positive') counts.Positive++;
    else if (r.bucket === 'Mixed') counts.Mixed++;
    else if (r.bucket === 'Negative') counts.Negative++;
  }
  return counts;
}

// Current (shipped): thick bar + stacked label rows underneath, one per line.
function DistributionCurrentVariant({ show }: { show: ShowFixture }) {
  const counts = computeCounts(show.reviews);
  const seg = (count: number, color: string) =>
    count > 0 ? <View style={[styles.breakdownSegment, { flex: count, backgroundColor: color }]} /> : null;
  return (
    <View style={styles.breakdownContainer}>
      <View style={styles.breakdownBar}>
        {seg(counts.Rave, RAVE_COLOR)}
        {seg(counts.Positive, POSITIVE_COLOR)}
        {seg(counts.Mixed, MIXED_COLOR)}
        {seg(counts.Negative, NEGATIVE_COLOR)}
      </View>
      <View style={styles.breakdownLabelsStacked}>
        {(['Rave', 'Positive', 'Mixed', 'Negative'] as const).map(k => {
          const n = counts[k];
          if (n === 0) return null;
          const color = k === 'Rave' ? RAVE_COLOR : k === 'Positive' ? POSITIVE_COLOR : k === 'Mixed' ? MIXED_COLOR : NEGATIVE_COLOR;
          return (
            <View key={k} style={styles.breakdownLabelRow}>
              <View style={[styles.breakdownDot, { backgroundColor: color }]} />
              <Text style={styles.breakdownLabelText}>{n} {k}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Web parity: thinner rounded bar + one compact horizontal legend row (matches
// ScoreBreakdownBar.tsx — web never stacks the legend, even on narrow mobile).
function DistributionWebParityVariant({ show }: { show: ShowFixture }) {
  const counts = computeCounts(show.reviews);
  const seg = (count: number, color: string) =>
    count > 0 ? <View style={[styles.breakdownSegmentThin, { flex: count, backgroundColor: color }]} /> : null;
  return (
    <View style={styles.breakdownContainerThin}>
      <View style={styles.breakdownBarThin}>
        {seg(counts.Rave, RAVE_COLOR)}
        {seg(counts.Positive, POSITIVE_COLOR)}
        {seg(counts.Mixed, MIXED_COLOR)}
        {seg(counts.Negative, NEGATIVE_COLOR)}
      </View>
      <View style={styles.breakdownLegendRow}>
        {(['Rave', 'Positive', 'Mixed', 'Negative'] as const).map(k => {
          const n = counts[k];
          if (n === 0) return null;
          const color = k === 'Rave' ? RAVE_COLOR : k === 'Positive' ? POSITIVE_COLOR : k === 'Mixed' ? MIXED_COLOR : NEGATIVE_COLOR;
          return (
            <View key={k} style={styles.breakdownLegendItem}>
              <View style={[styles.breakdownSquare, { backgroundColor: color }]} />
              <Text style={styles.breakdownLegendText}>{n} {k}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ───────────────────────── Critics' Take ─────────────────────────────────────
// Current (shipped): bordered box, quote icon, footer divider + review count.
function CriticsTakeCurrentVariant({ show }: { show: ShowFixture }) {
  return (
    <View style={styles.criticsTakeBox}>
      <View style={styles.criticsTakeHeader}>
        <View style={styles.criticsTakeQuoteMark}>
          <Text style={styles.criticsTakeQuoteMarkText}>&#8220;</Text>
        </View>
        <View style={styles.criticsTakeHeaderText}>
          <Text style={styles.criticsTakeLabel}>Critics&apos; Take</Text>
          <Text style={styles.criticsTakeText}>{show.criticsTake.text}</Text>
        </View>
      </View>
      <View style={styles.criticsTakeFooter}>
        <Text style={styles.criticsTakeFooterText}>
          Based on {show.criticsTake.reviewCount} reviews
        </Text>
      </View>
    </View>
  );
}

// Web parity: no card chrome — small uppercase label + paragraph, reads as a
// continuation of the score row rather than a separate boxed module.
function CriticsTakeMinimalVariant({ show }: { show: ShowFixture }) {
  return (
    <View style={styles.criticsTakeMinimal}>
      <Text style={styles.criticsTakeMinimalLabel}>Critics&apos; Take</Text>
      <Text style={styles.criticsTakeMinimalText}>{show.criticsTake.text}</Text>
    </View>
  );
}

// ───────────────────────── Critic Scorecard / Review Rows ───────────────────
function FixtureReviewRow({ review }: { review: ReviewFixture }) {
  const scoreColor = review.bucket === 'Rave' ? RAVE_COLOR : review.bucket === 'Positive' ? POSITIVE_COLOR : review.bucket === 'Mixed' ? MIXED_COLOR : NEGATIVE_COLOR;
  const formattedDate = (() => {
    try {
      return new Date(review.publishDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return null; }
  })();
  return (
    <Pressable
      style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}
      onPress={() => review.url && Linking.openURL(review.url)}
    >
      <View style={[styles.reviewScore, { backgroundColor: scoreColor }]}>
        <Text style={styles.reviewScoreText}>{review.score}</Text>
      </View>
      <View style={styles.reviewBody}>
        <Text style={styles.reviewOutlet} numberOfLines={1}>{review.outlet}</Text>
        <Text style={styles.reviewQuote} numberOfLines={2}>&#8220;{review.quote}&#8221;</Text>
        <View style={styles.reviewMetaRow}>
          <Text style={styles.reviewCritic}>By {review.criticName}</Text>
          {formattedDate && <Text style={styles.reviewMetaDot}>·</Text>}
          {formattedDate && <Text style={styles.reviewDate}>{formattedDate}</Text>}
        </View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={Colors.text.muted} style={styles.reviewChevron} />
    </Pressable>
  );
}

// Current (shipped): flat "Critic Reviews (N)" title, no card chrome, no
// methodology link, no sort control.
function ScorecardCurrentVariant({ show }: { show: ShowFixture }) {
  const [showAll, setShowAll] = useState(false);
  const reviews = showAll ? show.reviews : show.reviews.slice(0, 3);
  return (
    <View>
      <Text style={styles.sectionTitle}>Critic Reviews ({show.reviewCount})</Text>
      {reviews.map((r, i) => <FixtureReviewRow key={i} review={r} />)}
      {!showAll && show.reviews.length > 3 && (
        <Pressable style={styles.showAllButton} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {show.reviewCount} reviews</Text>
        </Pressable>
      )}
    </View>
  );
}

// Web parity: bordered "Critic Scorecard" card, header with review count,
// Sort By Score/Date toggle, methodology footer link — matches the web card
// exactly (id="critic-reviews" section on page.tsx).
function ScorecardCardedVariant({ show }: { show: ShowFixture }) {
  const [showAll, setShowAll] = useState(false);
  const [sortMode, setSortMode] = useState<'score' | 'date'>('score');
  const sorted = sortMode === 'date'
    ? [...show.reviews].sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())
    : show.reviews;
  const visible = showAll ? sorted : sorted.slice(0, 3);
  return (
    <View style={styles.scorecardCard}>
      <View style={styles.scorecardHeader}>
        <Text style={styles.scorecardHeaderLabel}>CRITIC SCORECARD</Text>
        <Text style={styles.scorecardHeaderCount}>{show.reviewCount} reviews</Text>
      </View>
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort:</Text>
        <Pressable onPress={() => setSortMode('score')}>
          <Text style={[styles.sortOption, sortMode === 'score' && styles.sortOptionActive]}>By Score</Text>
        </Pressable>
        <Pressable onPress={() => setSortMode('date')}>
          <Text style={[styles.sortOption, sortMode === 'date' && styles.sortOptionActive]}>By Date</Text>
        </Pressable>
      </View>
      {visible.map((r, i) => <FixtureReviewRow key={i} review={r} />)}
      {!showAll && sorted.length > 3 && (
        <Pressable style={styles.showAllButton} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {show.reviewCount} reviews</Text>
        </Pressable>
      )}
      <View style={styles.methodologyRow}>
        <Text style={styles.methodologyText}>How this score works &rarr;</Text>
      </View>
    </View>
  );
}

// ───────────────────────── Synopsis ──────────────────────────────────────────
// Current (shipped): always-shown "About" section, independent of Critics' Take.
function SynopsisCurrentVariant({ show }: { show: ShowFixture }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.synopsis}>{show.synopsis}</Text>
    </View>
  );
}

// Web parity: no title, plain paragraph — and on the real site this block
// only renders when there's NO Critics' Take consensus (avoids duplicating
// the same context twice). Both fixture shows have a consensus, so the note
// below documents when this would actually appear.
function SynopsisContextualVariant({ show }: { show: ShowFixture }) {
  return (
    <View>
      <Text style={styles.synopsisPlain}>{show.synopsis}</Text>
      <Text style={styles.synopsisNote}>
        Web only renders this block when a show has no Critics&apos; Take consensus yet — otherwise the
        consensus text covers the same ground and this paragraph is skipped entirely.
      </Text>
    </View>
  );
}

// ───────────────────────── Ticket CTAs ───────────────────────────────────────
// Current (shipped): single filled "Get Tickets" button, TodayTix-only.
function TicketCurrentVariant({ show }: { show: ShowFixture }) {
  const primary = show.ticketLinks.find(l => /todaytix/i.test(l.p)) ?? show.ticketLinks[0];
  return (
    <Pressable style={({ pressed }) => [styles.getTicketsButton, pressed && styles.pressed]} onPress={() => Linking.openURL(primary.u)}>
      <Text style={styles.getTicketsText}>Get Tickets</Text>
    </Pressable>
  );
}

// Web parity: row of small pill buttons — every ticket platform + Official
// Site, all equal weight (matches TicketButtonsAB.tsx link row).
function TicketPillRowVariant({ show }: { show: ShowFixture }) {
  return (
    <View style={styles.ticketPillRow}>
      {show.ticketLinks.map((l, i) => (
        <Pressable key={i} style={styles.ticketPill} onPress={() => Linking.openURL(l.u)}>
          <Text style={styles.ticketPillText}>{l.p}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.ticketPill} onPress={() => Linking.openURL(show.officialUrl)}>
        <Text style={styles.ticketPillText}>Official Site</Text>
      </Pressable>
    </View>
  );
}

// Option: one filled primary CTA (top platform) + a secondary link row for
// the rest — native-idiomatic middle ground between the two extremes.
function TicketPrimarySecondaryVariant({ show }: { show: ShowFixture }) {
  const primary = show.ticketLinks.find(l => /todaytix/i.test(l.p)) ?? show.ticketLinks[0];
  const rest = show.ticketLinks.filter(l => l !== primary);
  return (
    <View>
      <Pressable style={({ pressed }) => [styles.getTicketsButton, pressed && styles.pressed]} onPress={() => Linking.openURL(primary.u)}>
        <Text style={styles.getTicketsText}>Get Tickets &middot; {primary.p}</Text>
      </Pressable>
      <View style={styles.ticketSecondaryRow}>
        {rest.map((l, i) => (
          <Pressable key={i} onPress={() => Linking.openURL(l.u)}>
            <Text style={styles.ticketSecondaryLink}>{l.p}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => Linking.openURL(show.officialUrl)}>
          <Text style={styles.ticketSecondaryLink}>Official Site</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ───────────────────────────────── Screen ───────────────────────────────────
export default function ShowBelowFoldVariantsScreen() {
  const [showKey, setShowKey] = useState<ShowKey>('hamilton');
  const [castVariant, setCastVariant] = useState<CastVariant>('current');
  const [audienceVariant, setAudienceVariant] = useState<AudienceVariant>('current');
  const [distributionVariant, setDistributionVariant] = useState<DistributionVariant>('current');
  const [criticsTakeVariant, setCriticsTakeVariant] = useState<CriticsTakeVariant>('current');
  const [scorecardVariant, setScorecardVariant] = useState<ScorecardVariant>('current');
  const [synopsisVariant, setSynopsisVariant] = useState<SynopsisVariant>('current');
  const [ticketVariant, setTicketVariant] = useState<TicketVariant>('current');

  if (!__DEV__ && process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN !== '1') return null;

  const show = FIXTURES[showKey];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fixtureLabel}>DESIGN PROPOSAL — show-page below the fold (#595 + #865)</Text>

      <Segmented
        testIdPrefix="bf-show-tab"
        value={showKey}
        onChange={setShowKey}
        options={[
          { key: 'hamilton', label: 'Hamilton' },
          { key: 'deathOfASalesman', label: 'Death of a Salesman' },
        ]}
      />

      <Text style={styles.showTitle}>{show.title}</Text>
      <Text style={styles.showMeta}>{show.venue} · {show.category}</Text>

      {/* ── Cast & Creative ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>CAST &amp; CREATIVE</Text>
      <Segmented
        testIdPrefix="bf-cast-variant"
        value={castVariant}
        onChange={setCastVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'a', label: 'Option A' },
          { key: 'b', label: 'Option B' },
        ]}
      />
      <View testID="bf-cast-content" style={styles.sectionBox}>
        {castVariant === 'current' && <CastCurrentVariant show={show} />}
        {castVariant === 'a' && <CastOptionA show={show} />}
        {castVariant === 'b' && <CastOptionB show={show} />}
      </View>

      {/* ── Audience ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>AUDIENCE</Text>
      <Segmented
        testIdPrefix="bf-audience-variant"
        value={audienceVariant}
        onChange={setAudienceVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'grid', label: 'Grid (web parity)' },
        ]}
      />
      <View testID="bf-audience-content" style={styles.sectionBox}>
        {audienceVariant === 'current' && <AudienceCurrentVariant show={show} />}
        {audienceVariant === 'grid' && <AudienceGridVariant show={show} />}
      </View>

      {/* ── Score Distribution (task #865) ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>SCORE DISTRIBUTION</Text>
      <Segmented
        testIdPrefix="bf-distribution-variant"
        value={distributionVariant}
        onChange={setDistributionVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'webParity', label: 'Web parity' },
        ]}
      />
      <View testID="bf-distribution-content" style={styles.sectionBox}>
        {distributionVariant === 'current' && <DistributionCurrentVariant show={show} />}
        {distributionVariant === 'webParity' && <DistributionWebParityVariant show={show} />}
      </View>

      {/* ── Critics' Take (task #865) ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>CRITICS&apos; TAKE</Text>
      <Segmented
        testIdPrefix="bf-criticstake-variant"
        value={criticsTakeVariant}
        onChange={setCriticsTakeVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'minimal', label: 'Web parity (minimal)' },
        ]}
      />
      <View testID="bf-criticstake-content" style={styles.sectionBox}>
        {criticsTakeVariant === 'current' && <CriticsTakeCurrentVariant show={show} />}
        {criticsTakeVariant === 'minimal' && <CriticsTakeMinimalVariant show={show} />}
      </View>

      {/* ── Critic Scorecard / Review Rows (task #865) ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>CRITIC SCORECARD &amp; REVIEW ROWS</Text>
      <Segmented
        testIdPrefix="bf-scorecard-variant"
        value={scorecardVariant}
        onChange={setScorecardVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'carded', label: 'Carded (web parity)' },
        ]}
      />
      <View testID="bf-scorecard-content" style={styles.sectionBox}>
        {scorecardVariant === 'current' && <ScorecardCurrentVariant show={show} />}
        {scorecardVariant === 'carded' && <ScorecardCardedVariant show={show} />}
      </View>

      {/* ── Synopsis (task #865) ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>SYNOPSIS / DETAILS</Text>
      <Segmented
        testIdPrefix="bf-synopsis-variant"
        value={synopsisVariant}
        onChange={setSynopsisVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'contextual', label: 'Web parity (contextual)' },
        ]}
      />
      <View testID="bf-synopsis-content" style={styles.sectionBox}>
        {synopsisVariant === 'current' && <SynopsisCurrentVariant show={show} />}
        {synopsisVariant === 'contextual' && <SynopsisContextualVariant show={show} />}
      </View>

      {/* ── Ticket CTAs (task #865) ── */}
      <View style={styles.blockDivider} />
      <Text style={styles.blockLabel}>TICKET CTAs</Text>
      <Segmented
        testIdPrefix="bf-tickets-variant"
        value={ticketVariant}
        onChange={setTicketVariant}
        options={[
          { key: 'current', label: 'Current' },
          { key: 'pillRow', label: 'Pill row' },
          { key: 'primarySecondary', label: 'Primary+secondary' },
        ]}
      />
      <View testID="bf-tickets-content" style={styles.sectionBox}>
        {ticketVariant === 'current' && <TicketCurrentVariant show={show} />}
        {ticketVariant === 'pillRow' && <TicketPillRowVariant show={show} />}
        {ticketVariant === 'primarySecondary' && <TicketPrimarySecondaryVariant show={show} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  content: { padding: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.xxl * 2 },
  fixtureLabel: {
    color: '#f59e0b', fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1,
    marginBottom: Spacing.lg, textAlign: 'center',
  },
  showTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', marginTop: Spacing.md },
  showMeta: { color: Colors.text.muted, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  blockDivider: { borderTopWidth: 1, borderTopColor: Colors.border.subtle, marginTop: Spacing.xl, paddingTop: Spacing.lg },
  blockLabel: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: Spacing.sm },
  sectionBox: { marginTop: Spacing.md },
  segmented: {
    flexDirection: 'row', backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md,
    padding: 3, gap: 3,
  },
  segment: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.brand },
  segmentText: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600' },
  segmentTextActive: { color: '#0a0a0a', fontWeight: '700' },

  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.lg, marginBottom: Spacing.md },
  creditRow: { flexDirection: 'row', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  creditRole: { color: Colors.text.muted, fontSize: FontSize.sm, width: 120 },
  creditName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  showAllButton: {
    alignSelf: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.brand, borderRadius: 999,
  },
  showAllText: { color: '#0a0a0a', fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.2 },

  // Option A — grouped list
  castGroup: { marginBottom: Spacing.lg },
  castGroupLabel: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8, marginBottom: Spacing.xs, textTransform: 'uppercase' },
  castNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  castMemberName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  castMemberRole: { color: Colors.text.muted, fontSize: FontSize.sm, marginTop: 1 },
  castFlagText: { color: Colors.brand, fontSize: 11, marginTop: 2 },
  tonyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  tonyPillWon: { backgroundColor: 'rgba(255,215,0,0.14)' },
  tonyPillNom: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tonyPillText: { fontSize: 10, fontWeight: '700', color: Colors.text.muted },
  tonyPillTextWon: { color: '#FFD700' },
  creativeCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border.subtle,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  creativeCardLabel: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8, marginBottom: Spacing.sm },

  // Option B — card grid
  castGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  castGridCell: { width: '48%' },
  castCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.sm, borderLeftWidth: 3,
    padding: Spacing.sm, minHeight: 64,
  },
  castCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.xs },
  castCardName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', flexShrink: 1 },
  castCardRole: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },

  // Audience
  audienceSourceCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md, padding: Spacing.md,
    width: 110, borderWidth: 1, borderColor: Colors.border.subtle,
  },
  audienceSourceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  audienceSourceValue: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  audienceSourceMeta: { color: Colors.text.muted, fontSize: 11, marginTop: 2 },
  audienceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  audienceGridCell: {
    width: '31%', backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  seeAllLink: { color: Colors.brand, fontSize: FontSize.sm, marginTop: Spacing.md, fontWeight: '600' },

  // ── Score Distribution (current — mirrors app/show/[slug].tsx BreakdownBar) ──
  breakdownContainer: {},
  breakdownBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  breakdownSegment: {},
  breakdownLabelsStacked: { marginTop: Spacing.md, gap: 6 },
  breakdownLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabelText: { color: Colors.text.secondary, fontSize: FontSize.xs },

  // ── Score Distribution (web parity — thinner bar + one horizontal legend row) ──
  breakdownContainerThin: { gap: 6 },
  breakdownBarThin: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.surface.overlay },
  breakdownSegmentThin: {},
  breakdownLegendRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap' },
  breakdownLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakdownSquare: { width: 8, height: 8, borderRadius: 2 },
  breakdownLegendText: { color: Colors.text.muted, fontSize: 10 },

  // ── Critics' Take (current) ──
  criticsTakeBox: { marginTop: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md },
  criticsTakeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  criticsTakeQuoteMark: { width: 18, alignItems: 'center' },
  criticsTakeQuoteMarkText: { color: Colors.brand, fontSize: 22, fontWeight: '700', lineHeight: 22, opacity: 0.7 },
  criticsTakeHeaderText: { flex: 1 },
  criticsTakeLabel: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  criticsTakeText: { color: Colors.text.secondary, fontSize: FontSize.sm, lineHeight: 20 },
  criticsTakeFooter: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border.subtle },
  criticsTakeFooterText: { color: Colors.text.muted, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },

  // ── Critics' Take (web parity — minimal, no card chrome) ──
  criticsTakeMinimal: { marginTop: Spacing.sm },
  criticsTakeMinimalLabel: { color: Colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  criticsTakeMinimalText: { color: Colors.text.secondary, fontSize: FontSize.sm, lineHeight: 20 },

  // ── Review rows (shared by both scorecard variants) ──
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  reviewScore: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reviewScoreText: { color: '#0a0a0a', fontSize: FontSize.md, fontWeight: '800' },
  reviewBody: { flex: 1, minWidth: 0 },
  reviewOutlet: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 3 },
  reviewQuote: { color: Colors.text.secondary, fontSize: FontSize.sm, lineHeight: 19 },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  reviewCritic: { color: Colors.text.muted, fontSize: FontSize.xs, flexShrink: 1 },
  reviewMetaDot: { color: Colors.text.muted, fontSize: FontSize.xs },
  reviewDate: { color: Colors.text.muted, fontSize: FontSize.xs },
  reviewChevron: { alignSelf: 'center' },

  // ── Critic Scorecard: carded (web parity) ──
  scorecardCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border.subtle,
    padding: Spacing.md,
  },
  scorecardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  scorecardHeaderLabel: { color: Colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  scorecardHeaderCount: { color: Colors.text.muted, fontSize: 11, fontWeight: '600' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  sortLabel: { color: Colors.text.muted, fontSize: 11 },
  sortOption: { color: Colors.text.muted, fontSize: 11, fontWeight: '600' },
  sortOptionActive: { color: Colors.text.primary },
  methodologyRow: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border.subtle },
  methodologyText: { color: Colors.text.muted, fontSize: 11 },

  // ── Synopsis ──
  synopsis: { color: Colors.text.secondary, fontSize: FontSize.md, lineHeight: 24 },
  synopsisPlain: { color: Colors.text.muted, fontSize: FontSize.sm, lineHeight: 21 },
  synopsisNote: { color: Colors.text.muted, fontSize: 11, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 16 },

  // ── Ticket CTAs ──
  getTicketsButton: { backgroundColor: Colors.brand, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  getTicketsText: { color: '#0a0a0a', fontSize: FontSize.md, fontWeight: '800' },
  ticketPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ticketPill: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 999,
    backgroundColor: Colors.surface.overlay, borderWidth: 1, borderColor: Colors.border.subtle,
  },
  ticketPillText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600' },
  ticketSecondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md, justifyContent: 'center' },
  ticketSecondaryLink: { color: Colors.brand, fontSize: FontSize.xs, fontWeight: '600' },

  pressed: { opacity: 0.7 },
});
