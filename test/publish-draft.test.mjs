import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs scripts/publish-draft.sh inside a throwaway repository with a stub `gh` first on PATH.
// The stub records every call, so the tests never touch the network.

const SCRIPT = resolve(fileURLToPath(new URL('../scripts/publish-draft.sh', import.meta.url)));
const REPOSITORY = 'HagiCode-org/hagilight';
const ARG_SEPARATOR = '\x1f';

const STUB_GH = `#!/usr/bin/env bash
{
  for arg in "$@"; do printf '%s\\x1f' "$arg"; done
  printf '\\n'
} >> "$STUB_GH_LOG"
case "$1 $2" in
  "api "*) printf '%s' "\${STUB_GH_DRAFTS:-}" ;;
  "release view") echo "https://github.com/$GH_REPO/releases/tag/$3" ;;
esac
exit 0
`;

let workdir;
let stubDir;
let logFile;
let outputFile;
let summaryFile;
let notesFile;
let sha;

function git(args) {
  const result = spawnSync('git', args, { cwd: workdir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'publish-draft-'));
  stubDir = join(workdir, 'bin');
  mkdirSync(stubDir);
  writeFileSync(join(stubDir, 'gh'), STUB_GH);
  chmodSync(join(stubDir, 'gh'), 0o755);

  git(['init', '--quiet']);
  git(['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'feat: init']);
  sha = git(['rev-parse', 'HEAD']);

  logFile = join(workdir, 'gh.log');
  outputFile = join(workdir, 'github-output');
  summaryFile = join(workdir, 'step-summary');
  notesFile = join(workdir, 'release-notes.md');
  writeFileSync(notesFile, '## Changes\n');
  writeFileSync(outputFile, '');
  writeFileSync(summaryFile, '');
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function run({ version = '1.4.0', titleTemplate = 'v{version}', drafts = '' } = {}) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: workdir,
    encoding: 'utf8',
    env: {
      PATH: `${stubDir}:${process.env.PATH}`,
      STUB_GH_LOG: logFile,
      STUB_GH_DRAFTS: drafts,
      VERSION: version,
      TITLE_TEMPLATE: titleTemplate,
      NOTES_FILE: notesFile,
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
    },
  });
  return result;
}

function calls() {
  let text = '';
  try {
    text = readFileSync(logFile, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').filter(Boolean).map((line) => line.split(ARG_SEPARATOR).slice(0, -1));
}

test('creates a draft at the checked-out SHA when no draft exists', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls().filter((args) => args[0] === 'release' && args[1] === 'create'), [
    ['release', 'create', 'v1.4.0', '--draft', '--title', 'v1.4.0', '--notes-file', notesFile, '--target', sha],
  ]);
  assert.equal(calls().some((args) => args[1] === 'edit'), false);
});

test('updates the existing draft instead of creating a second one', () => {
  const result = run({ drafts: 'v1.3.0' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls().filter((args) => args[0] === 'release' && args[1] === 'edit'), [
    ['release', 'edit', 'v1.3.0', '--tag', 'v1.4.0', '--title', 'v1.4.0', '--notes-file', notesFile, '--target', sha],
  ]);
  assert.equal(calls().some((args) => args[0] === 'release' && args[1] === 'create'), false);
});

test('edits the first draft when several drafts exist', () => {
  const result = run({ drafts: 'v1.3.0\nv1.2.0' });
  assert.equal(result.status, 0, result.stderr);
  const edits = calls().filter((args) => args[1] === 'edit');
  assert.equal(edits.length, 1);
  assert.equal(edits[0][2], 'v1.3.0');
});

test('looks up drafts through the paginated releases endpoint', () => {
  run();
  const lookup = calls().find((args) => args[0] === 'api');
  assert.ok(lookup, 'expected a gh api lookup');
  assert.ok(lookup.includes('--paginate'));
  assert.ok(lookup.includes(`repos/${REPOSITORY}/releases`));
});

test('renders the title from a custom template', () => {
  const result = run({ titleTemplate: 'Hagilight v{version}' });
  assert.equal(result.status, 0, result.stderr);
  const create = calls().find((args) => args[1] === 'create');
  assert.equal(create[create.indexOf('--title') + 1], 'Hagilight v1.4.0');
});

test('uses the release URL read back from GitHub and writes outputs and a summary', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(outputFile, 'utf8');
  assert.match(output, /^tag=v1\.4\.0$/m);
  assert.match(output, /^release-url=https:\/\/github\.com\/HagiCode-org\/hagilight\/releases\/tag\/v1\.4\.0$/m);
  assert.match(readFileSync(summaryFile, 'utf8'), /Draft release v1\.4\.0/);
  assert.ok(calls().some((args) => args[1] === 'view' && args.includes('--json') && args.includes('url')));
});

test('never publishes: no call sets the draft flag to false or passes --latest', () => {
  run({ drafts: 'v1.3.0' });
  const allArgs = calls().flat();
  assert.equal(allArgs.some((arg) => arg === '--draft=false'), false);
  assert.equal(allArgs.includes('--latest'), false);
  assert.equal(calls().some((args) => args[1] === 'edit' && args.includes('--draft')), false);
});

test('fails without calling gh when a required variable is missing', () => {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: workdir,
    encoding: 'utf8',
    env: { PATH: `${stubDir}:${process.env.PATH}`, STUB_GH_LOG: logFile },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VERSION is required/);
  assert.deepEqual(calls(), []);
});
