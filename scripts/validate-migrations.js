#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function fail(msg) {
  console.error('Migration validation failed:', msg);
  process.exit(1);
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail(`Migrations directory not found: ${MIGRATIONS_DIR}`);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
if (files.length === 0) fail('No .sql migration files found in supabase/migrations/');

// Check duplicates
const dupCheck = new Set();
for (const f of files) {
  if (dupCheck.has(f)) fail(`Duplicate migration filename: ${f}`);
  dupCheck.add(f);
}

// Reject duplicate migration sequence identities (YYYYMMDD_NNN)
const seqCheck = new Set();
for (const f of files) {
  const m = f.match(/^([0-9]{8}_[0-9]{3})_/);
  if (m) {
    const seq = m[1];
    if (seqCheck.has(seq))
      fail(`Duplicate migration sequence detected: ${seq} (conflicting file: ${f})`);
    seqCheck.add(seq);
  } else {
    // already will fail on naming, but be explicit
    fail(`Cannot extract sequence prefix from filename: ${f}`);
  }
}

// Validate naming convention YYYYMMDD_NNN_description.sql
const nameRegex = /^[0-9]{8}_[0-9]{3}_[A-Za-z0-9._-]+\.sql$/;
for (const f of files) {
  if (!nameRegex.test(f))
    fail(`Invalid migration filename (must be YYYYMMDD_NNN_description.sql): ${f}`);
}

// Ensure files are sorted and report order
const sorted = [...files].sort();
for (let i = 0; i < files.length; i++) {
  if (files[i] !== sorted[i]) {
    console.warn('Migration files are not in sorted order; expected execution order is:');
    console.warn(sorted.join('\n'));
    break;
  }
}

// Check non-empty and readable
for (const f of sorted) {
  const p = path.join(MIGRATIONS_DIR, f);
  try {
    const st = fs.statSync(p);
    if (st.size === 0) fail(`Empty migration file: ${f}`);
    // quick readability check
    fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail(`Cannot read migration file ${f}: ${e.message}`);
  }
}

console.log('Migration files validated — execution order:');
sorted.forEach((s, i) => console.log(`${i + 1}. ${s}`));
process.exit(0);
