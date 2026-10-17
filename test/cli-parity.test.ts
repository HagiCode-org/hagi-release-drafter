import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { withFixtureRepo } from './support/fixture.ts';

// Parity: the action's engine (scripts/release-notes.ts, run with GITHUB_REPOSITORY) and the CLI (scripts/cli.ts)
// must agree on the same repository. The action's version has no trailing newline; the CLI adds one, so it is stripped.
const ENGINE = fileURLToPath(new URL('../scripts/release-notes.ts', import.meta.url));
const CLI = fileURLToPath(new URL('../scripts/cli.ts', import.meta.url));
const IDENTITY = 'HagiCode-org/hagi-release-drafter';

function run(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: '', RELEASE_VERSION: '', ...env },
  });
  assert.equal(result.status, 0, `${script} ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

test('the CLI and the action engine agree on the version and the notes bytes for the fixture, with identity', () => {
  withFixtureRepo((fixture) => {
    const engineVersion = run(ENGINE, ['version'], fixture, { GITHUB_REPOSITORY: IDENTITY });
    const engineNotes = run(ENGINE, ['notes'], fixture, { GITHUB_REPOSITORY: IDENTITY });
    const cliVersion = run(CLI, ['version', '--github-repository', IDENTITY], fixture);
    const cliNotes = run(CLI, ['notes', '--github-repository', IDENTITY], fixture);

    assert.equal(cliVersion, `${engineVersion}\n`, 'the version matches once the single trailing newline is ignored');
    assert.equal(cliNotes, engineNotes, 'the notes match byte for byte');
    assert.match(engineNotes, /\(\[`[0-9a-f]{7}`\]\(https:\/\/github\.com\/HagiCode-org\/hagi-release-drafter\/commit\//);
  });
});

test('the CLI and the action engine agree without an identity, producing unlinked short SHAs', () => {
  withFixtureRepo((fixture) => {
    const engineNotes = run(ENGINE, ['notes'], fixture);
    const cliNotes = run(CLI, ['notes'], fixture);
    assert.equal(cliNotes, engineNotes);
    assert.doesNotMatch(engineNotes, /https:\/\/github\.com/);
  });
});

test('the CLI and the action engine agree on a version override', () => {
  withFixtureRepo((fixture) => {
    const engineVersion = run(ENGINE, ['version'], fixture, { RELEASE_VERSION: '3.0.0' });
    const cliVersion = run(CLI, ['version', '--version', '3.0.0'], fixture);
    assert.equal(engineVersion, '3.0.0');
    assert.equal(cliVersion, `${engineVersion}\n`);
  });
});
