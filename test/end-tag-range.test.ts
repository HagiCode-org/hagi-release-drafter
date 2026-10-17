import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { addTagOffHistory, withHistory } from './support/fixture.ts';
import type { HistoryStep } from './support/fixture.ts';

// Every case spawns the real scripts/cli.ts process, as start-tag-pin.test.ts does.
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
  name: string;
  status: string;
  version?: string;
  lastTag?: string | null;
  lastTagSource?: string;
  endTag?: string | null;
  commitCount?: number;
  renderedCount?: number;
  truncated?: boolean;
  notes?: string;
  error?: string;
}

function jsonRows(outcome: Outcome): JsonRow[] {
  return (JSON.parse(outcome.stdout) as { repositories: JsonRow[] }).repositories;
}

const chores = (count: number): HistoryStep[] => Array.from({ length: count }, (_, index) => ({ subject: `chore: step ${index + 1}` }));

// beta.94 starts the range and beta.95 ends it. beta.96 and one later commit follow the end, as in the real history.
const RELEASES: HistoryStep[] = [
  { subject: 'chore: initial commit' },
  { subject: 'feat: first feature', tag: 'v0.1.0-beta.94' },
  { subject: 'fix: beta95 parser' },
  { subject: 'feat: beta95 flag', tag: 'v0.1.0-beta.95' },
  { subject: 'fix: beta96 change', tag: 'v0.1.0-beta.96' },
  { subject: 'fix: after the latest tag' },
];

test('--help lists --end-tag and exits with code 0', () => {
  const outcome = cli(['--help'], process.cwd());
  assert.equal(outcome.status, 0);
  assert.match(outcome.stdout, /--end-tag <input>=<tag>/);
});

test('a start tag and an end tag bound the range to the commits between them', () => {
  withHistory(RELEASES, (dir) => {
    const outcome = cli(['notes', '--format', 'json', '--start-tag', `${dir}=v0.1.0-beta.94`, '--end-tag', `${dir}=v0.1.0-beta.95`, dir], dir);
    assert.equal(outcome.status, 0, outcome.stderr);
    const [row] = jsonRows(outcome);
    assert.equal(row.lastTag, 'v0.1.0-beta.94');
    assert.equal(row.lastTagSource, 'pinned');
    assert.equal(row.endTag, 'v0.1.0-beta.95');
    assert.equal(row.commitCount, 2, 'only the two commits of beta.95 are counted');
    assert.match(String(row.notes), /beta95 parser/);
    assert.match(String(row.notes), /beta95 flag/);
    assert.doesNotMatch(String(row.notes), /beta96 change|after the latest tag/, 'commits after the end tag stay out');
  });
});

test('an end tag alone starts at the newest release tag below it, and the version is the end tag core', () => {
  withHistory(RELEASES, (dir) => {
    const version = cli(['version', '--end-tag', `${dir}=v0.1.0-beta.95`, dir], dir);
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout, '0.1.0\n');

    const notes = cli(['notes', '--format', 'json', '--end-tag', `${dir}=v0.1.0-beta.95`, dir], dir);
    const [row] = jsonRows(notes);
    assert.equal(row.lastTag, 'v0.1.0-beta.94');
    assert.equal(row.lastTagSource, 'auto');
    assert.equal(row.commitCount, 2);
  });
});

test('an end tag applies to one repository of two, and the other keeps its range to HEAD', () => {
  withHistory(RELEASES, (bounded) => withHistory(RELEASES, (open) => {
    const outcome = cli(['notes', '--format', 'json', '--end-tag', `${bounded}=v0.1.0-beta.95`, bounded, open], bounded);
    assert.equal(outcome.status, 0, outcome.stderr);
    const [ended, unbounded] = jsonRows(outcome);
    assert.equal(ended.endTag, 'v0.1.0-beta.95');
    assert.equal(ended.commitCount, 2);
    assert.equal(unbounded.endTag, null);
    assert.equal(unbounded.lastTag, 'v0.1.0-beta.96');
    assert.equal(unbounded.commitCount, 1);
  }));
});

test('a missing end tag fails only its repository with exit code 1, and the other row matches the run without the bound', () => {
  withHistory(RELEASES, (broken) => withHistory(RELEASES, (open) => {
    const bounded = cli(['notes', '--format', 'json', '--end-tag', `${broken}=v9.9.9-beta.1`, broken, open], broken);
    assert.equal(bounded.status, 1);
    assert.match(bounded.stderr, /End tag v9\.9\.9-beta\.1 does not exist in this repository/);
    const [failed, ok] = jsonRows(bounded);
    assert.equal(failed.status, 'failed');
    assert.match(String(failed.error), /End tag v9\.9\.9-beta\.1 does not exist in this repository/);

    const unbounded = cli(['notes', '--format', 'json', broken, open], broken);
    const [, baseline] = jsonRows(unbounded);
    assert.deepEqual(ok, baseline, 'the other repository is identical to the run without the bound');
  }));
});

test('an end tag outside HEAD history fails its repository with exit code 1, and the reason names the tag', () => {
  withHistory(RELEASES, (dir) => {
    addTagOffHistory(dir, 'v9.0.0-beta.1');
    const outcome = cli(['notes', '--end-tag', `${dir}=v9.0.0-beta.1`, dir], dir);
    assert.equal(outcome.status, 1);
    assert.equal(outcome.stdout, '');
    assert.match(outcome.stderr, /End tag v9\.0\.0-beta\.1 is not reachable from HEAD/);
  });
});

test('a start tag that is not before the end fails its repository with exit code 1, and the reason names both tags', () => {
  withHistory(RELEASES, (dir) => {
    const reversed = cli(['notes', '--start-tag', `${dir}=v0.1.0-beta.96`, '--end-tag', `${dir}=v0.1.0-beta.95`, dir], dir);
    assert.equal(reversed.status, 1);
    assert.equal(reversed.stdout, '');
    assert.match(reversed.stderr, /Pinned start tag v0\.1\.0-beta\.96 is not an ancestor of end tag v0\.1\.0-beta\.95/);

    const equal = cli(['notes', '--start-tag', `${dir}=v0.1.0-beta.95`, '--end-tag', `${dir}=v0.1.0-beta.95`, dir], dir);
    assert.equal(equal.status, 1);
    assert.match(equal.stderr, /Pinned start tag v0\.1\.0-beta\.95 and end tag v0\.1\.0-beta\.95 point at the same commit/);
  });
});

test('a start and an end on the same input resolve start..end, and each one is confined to its own repository', () => {
  withHistory(RELEASES, (a) => withHistory(RELEASES, (b) => {
    const pinnedOnly = cli(['notes', '--format', 'json', '--start-tag', `${a}=v0.1.0-beta.94`, a, b], a);
    const endedOnly = cli(['notes', '--format', 'json', '--end-tag', `${b}=v0.1.0-beta.95`, a, b], a);
    const combined = cli(['notes', '--format', 'json', '--start-tag', `${a}=v0.1.0-beta.94`, '--end-tag', `${b}=v0.1.0-beta.95`, a, b], a);
    assert.equal(combined.status, 0, combined.stderr);
    const [aCombined, bCombined] = jsonRows(combined);
    const [aPinned] = jsonRows(pinnedOnly);
    const [, bEnded] = jsonRows(endedOnly);

    assert.deepEqual(aCombined, aPinned, 'a pinned start with another repository\'s end leaves that repository as it was');
    assert.equal(aCombined.endTag, null);
    assert.deepEqual(bCombined, bEnded, 'an end with another repository\'s pinned start leaves that repository as it was');
    assert.equal(bCombined.lastTag, 'v0.1.0-beta.94');
    assert.equal(bCombined.lastTagSource, 'auto');

    const sameInput = cli(['notes', '--format', 'json', '--start-tag', `${a}=v0.1.0-beta.94`, '--end-tag', `${a}=v0.1.0-beta.95`, a], a);
    const [row] = jsonRows(sameInput);
    assert.equal(row.lastTagSource, 'pinned');
    assert.equal(row.lastTag, 'v0.1.0-beta.94');
    assert.equal(row.endTag, 'v0.1.0-beta.95');
    assert.equal(row.commitCount, 2, 'start..end on one input counts only its own commits');
  }));
});

test('a malformed, duplicate, or unknown --end-tag exits with code 2 and empty stdout, before any repository is read', () => {
  withHistory(RELEASES, (dir) => {
    const cases: Array<[string[], RegExp]> = [
      [['notes', '--end-tag', dir], /--end-tag must be <input>=<tag>/],
      [['notes', '--end-tag', `${dir}=release-2`], /--end-tag .*: release-2 is not a release tag/],
      [['notes', '--end-tag', `${dir}=`], /is not a release tag/],
      [['notes', '--end-tag', `${dir}=v0.1.0-beta.94`, '--end-tag', `${dir}=v0.1.0-beta.95`, dir], /--end-tag names .* more than once/],
      [['notes', '--end-tag', `desktop=v0.1.0-beta.95`, dir], /desktop is not a repository input/],
    ];
    for (const [args, message] of cases) {
      const outcome = cli(args, dir);
      assert.equal(outcome.status, 2, `exit code for ${args.join(' ')}: ${outcome.stderr}`);
      assert.equal(outcome.stdout, '', `stdout for ${args.join(' ')}`);
      assert.match(outcome.stderr, message);
    }
  });
});

test('a truncated bounded repository links its footer to the end tag, and the summary table keeps its columns', () => {
  withHistory([{ subject: 'feat: start', tag: 'v0.1.0-beta.94' }, ...chores(101), { subject: 'fix: end', tag: 'v0.1.0-beta.95' }, ...chores(3)], (bounded) => withHistory(RELEASES, (open) => {
    const outcome = cli(['notes', '--github-repository', 'HagiCode-org/hagilight', '--end-tag', `${bounded}=v0.1.0-beta.95`, bounded, open], bounded);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.match(outcome.stdout, /\| Repository \| Status \| Version \| Last tag \| Commits \| Rendered \|/, 'the table keeps its six columns');
    assert.match(outcome.stdout, /\| HagiCode-org\/hagilight \| ok \| 0\.1\.0 \| v0\.1\.0-beta\.94 \| 102 \| 100 \|/);
    assert.match(outcome.stdout, /_Showing 100 of 102 commits\._ \[Full changelog\]\(https:\/\/github\.com\/HagiCode-org\/hagilight\/compare\/v0\.1\.0-beta\.94\.\.\.v0\.1\.0-beta\.95\)/);
  }));
});
