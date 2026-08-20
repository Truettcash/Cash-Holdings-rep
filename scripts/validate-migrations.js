#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function fail(message) {
  console.error('Migration validation failed:', message);
  process.exit(1);
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail(`Migrations directory not found: ${MIGRATIONS_DIR}`);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql'));
if (files.length === 0) {
  fail('No .sql migration files found in supabase/migrations/');
}

const allowedPatterns = [
  /^[0-9]{14}_[A-Za-z0-9-]+\.sql$/,
  /^[0-9]{8}_[0-9]{3}_[A-Za-z0-9._-]+\.sql$/,
];

const seenNames = new Set();
for (const file of files) {
  if (seenNames.has(file)) {
    fail(`Duplicate migration filename: ${file}`);
  }
  seenNames.add(file);

  if (!allowedPatterns.some((pattern) => pattern.test(file))) {
    fail(
      `Invalid migration filename: ${file}. Expected Supabase timestamp_uuid.sql or YYYYMMDD_NNN_description.sql.`,
    );
  }
}

const sorted = [...files].sort();
for (let index = 0; index < files.length; index += 1) {
  if (files[index] !== sorted[index]) {
    console.warn('Migration files are not in sorted order; expected execution order is:');
    console.warn(sorted.join('\n'));
    break;
  }
}

for (const file of sorted) {
  const target = path.join(MIGRATIONS_DIR, file);
  try {
    const stat = fs.statSync(target);
    if (stat.size === 0) {
      fail(`Empty migration file: ${file}`);
    }
    fs.readFileSync(target, 'utf8');
  } catch (error) {
    fail(`Cannot read migration file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Migration files validated — execution order:');
sorted.forEach((file, index) => console.log(`${index + 1}. ${file}`));