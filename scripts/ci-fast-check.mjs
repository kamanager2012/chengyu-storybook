#!/usr/bin/env node

/**
 * Fast developer verification entry point.
 *
 * Keep this intentionally smaller than the release gate. The goal is to give
 * local development a quick signal without running production provenance and
 * media audits every time.
 */

import { spawnSync } from 'node:child_process';

const steps = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'lint', '--', '--max-warnings=0']],
  ['npm', ['test']],
  ['npm', ['run', 'build']],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
