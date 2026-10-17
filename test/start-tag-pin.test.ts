import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { withFixtureRepo, withLongHistoryRepo } from './support/fixture.ts';

// Every case spawns the real scripts/cli.ts process, as cli.test.ts does.
const CLI = fileURLToPath(new URL('../scripts/cli.ts', import.meta.url));

interface Outcome {
  status: number | null;
  stdout: string;
  stderr: string;
}

function cli(args: string[], cwd: string): Outcome {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

interface JsonRow {
  input: string;
  status: string;
  version?: string;
  lastTag?: string | null;
  lastTagSource?: string;
  commitCount?: number;
  renderedCount?: number;
  truncated?: boolean;
  notes?: string;
  error?: string;
}

function jsonRows(outcome: Outcome): JsonRow[] {
  return (JSON.parse(outcome.stdout) as { repositories: JsonRow[] }).repositories;
}

/**
 * A fixture whose `tag` sits on a commit that is not an ancestor of `main`: it exists in the repository but cannot be
 * reached from HEAD. Built on a separate root commit, then `main` is checked out again.
 */
function withUnreachableTag<T>(tag: string, use: (dir: string) => T): T {
  return withFixtureRepo((dir) => {
    const git = (...args: string[]): void => {
      execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: dir, stdio: 'ignore' });
    };
    git('checkout', '--quiet', '--orphan', 'elsewhere');
    git('commit', '--quiet', '--allow-empty', '-m', 'chore: elsewhere');
    git('tag', tag);
    git('checkout', '--quiet', 'main');
    return use(dir);
  });
}

test('a malformed, non-release, duplicate, or unknown pin exits with code 2 before any repository is processed', () => {
  withFixtureRepo((fixture) => {
    const cases: Array<[string[], RegExp]> = [
      [['notes', '--start-tag', fixture], /must be <input>=<tag>/],
      [['notes', '--start-tag', `${fixture}=v1.0.0-beta.01`], /is not a release tag/],
      [['notes', '--start-tag', `${fixture}=release-2`], /is not a release tag/],
      [['notes', '--start-tag', `${fixture}=`], /is not a release tag/],
      [['notes', '--start-tag', `${fixture}=v0.1.0-beta.97`, '--start-tag', `${fixture}=v1.0.0`, fixture], /names .* more than once/],
      [['notes', '--start-tag', 'desktop=v0.1.0-beta.97', fixture], /desktop is not a repository input/],
    ];
    for (const [args, message] of cases) {
      const outcome = cli(args, fixture);
      assert.equal(outcome.status, 2, `exit code for ${args.join(' ')}: ${outcome.stderr}`);
      assert.equal(outcome.stdout, '', `stdout for ${args.join(' ')}`);
      assert.match(outcome.stderr, message);
    }
  });
});

test('a pin for a path given exactly as written matches, and the pinned range is the tag to HEAD', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['notes', '--format', 'json', '--start-tag', `${fixture}=v0.1.0-beta.97`, fixture], fixture);
    assert.equal(outcome.status, 0, outcome.stderr);
    const [row] = jsonRows(outcome);
    assert.equal(row.status, 'ok');
    assert.equal(row.lastTag, 'v0.1.0-beta.97');
    assert.equal(row.lastTagSource, 'pinned');
    assert.equal(row.commitCount, 5, 'the range v0.1.0-beta.97..HEAD holds five commits');
    assert.equal(row.version, '0.2.0', 'a breaking change during 0.x bumps the minor from the core 0.1.0');
  });
});

test('a pin that is not reachable from HEAD fails only its repository, and the other row keeps its output', () => {
  withUnreachableTag('v9.0.0-beta.1', (broken) => withLongHistoryRepo(101, (long) => {
    const pinned = cli(['notes', '--format', 'json', '--start-tag', `${broken}=v9.0.0-beta.1`, broken, long], broken);
    assert.equal(pinned.status, 1, 'a failed repository exits with code 1');
    const [failed, ok] = jsonRows(pinned);
    assert.equal(failed.status, 'failed');
    assert.match(String(failed.error), /Pinned start tag v9\.0\.0-beta\.1 is not reachable from HEAD/);
    assert.equal(ok.status, 'ok');

    const unpinned = cli(['notes', '--format', 'json', broken, long], broken);
    const [, baseline] = jsonRows(unpinned);
    assert.equal(ok.notes, baseline.notes, 'the other repository\'s notes are byte-identical to the run without the pin');
    assert.equal(ok.commitCount, baseline.commitCount);
    assert.equal(ok.version, baseline.version);
  }));
});

test('a pin for a tag that does not exist fails its repository with a reason that names the tag', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['version', '--start-tag', `${fixture}=v9.9.9-beta.1`, fixture], fixture);
    assert.equal(outcome.status, 1);
    assert.match(outcome.stderr, /Pinned start tag v9\.9\.9-beta\.1 does not exist in this repository/);
  });
});

test('a mixed run reports lastTagSource as pinned for the pinned repository and auto for the other, in JSON and in the Last tag column', () => {
  withFixtureRepo((pinnedRepo) => withLongHistoryRepo(3, (autoRepo) => {
    const json = cli(['version', '--format', 'json', '--start-tag', `${pinnedRepo}=v0.1.0-beta.97`, pinnedRepo, autoRepo], pinnedRepo);
    assert.equal(json.status, 0, json.stderr);
    const [pinned, auto] = jsonRows(json);
    assert.equal(pinned.lastTagSource, 'pinned');
    assert.equal(pinned.lastTag, 'v0.1.0-beta.97');
    assert.equal(auto.lastTagSource, 'auto');
    assert.equal(auto.lastTag, 'v1.0.0');

    const table = cli(['version', '--start-tag', `${pinnedRepo}=v0.1.0-beta.97`, pinnedRepo, autoRepo], pinnedRepo);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /\| repo \| ok \| 0\.2\.0 \| v0\.1\.0-beta\.97 \| 5 \| 5 \|/, 'the pinned tag is shown in the Last tag column');
  }));
});
