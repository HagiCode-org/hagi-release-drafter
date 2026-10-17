import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { withFixtureRepo, withHistory, withPrereleaseFixtureRepo } from './support/fixture.ts';

// Parity: the action's engine (scripts/release-notes.ts, run with GITHUB_REPOSITORY) and the CLI must agree on the same
// repository. The action's version has no trailing newline; the CLI adds one, so it is stripped.
// The CLI runs from its source, and from the built dist/cli.js when a build exists, so both are held to the same rule.
const ENGINE = fileURLToPath(new URL('../scripts/release-notes.ts', import.meta.url));
const CLI = fileURLToPath(new URL('../scripts/cli.ts', import.meta.url));
const BUILT_CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const CLIS = existsSync(BUILT_CLI) ? [CLI, BUILT_CLI] : [CLI];
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
    for (const cli of CLIS) {
      const cliVersion = run(cli, ['version', '--github-repository', IDENTITY], fixture);
      const cliNotes = run(cli, ['notes', '--github-repository', IDENTITY], fixture);

      assert.equal(cliVersion, `${engineVersion}\n`, `${cli}: the version matches once the single trailing newline is ignored`);
      assert.equal(cliNotes, engineNotes, `${cli}: the notes match byte for byte`);
    }
    assert.match(engineNotes, /\(\[`[0-9a-f]{7}`\]\(https:\/\/github\.com\/HagiCode-org\/hagi-release-drafter\/commit\//);
  });
});

test('the CLI and the action engine agree without an identity, producing unlinked short SHAs', () => {
  withFixtureRepo((fixture) => {
    const engineNotes = run(ENGINE, ['notes'], fixture);
    for (const cli of CLIS) {
      assert.equal(run(cli, ['notes'], fixture), engineNotes, cli);
    }
    assert.doesNotMatch(engineNotes, /https:\/\/github\.com/);
  });
});

test('the CLI and the action engine agree on a version override', () => {
  withFixtureRepo((fixture) => {
    const engineVersion = run(ENGINE, ['version'], fixture, { RELEASE_VERSION: '3.0.0' });
    assert.equal(engineVersion, '3.0.0');
    for (const cli of CLIS) {
      assert.equal(run(cli, ['version', '--version', '3.0.0'], fixture), `${engineVersion}\n`, cli);
    }
  });
});

test('the CLI and the action engine agree on a prerelease-only repository, which derives 0.1.1 from its prerelease base', () => {
  withPrereleaseFixtureRepo((fixture) => {
    const engineVersion = run(ENGINE, ['version'], fixture, { GITHUB_REPOSITORY: IDENTITY });
    const engineNotes = run(ENGINE, ['notes'], fixture, { GITHUB_REPOSITORY: IDENTITY });
    assert.equal(engineVersion, '0.1.1');
    for (const cli of CLIS) {
      assert.equal(run(cli, ['version', '--github-repository', IDENTITY], fixture), `${engineVersion}\n`, cli);
      assert.equal(run(cli, ['notes', '--github-repository', IDENTITY], fixture), engineNotes, cli);
    }
    assert.match(engineNotes, /repair parser/, 'the notes include the commits after the prerelease tag');
    assert.doesNotMatch(engineNotes, /first feature/, 'the notes exclude the commit that the prerelease tag marks');
  });
});

test('the CLI and the action engine agree on a repository with no release tag, which keeps 0.1.0', () => {
  withHistory([{ subject: 'feat!: breaking, untagged' }, { subject: 'fix: x' }], (fixture) => {
    const engineVersion = run(ENGINE, ['version'], fixture);
    assert.equal(engineVersion, '0.1.0');
    for (const cli of CLIS) {
      assert.equal(run(cli, ['version'], fixture), `${engineVersion}\n`, cli);
    }
  });
});
