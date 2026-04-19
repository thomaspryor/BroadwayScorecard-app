#!/usr/bin/env node
// Creates the Apple-reviewer demo account in Supabase and seeds it with sample data.
// Run once locally with SUPABASE_SERVICE_ROLE_KEY set. Idempotent.

const https = require('https');

const SUPABASE_URL = 'https://tcbkoevwfemkicrwpypb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || 'reviewer@broadwayscorecard.com';
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD || 'BwayReview2026!';

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path,
      method,
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    };
    const r = https.request(options, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        const parsed = chunks ? (() => { try { return JSON.parse(chunks); } catch { return chunks; } })() : null;
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function ensureUser() {
  console.log(`→ Ensuring user ${REVIEWER_EMAIL} exists…`);
  // Search existing — Supabase admin API uses per_page=1000 and we paginate; for our small instance, one page is fine
  const list = await req('GET', `/auth/v1/admin/users?per_page=1000`);
  const users = list.body?.users || [];
  const existing = users.find(u => (u.email || '').toLowerCase() === REVIEWER_EMAIL.toLowerCase());
  if (existing) {
    console.log(`  ✓ Exists: ${existing.id}`);
    return existing.id;
  }
  // Create with email confirmed (auto-confirm bypasses email verification)
  const res = await req('POST', '/auth/v1/admin/users', {
    email: REVIEWER_EMAIL,
    password: REVIEWER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Apple Reviewer', source: 'demo-account' },
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error('Create failed:', res.status, JSON.stringify(res.body).slice(0, 500));
    process.exit(1);
  }
  console.log(`  ✓ Created: ${res.body.id}`);
  return res.body.id;
}

async function updatePassword(userId) {
  // Always ensure password matches what we document, in case it drifted
  await req('PUT', `/auth/v1/admin/users/${userId}`, { password: REVIEWER_PASSWORD, email_confirm: true });
}

async function clearUserData(userId) {
  console.log(`→ Clearing prior demo data…`);
  // list_items is keyed by list_id; fetch user's lists first, then delete items for those lists
  const listsRes = await req('GET', `/rest/v1/lists?user_id=eq.${userId}&select=id`);
  const listIds = Array.isArray(listsRes.body) ? listsRes.body.map(l => l.id) : [];
  if (listIds.length) {
    const r = await req('DELETE', `/rest/v1/list_items?list_id=in.(${listIds.join(',')})`);
    if (r.status !== 200 && r.status !== 204) console.log(`  (list_items: status ${r.status})`);
  }
  for (const table of ['lists', 'watchlist', 'reviews']) {
    const r = await req('DELETE', `/rest/v1/${table}?user_id=eq.${userId}`);
    if (r.status !== 200 && r.status !== 204) {
      console.log(`  (${table}: status ${r.status})`);
    }
  }
}

async function ensureProfile(userId) {
  console.log(`→ Ensuring profile row exists…`);
  const res = await req('POST', '/rest/v1/profiles', {
    id: userId,
    display_name: 'Apple Reviewer',
    avatar_url: null,
  });
  // 409 = already exists, 201 = created
  if (res.status === 201) console.log('  ✓ Profile created');
  else if (res.status === 409) console.log('  ✓ Profile already exists');
  else console.log(`  (profiles: status ${res.status})`, JSON.stringify(res.body).slice(0, 200));
}

async function seed(userId) {
  console.log(`→ Seeding demo data…`);

  // 5 rated shows for the Watched/Diary tab — top, mid, mixed ratings across varied shows
  const diary = [
    { show_id: 'death-of-a-salesman-2026', rating: 5.0,  review_text: 'Devastating and brilliant — Arthur Miller\'s tragedy has never felt more urgent. Must see.', date_seen: '2026-04-14' },
    { show_id: 'cats-the-jellicle-ball-2026', rating: 4.5, review_text: 'Completely reimagined — the ballroom energy is electric. Never thought I\'d love Cats.', date_seen: '2026-04-07' },
    { show_id: 'giant-2026', rating: 4.0, review_text: 'Sweeping score, epic performances. Second act drags but Act 1 is masterful.', date_seen: '2026-03-29' },
    { show_id: 'chess-2025', rating: 3.5, review_text: 'Gorgeous to hear, harder to follow. Music > book.', date_seen: '2026-03-21' },
    { show_id: 'titanique-2026', rating: 4.5, review_text: 'Pure joy. Celine Dion belting show tunes on a sinking ship — what\'s not to love.', date_seen: '2026-03-08' },
  ];
  for (const r of diary) {
    const res = await req('POST', '/rest/v1/reviews', { user_id: userId, ...r });
    if (res.status !== 201) console.log(`  review ${r.show_id}: status ${res.status}`, JSON.stringify(res.body).slice(0, 200));
    else console.log(`  ✓ reviewed ${r.show_id} (${r.rating}★)`);
  }

  // 3 watchlist entries
  const watchlist = ['proof-2026', 'every-brilliant-thing-2026', 'two-strangers-bway-2025'];
  for (const show_id of watchlist) {
    const res = await req('POST', '/rest/v1/watchlist', { user_id: userId, show_id });
    if (res.status !== 201) console.log(`  watchlist ${show_id}: status ${res.status}`, JSON.stringify(res.body).slice(0, 200));
    else console.log(`  ✓ watchlist: ${show_id}`);
  }

  // 1 custom list with items
  console.log(`→ Creating custom list…`);
  const listRes = await req('POST', '/rest/v1/lists', {
    user_id: userId,
    name: 'Must See This Season',
    description: 'My top Broadway picks for 2026',
    is_ranked: true,
  });
  if (listRes.status !== 201) {
    console.log(`  list: status ${listRes.status}`, JSON.stringify(listRes.body).slice(0, 200));
    return;
  }
  const listId = Array.isArray(listRes.body) ? listRes.body[0].id : listRes.body.id;
  console.log(`  ✓ list: ${listId}`);
  const listItems = [
    { list_id: listId, show_id: 'death-of-a-salesman-2026', position: 1 },
    { list_id: listId, show_id: 'proof-2026',               position: 2 },
    { list_id: listId, show_id: 'every-brilliant-thing-2026', position: 3 },
  ];
  for (const item of listItems) {
    const r = await req('POST', '/rest/v1/list_items', item);
    if (r.status !== 201) console.log(`  list_item ${item.show_id}: status ${r.status}`, JSON.stringify(r.body).slice(0, 200));
    else console.log(`  ✓ list item: ${item.show_id}`);
  }
}

(async () => {
  const userId = await ensureUser();
  await updatePassword(userId);
  await ensureProfile(userId);
  await clearUserData(userId);
  await seed(userId);
  console.log('\n✅ Reviewer demo account ready');
  console.log(`   Email:    ${REVIEWER_EMAIL}`);
  console.log(`   Password: ${REVIEWER_PASSWORD}`);
  console.log(`   User ID:  ${userId}`);
})().catch(e => { console.error(e); process.exit(1); });
