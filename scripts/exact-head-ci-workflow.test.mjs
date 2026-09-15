import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

const workflow = readFileSync(join(repoRoot, ".github/workflows/exact-head-ci.yml"), "utf8");
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7";
const SETUP_NODE = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7";
const UPLOAD_ARTIFACT = "actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6";

test("observable exact-head CI runs on pull requests to main or manual dispatch and can only publish statuses", () => {
  assert.match(workflow, /pull_request:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes("push:"), false);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\s*\n\s*statuses:\s*write/);
  assert.equal(workflow.includes("contents: write"), false);
  assert.equal(workflow.includes("pull-requests: write"), false);
  assert.equal(workflow.includes("git push"), false);
});

test("observable gate executes Node 20/22, dependency audit, and Chromium E2E", () => {
  assert.match(workflow, /matrix:\s*\n\s*node:\s*\[20, 22\]/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
});

test("all third-party actions are immutable approved commits", () => {
  const uses = workflow.split("\n").filter((line) => /^\s*-\s+uses:\s+/.test(line)).map((line) => line.trim().replace(/^-\s*/, ""));
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.ok(
      line === `uses: ${CHECKOUT}` || line === `uses: ${SETUP_NODE}` || line === `uses: ${UPLOAD_ARTIFACT}`,
      `unexpected action reference: ${line}`,
    );
  }
});

test("failed Chromium E2E retains Playwright diagnostics without affecting success semantics", () => {
  const e2eRun = workflow.indexOf("npm run test:e2e");
  const upload = workflow.indexOf(`uses: ${UPLOAD_ARTIFACT}`);
  const publish = workflow.indexOf("publish-status:");
  assert.ok(e2eRun >= 0 && upload > e2eRun && publish > upload);
  const uploadSection = workflow.slice(upload, publish);
  assert.match(uploadSection, /if:\s*failure\(\)/);
  assert.match(uploadSection, /path:\s*test-results\//);
  assert.match(uploadSection, /if-no-files-found:\s*ignore/);
  assert.match(uploadSection, /retention-days:\s*3/);
});

test("machine-readable success is impossible unless every required job succeeds and links to its run", () => {
  assert.match(workflow, /needs:\s*\[check, dependency-audit, e2e\]/);
  assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow, /CHECK_RESULT:\s*\$\{\{ needs\.check\.result \}\}/);
  assert.match(workflow, /AUDIT_RESULT:\s*\$\{\{ needs\.dependency-audit\.result \}\}/);
  assert.match(workflow, /E2E_RESULT:\s*\$\{\{ needs\.e2e\.result \}\}/);
  assert.match(workflow, /RUN_URL:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /if \[ "\$CHECK_RESULT" = success \] && \[ "\$AUDIT_RESULT" = success \] && \[ "\$E2E_RESULT" = success \]/);
  assert.match(workflow, /context="exact-head-ci"/);
  assert.match(workflow, /statuses\/\$\{GITHUB_SHA\}/);
  assert.match(workflow, /target_url="\$RUN_URL"/);
  assert.match(workflow, /test "\$state" = success/);
});
