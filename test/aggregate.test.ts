import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertNoDuplicates, renderMerged, renderPerRepo, runRepositories } from '../scripts/lib/aggregate.ts';
import type { FailedRow, OkRow } from '../scripts/lib/aggregate.ts';
import { classifyInput, UsageError } from '../scripts/lib/repo-input.ts';
import type { RepositoryInput } from '../scripts/lib/repo-input.ts';
import { withFixtureRepo, withLongHistoryRepo, withShallowClone } from './support/fixture.ts';

const local = (path: string): RepositoryInput => classifyInput(path, '/');
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });
const GOLDEN_PER_REPO = new URL('./golden/per-repo.md', import.meta.url);
const HELLO_URL = 'https://github.com/HagiCode-org/hagi-release-drafter';

test('one healthy repository and one shallow clone give an ok row and a failed row, in input order', () => {
  withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
    const rows = runRepositories([local(fixture), local(shallow)]);
    assert.deepEqual(rows.map((row) => row.input), [fixture, shallow]);

    const ok = rows[0] as OkRow;
    assert.equal(ok.status, 'ok');
    assert.equal(ok.release.version, '2.0.0');
    assert.equal(ok.release.total, 4);

    const failed = rows[1] as FailedRow;
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /fetch-depth: 0/);
    assert.match(failed.error, /fetch-tags: true/);
  }));
});

test('fail-fast stops at the first failure, so a later URL input is never cloned', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'hagi-failfast-'));
  try {
    withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
      const rows = runRepositories([local(shallow), classifyInput(HELLO_URL, '/')], { failFast: true, cacheDir });
      assert.equal(rows.length, 1, 'the later input must not produce a row');
      assert.equal(rows[0].status, 'failed');
      assert.equal(existsSync(join(cacheDir, 'repos', 'HagiCode-org', 'hagi-release-drafter')), false, 'the later URL must not be cloned');
    }));
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('a duplicate input is a usage error that names the duplicate', () => {
  withFixtureRepo((fixture) => {
    assert.throws(() => assertNoDuplicates([local(fixture), local(`${fixture}/`)]), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, /Duplicate repository input/);
      return true;
    });
  });
});

test('--version with several inputs is a usage error', () => {
  withFixtureRepo((first) => withFixtureRepo((second) => {
    assert.throws(
      () => runRepositories([local(first), local(second)], { versionOverride: '2.0.0' }),
      (error: unknown) => error instanceof UsageError && /applies to one repository only/.test(error.message),
    );
  }));
});

test('--github-repository must be owner/name', () => {
  withFixtureRepo((fixture) => {
    assert.throws(() => runRepositories([local(fixture)], { githubRepository: 'not-a-slug' }), UsageError);
  });
});

test('the per-repo layout matches the golden file: an ok row, a failed row, and a pruned commit-count footer', () => {
  withFixtureRepo((healthy) => withShallowClone(healthy, (shallow) => withLongHistoryRepo(101, (long) => {
    git(healthy, 'remote', 'add', 'origin', 'https://github.com/HagiCode-org/hagi-release-drafter.git');
    const markdown = renderPerRepo(runRepositories([local(healthy), local(shallow), local(long)]));
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN_PER_REPO, markdown);
    assert.equal(markdown, readFileSync(GOLDEN_PER_REPO, 'utf8'));
    assert.equal(renderPerRepo(runRepositories([local(healthy), local(shallow), local(long)])), markdown, 'repeated runs are byte-identical');
  })));
});

test('the merged layout shares sections, labels each entry, keeps input order, and prunes each repository', () => {
  withFixtureRepo((first) => withFixtureRepo((second) => withLongHistoryRepo(101, (long) => {
    git(first, 'remote', 'add', 'origin', 'https://github.com/HagiCode-org/hagi-release-drafter.git');
    git(second, 'remote', 'add', 'origin', 'https://github.com/HagiCode-org/other.git');
    const markdown = renderMerged(runRepositories([local(first), local(second), local(long)]));
    const lines = markdown.split('\n');

    assert.equal(lines.filter((line) => line === '### Fixes').length, 1, 'one shared Fixes section');
    const fixes = lines.filter((line) => line.includes('repair parser'));
    assert.equal(fixes.length, 2);
    assert.match(fixes[0], /^- \*\*HagiCode-org\/hagi-release-drafter:\*\* \*\*core:\*\* repair parser/);
    assert.match(fixes[1], /^- \*\*HagiCode-org\/other:\*\* \*\*core:\*\* repair parser/);

    const order = ['### Breaking Changes', '### Features', '### Fixes', '### Documentation', '### Maintenance'].map((heading) => markdown.indexOf(heading));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sections follow the single-repository display order');

    assert.equal(lines.filter((line) => line.startsWith('- **long:** ')).length, 100, 'the 101-commit repository contributes at most 100 entries');
    assert.ok(markdown.includes('_long: Showing 100 of 101 commits._'), 'the pruned repository has a labelled footer');
  })));
});

test('the merged layout reports a failed repository in place of its entries', () => {
  withFixtureRepo((healthy) => withShallowClone(healthy, (shallow) => {
    const markdown = renderMerged(runRepositories([local(healthy), local(shallow)]));
    assert.match(markdown, /\*\*Failed:\*\*\n\n- \*\*shallow:\*\* This checkout is shallow/);
    assert.match(markdown, /\| shallow \| failed \| \| \| \|/);
  }));
});
