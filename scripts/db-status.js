#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Please set it in environment or .env file.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (id serial PRIMARY KEY, filename text NOT NULL UNIQUE, applied_at timestamptz DEFAULT now());`
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const res = await client.query(
      'SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at'
    );
    const applied = new Set(res.rows.map((r) => r.filename));

    const pending = files.filter((f) => !applied.has(f));

    console.log('Applied migrations:');
    console.table(res.rows);
    console.log('\nPending migrations:');
    console.table(pending.map((p, i) => ({ order: i + 1, filename: p })));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
