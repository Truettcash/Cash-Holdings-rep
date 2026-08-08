#!/usr/bin/env node
const { spawnSync } = require('child_process');
const pkg = require('../package.json');

function runIfExists(script) {
  if (pkg.scripts && pkg.scripts[script]) {
    console.log(`Running npm run ${script}`);
    const r = spawnSync('npm', ['run', script], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status);
  } else {
    console.log(`Skipping ${script} (not defined)`);
  }
}

// Run checks in order: typecheck, test, build, db:validate
runIfExists('typecheck');
runIfExists('test');
runIfExists('build');
runIfExists('db:validate');

console.log('Repository checks completed successfully');
