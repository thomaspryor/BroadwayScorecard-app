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
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FIXTURES, type ShowFixture, type CastMember } from './fixtures/show-below-fold-fixtures';

type ShowKey = 'hamilton' | 'deathOfASalesman';
type CastVariant = 'current' | 'a' | 'b';
type AudienceVariant = 'current' | 'grid';

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
              <Text style={styles.creditName}>{m.name}</Text>
              <TonyPill tony={m.tony} />
            </View>
            <Text style={styles.creditRole}>{m.role}</Text>
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
        <Text style={styles.castCardName} numberOfLines={1}>{member.name}</Text>
        <TonyPill tony={member.tony} />
      </View>
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

// ───────────────────────────────── Screen ───────────────────────────────────
export default function ShowBelowFoldVariantsScreen() {
  const [showKey, setShowKey] = useState<ShowKey>('hamilton');
  const [castVariant, setCastVariant] = useState<CastVariant>('current');
  const [audienceVariant, setAudienceVariant] = useState<AudienceVariant>('current');

  if (!__DEV__ && process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN !== '1') return null;

  const show = FIXTURES[showKey];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fixtureLabel}>DESIGN PROPOSAL — show-page below the fold (#595)</Text>

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
  creditRole: { color: Colors.text.muted, fontSize: FontSize.sm },
  creditName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  showAllButton: {
    alignSelf: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.brand, borderRadius: 999,
  },
  showAllText: { color: '#0a0a0a', fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.2 },

  // Option A — grouped list
  castGroup: { marginBottom: Spacing.lg },
  castGroupLabel: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8, marginBottom: Spacing.xs, textTransform: 'uppercase' },
  castNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
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
});
