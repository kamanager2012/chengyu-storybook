#!/usr/bin/env node

/**
 * Reports the intended CI boundary.
 * Keep fast developer verification separate from release-only gates.
 */

const boundaries = {
  fast: [
    "typecheck",
    "lint",
    "tests",
    "build"
  ],
  release: [
    "content provenance",
    "narration validation",
    "media audit",
    "dependency audit",
    "browser e2e"
  ]
};

console.log(JSON.stringify(boundaries, null, 2));
