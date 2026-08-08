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

  // Production safeguard: require explicit acknowledgement when NODE_ENV=production
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true') {
    console.error(
      'Refusing to run migrations in production without ALLOW_PRODUCTION_MIGRATIONS=true'
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Ensure migrations table exists
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (id serial PRIMARY KEY, filename text NOT NULL UNIQUE, applied_at timestamptz DEFAULT now());`
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const res = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(res.rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log('Skipping', file);
        continue;
      }
      console.log('Applying', file);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log('Applied', file);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to apply', file, e.message);
        throw e;
      }
    }

    console.log('Migrations complete');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
