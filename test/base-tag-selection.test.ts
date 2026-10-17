import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { readCommits, resolveRelease, selectBaseTag, validateEndTag } from '../scripts/release-notes.ts';
import type { HistoryStep } from './support/fixture.ts';
import { addTagOffHistory, withFixtureRepo, withHistory, withLongHistoryRepo, withPrereleaseFixtureRepo } from './support/fixture.ts';

const chores = (count: number): HistoryStep[] => Array.from({ length: count }, (_, index) => ({ subject: `chore: step ${index + 1}` }));

test('a prerelease-only repository starts its range at the prerelease tag, not the full history', () => {
  withPrereleaseFixtureRepo((dir) => {
    const base = selectBaseTag(dir);
    assert.deepEqual(base, { tag: 'v0.1.0-beta.97', core: '0.1.0', source: 'auto' });
    assert.equal(readCommits(base?.tag, dir).length, 2, 'the candidate range is v0.1.0-beta.97..HEAD, two commits');
  });
});

test('a prerelease base derives 0.1.1 from fix-only commits', () => {
  withPrereleaseFixtureRepo((dir) => {
    const release = resolveRelease({ cwd: dir });
    assert.equal(release.lastTag, 'v0.1.0-beta.97');
    assert.equal(release.lastTagSource, 'auto');
    assert.equal(release.total, 2);
    assert.equal(release.version, '0.1.1');
  });
});

test('a prerelease base derives 0.2.0 from a feature and from a breaking change during 0.x', () => {
  withHistory([
    { subject: 'chore: initial', tag: 'v0.1.0-beta.97' },
    { subject: 'feat: y' },
  ], (dir) => assert.equal(resolveRelease({ cwd: dir }).version, '0.2.0'));
  withHistory([
    { subject: 'chore: initial', tag: 'v0.1.0-beta.97' },
    { subject: 'feat!: y' },
  ], (dir) => assert.equal(resolveRelease({ cwd: dir }).version, '0.2.0'));
});

test('the base is the highest-precedence reachable tag, so beta.100 wins over beta.97', () => {
  withHistory([
    { subject: 'feat: a', tag: 'v0.1.0-beta.97' },
    { subject: 'feat: b', tag: 'v0.1.0-beta.100' },
    { subject: 'fix: c' },
  ], (dir) => {
    assert.equal(selectBaseTag(dir)?.tag, 'v0.1.0-beta.100');
    assert.equal(resolveRelease({ cwd: dir }).total, 1);
  });
});

test('a stable tag ranks above its own prerelease', () => {
  withHistory([
    { subject: 'feat: a', tag: 'v0.1.0-beta.97' },
    { subject: 'feat: b', tag: 'v0.1.0' },
  ], (dir) => assert.equal(selectBaseTag(dir)?.tag, 'v0.1.0'));
});

test('a higher prerelease line wins over an older stable tag', () => {
  withHistory([
    { subject: 'feat: a', tag: 'v1.2.3' },
    { subject: 'feat: b', tag: 'v1.3.0-beta.1' },
  ], (dir) => assert.equal(selectBaseTag(dir)?.tag, 'v1.3.0-beta.1'));
});

test('tags outside the release-tag grammar never become the base', () => {
  withHistory([
    { subject: 'feat: a', tag: 'v1.2.3' },
    { subject: 'feat: b', tag: 'release-2' },
    { subject: 'feat: c', tag: 'v1.3.0-beta.01' },
    { subject: 'feat: d', tag: 'v1.4.0+build.5' },
  ], (dir) => assert.equal(selectBaseTag(dir)?.tag, 'v1.2.3'));
});

test('a repository with no release tag uses the full history and 0.1.0, whatever its commit types', () => {
  withHistory([
    { subject: 'feat!: breaking, but untagged' },
    { subject: 'fix: x' },
  ], (dir) => {
    assert.equal(selectBaseTag(dir), null);
    const release = resolveRelease({ cwd: dir });
    assert.equal(release.lastTag, null);
    assert.equal(release.lastTagSource, 'auto');
    assert.equal(release.total, 2);
    assert.equal(release.version, '0.1.0');
  });
});

test('a pinned tag replaces the automatic choice and reports the pinned source', () => {
  withFixtureRepo((dir) => {
    assert.deepEqual(selectBaseTag(dir, 'v0.1.0-beta.97'), { tag: 'v0.1.0-beta.97', core: '0.1.0', source: 'pinned' });
    const release = resolveRelease({ cwd: dir, startTag: 'v0.1.0-beta.97' });
    assert.equal(release.lastTag, 'v0.1.0-beta.97');
    assert.equal(release.lastTagSource, 'pinned');
    assert.equal(release.total, 5, 'the range is v0.1.0-beta.97..HEAD, which has five commits in the fixture');
  });
});

test('a pin that is not a release tag, does not exist, or is not reachable from HEAD throws and names the tag', () => {
  withFixtureRepo((dir) => {
    assert.throws(() => selectBaseTag(dir, 'release-2'), /Pinned start tag release-2 is not a release tag/);
    assert.throws(() => selectBaseTag(dir, 'v9.9.9-beta.1'), /Pinned start tag v9\.9\.9-beta\.1 does not exist in this repository/);
  });
});

test('a pinned tag that exists on another line of history is not reachable from HEAD', () => {
  withFixtureRepo((dir) => {
    execFileSync('git', ['checkout', '--quiet', '--orphan', 'elsewhere'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'chore: elsewhere'], { cwd: dir });
    execFileSync('git', ['tag', 'v9.0.0-beta.1'], { cwd: dir });
    execFileSync('git', ['checkout', '--quiet', 'main'], { cwd: dir });
    assert.throws(() => selectBaseTag(dir, 'v9.0.0-beta.1'), /Pinned start tag v9\.0\.0-beta\.1 is not reachable from HEAD/);
  });
});

test('the footer compare link accepts a prerelease base after pruning', () => {
  withHistory([{ subject: 'feat: start', tag: 'v0.1.0-beta.97' }, ...chores(101)], (dir) => {
    const release = resolveRelease({ cwd: dir, repository: 'HagiCode-org/hagilight' });
    assert.equal(release.total, 101);
    assert.ok(
      release.notes.endsWith(`_Showing 100 of 101 commits._ [Full changelog](https://github.com/HagiCode-org/hagilight/compare/v0.1.0-beta.97...${release.headSha})\n`),
      release.notes.slice(-200),
    );
  });
});

test('the stable fixture still resolves to the same version and notes through the action entry points', () => {
  withLongHistoryRepo(3, (dir) => {
    const release = resolveRelease({ cwd: dir });
    assert.equal(release.lastTag, 'v1.0.0');
    assert.equal(release.lastTagSource, 'auto');
    assert.equal(release.version, '1.0.1');
  });
});

// Bounded ranges: an end tag replaces HEAD as the end of the range (tasks 1.1 to 1.5).
const BOUNDED: HistoryStep[] = [
  { subject: 'chore: initial commit' },
  { subject: 'feat: first feature', tag: 'v0.1.0-beta.94' },
  { subject: 'fix: beta95 parser' },
  { subject: 'feat: beta95 flag', tag: 'v0.1.0-beta.95' },
  { subject: 'fix: beta96 change', tag: 'v0.1.0-beta.96' },
  { subject: 'fix: after the latest tag' },
];

test('an end tag that is missing or not a release tag is refused, and the error names it', () => {
  withHistory(BOUNDED, (dir) => {
    assert.throws(() => validateEndTag(dir, 'v9.9.9-beta.1'), /End tag v9\.9\.9-beta\.1 does not exist in this repository/);
    assert.throws(() => validateEndTag(dir, 'release-2'), /End tag release-2 is not a release tag/);
    assert.throws(() => resolveRelease({ cwd: dir, endTag: 'v9.9.9-beta.1' }), /End tag v9\.9\.9-beta\.1 does not exist/);
  });
});

test('an end tag outside HEAD history is refused, and the error names it', () => {
  withHistory(BOUNDED, (dir) => {
    addTagOffHistory(dir, 'v9.0.0-beta.1');
    assert.throws(() => validateEndTag(dir, 'v9.0.0-beta.1'), /End tag v9\.0\.0-beta\.1 is not reachable from HEAD/);
  });
});

test('the automatic start below an end tag is the newest release tag under it, and an alias on the end commit is never the start', () => {
  withHistory(BOUNDED, (dir) => {
    assert.deepEqual(selectBaseTag(dir, undefined, 'v0.1.0-beta.95'), { tag: 'v0.1.0-beta.94', core: '0.1.0', source: 'auto' });
    // A stable alias on the end commit ranks above beta.94, so without the exclusion it would leave the range empty.
    execFileSync('git', ['tag', 'v0.1.0', 'v0.1.0-beta.95'], { cwd: dir });
    assert.equal(selectBaseTag(dir, undefined, 'v0.1.0-beta.95')?.tag, 'v0.1.0-beta.94');
    assert.throws(() => selectBaseTag(dir, 'v0.1.0', 'v0.1.0-beta.95'), /Pinned start tag v0\.1\.0 and end tag v0\.1\.0-beta\.95 point at the same commit/);
  });
});

test('a pinned start with an end must be a proper ancestor of that end', () => {
  withHistory(BOUNDED, (dir) => {
    assert.deepEqual(selectBaseTag(dir, 'v0.1.0-beta.94', 'v0.1.0-beta.95'), { tag: 'v0.1.0-beta.94', core: '0.1.0', source: 'pinned' });
    assert.throws(() => selectBaseTag(dir, 'v0.1.0-beta.96', 'v0.1.0-beta.95'), /Pinned start tag v0\.1\.0-beta\.96 is not an ancestor of end tag v0\.1\.0-beta\.95/);
  });
});

test('readCommits reads start..end, the history up to the end without a start, and HEAD when no end is given', () => {
  withHistory(BOUNDED, (dir) => {
    const descriptions = (tag: string | null, end?: string): string[] => readCommits(tag, dir, end).map((commit) => commit.description);
    assert.deepEqual(descriptions('v0.1.0-beta.94', 'v0.1.0-beta.95'), ['beta95 flag', 'beta95 parser']);
    assert.deepEqual(descriptions(null, 'v0.1.0-beta.95'), ['beta95 flag', 'beta95 parser', 'first feature', 'initial commit']);
    assert.deepEqual(descriptions('v0.1.0-beta.94'), ['after the latest tag', 'beta96 change', 'beta95 flag', 'beta95 parser']);
    assert.deepEqual(readCommits('v0.1.0-beta.94', dir, 'HEAD'), readCommits('v0.1.0-beta.94', dir));
  });
});

test('a bounded range takes its version from the end tag core, --version still wins, and an unbounded run keeps the bump', () => {
  withHistory(BOUNDED, (dir) => {
    const bounded = resolveRelease({ cwd: dir, endTag: 'v0.1.0-beta.95' });
    assert.equal(bounded.version, '0.1.0');
    assert.equal(bounded.endTag, 'v0.1.0-beta.95');
    assert.equal(bounded.lastTag, 'v0.1.0-beta.94');
    assert.equal(bounded.total, 2);
    assert.equal(resolveRelease({ cwd: dir, endTag: 'v0.1.0-beta.95', versionOverride: '2.0.0' }).version, '2.0.0');
    const open = resolveRelease({ cwd: dir });
    assert.equal(open.endTag, null);
    assert.equal(open.lastTag, 'v0.1.0-beta.96');
    assert.equal(open.version, '0.1.1', 'one fix after beta.96 keeps the bump policy');
  });
  withHistory([
    { subject: 'chore: initial', tag: 'v1.0.0' },
    { subject: 'feat: x' },
    { subject: 'fix: y', tag: 'v1.2.0' },
    { subject: 'feat: after' },
  ], (dir) => assert.equal(resolveRelease({ cwd: dir, endTag: 'v1.2.0' }).version, '1.2.0'));
});

test('an end tag with no release tag below it covers the history up to the end, with a null last tag', () => {
  withHistory([
    { subject: 'chore: initial commit' },
    { subject: 'feat: first', tag: 'v0.2.0-beta.1' },
    { subject: 'feat: after' },
  ], (dir) => {
    const release = resolveRelease({ cwd: dir, endTag: 'v0.2.0-beta.1' });
    assert.equal(release.lastTag, null);
    assert.equal(release.total, 2);
    assert.equal(release.version, '0.2.0');
  });
});

test('a truncated bounded range links its footer from the start tag to the end tag', () => {
  withHistory([{ subject: 'feat: start', tag: 'v0.1.0-beta.94' }, ...chores(101), { subject: 'fix: end', tag: 'v0.1.0-beta.95' }, ...chores(3)], (dir) => {
    const release = resolveRelease({ cwd: dir, repository: 'HagiCode-org/hagilight', endTag: 'v0.1.0-beta.95' });
    assert.equal(release.total, 102);
    assert.ok(
      release.notes.endsWith('_Showing 100 of 102 commits._ [Full changelog](https://github.com/HagiCode-org/hagilight/compare/v0.1.0-beta.94...v0.1.0-beta.95)\n'),
      release.notes.slice(-200),
    );
  });
});
