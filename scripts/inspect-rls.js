#!/usr/bin/env node
// READ-ONLY diagnostic: dumps the RLS state of a table — whether row security
// is enabled and forced, and every policy on it with its command, roles,
// permissive-vs-restrictive kind, USING clause and WITH CHECK clause.
//
// Why this exists: on 2026-08-12 the push_tokens policy migration reported
// APPLIED, and the insert it was meant to unblock still failed with 42501.
// Guessing a second time at a production security setting is exactly the wrong
// move, and there was no way to see the actual policy state — PostgREST does
// not expose pg_policies, so the service-role key cannot read it. This can.
//
// Runs only SELECTs against catalog views. It cannot modify anything.
//
// Usage: node scripts/inspect-rls.js <table>       (default: push_tokens)

const https = require('https');

const PROJECT_REF = 'tcbkoevwfemkicrwpypb';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TABLE = (process.argv[2] || 'push_tokens').replace(/[^a-zA-Z0-9_]/g, '');

if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN env var.');
  process.exit(1);
}
if (!TABLE) {
  console.error('Usage: node scripts/inspect-rls.js <table>');
  process.exit(1);
}

function query(sql) {
  const payload = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        let chunks = '';
        res.on('data', c => (chunks += c));
        res.on('end', () => {
          const body = chunks ? (() => { try { return JSON.parse(chunks); } catch { return chunks; } })() : null;
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            return reject(new Error(`${res.statusCode}: ${JSON.stringify(body).slice(0, 600)}`));
          }
          resolve(body);
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  const flags = await query(`
    select c.relname as table,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = '${TABLE}';
  `);
  console.log(`=== RLS flags for public.${TABLE} ===`);
  console.log(JSON.stringify(flags, null, 2));

  const policies = await query(`
    select polname as name,
           case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                       when 'w' then 'UPDATE' when 'd' then 'DELETE'
                       else 'ALL' end as command,
           case when polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as kind,
           coalesce(
             (select array_agg(rolname order by rolname)::text
              from pg_roles where oid = any(polroles)),
             'PUBLIC') as roles,
           pg_get_expr(polqual, polrelid) as using_clause,
           pg_get_expr(polwithcheck, polrelid) as with_check_clause
    from pg_policy
    where polrelid = 'public.${TABLE}'::regclass
    order by polcmd, polname;
  `);
  console.log(`\n=== Policies on public.${TABLE} ===`);
  console.log(JSON.stringify(policies, null, 2));

  const grants = await query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = '${TABLE}'
      and grantee in ('anon', 'authenticated')
    order by grantee, privilege_type;
  `);
  console.log(`\n=== Table grants for anon/authenticated on public.${TABLE} ===`);
  console.log(JSON.stringify(grants, null, 2));
  console.log(
    '\nNote: a policy permits nothing without the underlying table GRANT. ' +
    'If INSERT is missing here, the policy is irrelevant — the grant is the gate.',
  );
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
