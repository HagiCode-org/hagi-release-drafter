import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpVersion, groupCommits, parseCommit, pruneCommits, renderNotes, tierOf } from '../scripts/release-notes.mjs';

const sha = (n) => String(n).repeat(40);
const commit = (subject, body = '', n = 1) => parseCommit({ sha: sha(n), subject, body });
/** Candidates in newest-first order: index 0 is the newest commit. */
const candidates = (count, subjectAt) => Array.from({ length: count }, (_, index) => commit(subjectAt(index), '', index + 1));
const shas = (commits) => commits.map((entry) => entry.sha);

test('parses Conventional Commit headers, scopes, and breaking markers', () => {
  assert.deepEqual(commit('feat(core): add links'), {
    sha: sha(1), type: 'feat', scope: 'core', description: 'add links', breaking: false,
  });
  assert.equal(commit('fix!: drop option').breaking, true);
  assert.equal(commit('refactor(core): tidy', 'BREAKING CHANGE: renamed export').breaking, true);
  assert.equal(commit('Update readme').type, null);
  assert.equal(commit('feat:missing space').type, null);
});

test('groups commits by section in display order and omits empty sections', () => {
  const commits = [
    commit('ci: run on node 24', '', 1),
    commit('feat(core): a', '', 2),
    commit('Tweak things', '', 3),
    commit('fix(core)!: b', '', 4),
    commit('docs: c', '', 5),
  ];
  assert.deepEqual(groupCommits(commits).map(({ title }) => title), [
    'Breaking Changes', 'Features', 'Documentation', 'Maintenance', 'Other Changes',
  ]);
});

test('bumps patch, minor for features, and minor or major for breaking changes', () => {
  assert.equal(bumpVersion('0.9.8', [commit('fix: x'), commit('docs: y')]), '0.9.9');
  assert.equal(bumpVersion('0.9.8', [commit('fix: x'), commit('feat: y')]), '0.10.0');
  assert.equal(bumpVersion('0.9.8', [commit('feat!: y')]), '0.10.0');
  assert.equal(bumpVersion('1.2.3', [commit('feat: y'), commit('fix!: z')]), '2.0.0');
});

test('handles a range without commits', () => {
  assert.equal(bumpVersion('0.9.8', []), '0.9.9');
  assert.equal(renderNotes([]), '## Changes\n\n_No changes yet._\n');
});

test('renders scoped entries with commit links', () => {
  const body = renderNotes([commit('feat(core): add links', '', 1), commit('Tweak things', '', 2)], 'HagiCode-org/hagilight');
  assert.equal(body, [
    '## Changes',
    '',
    '### Features',
    '',
    `- **core:** add links ([\`1111111\`](https://github.com/HagiCode-org/hagilight/commit/${sha(1)}))`,
    '',
    '### Other Changes',
    '',
    `- Tweak things ([\`2222222\`](https://github.com/HagiCode-org/hagilight/commit/${sha(2)}))`,
    '',
  ].join('\n'));
});

test('assigns priority tiers by first matching rule', () => {
  const tier = (subject, body = '') => tierOf(commit(subject, body));
  assert.equal(tier('feat!: drop option'), 1);
  assert.equal(tier('chore!: drop option'), 1);
  assert.equal(tier('refactor(core): x', 'BREAKING CHANGE: y'), 1);
  assert.equal(tier('feat(core): add links'), 1);
  assert.equal(tier('fix(security): patch token check'), 2);
  assert.equal(tier('perf: faster'), 2);
  assert.equal(tier('chore(Security): rotate key'), 3);
  assert.equal(tier('revert: undo x'), 3);
  assert.equal(tier('refactor: tidy'), 3);
  assert.equal(tier('build: x'), 4);
  assert.equal(tier('docs(core): x'), 4);
  assert.equal(tier('Update readme'), 4);
});

test('keeps every candidate up to the ceiling', () => {
  const hundred = candidates(100, () => 'chore: x');
  assert.equal(pruneCommits(hundred).omitted.length, 0);
  assert.equal(pruneCommits(hundred).kept.length, 100);
});

test('omits exactly one commit at 101 candidates and keeps exactly 100 at 250', () => {
  const one = pruneCommits(candidates(101, () => 'chore: x'));
  assert.equal(one.kept.length, 100);
  assert.equal(one.omitted.length, 1);
  const many = pruneCommits(candidates(250, () => 'chore: x'));
  assert.equal(many.kept.length, 100);
  assert.equal(many.omitted.length, 150);
});

test('omits Tier 4 before Tier 3 and keeps kept commits in input order', () => {
  const list = candidates(101, (index) => (index === 0 ? 'chore: newest' : 'refactor: r'));
  const { kept, omitted } = pruneCommits(list);
  assert.deepEqual(omitted.map((entry) => entry.description), ['newest']);
  assert.deepEqual(shas(kept), shas(list.slice(1)));

  const middle = candidates(101, (index) => (index === 50 ? 'docs: d' : 'fix: f'));
  const pruned = pruneCommits(middle);
  assert.deepEqual(pruned.omitted.map((entry) => entry.description), ['d']);
  assert.deepEqual(shas(pruned.kept), shas(middle.filter((_, index) => index !== 50)));
});

test('omits unscoped before scoped, and older before newer within the same scope status', () => {
  const scopedOverUnscoped = candidates(101, (index) => {
    if (index === 0) return 'fix: unscoped newest';
    return index === 100 ? 'fix(core): scoped oldest' : 'fix(core): scoped';
  });
  assert.deepEqual(pruneCommits(scopedOverUnscoped).omitted.map((entry) => entry.description), ['unscoped newest']);

  const olderFirst = candidates(101, (index) => `fix: f${index}`);
  assert.deepEqual(pruneCommits(olderFirst).omitted.map((entry) => entry.description), ['f100']);
});

test('keeps 100 of 120 features, omitting the oldest unscoped ones', () => {
  const features = candidates(120, (index) => (index % 6 === 0 ? `feat: u${index}` : `feat(core): s${index}`));
  const { kept, omitted } = pruneCommits(features);
  assert.equal(kept.length, 100);
  assert.equal(omitted.length, 20);
  assert.ok(omitted.every((entry) => entry.scope === null));

  const oldestUnscoped = candidates(101, (index) => (index === 3 || index === 50 ? `feat: u${index}` : `feat(core): s${index}`));
  assert.deepEqual(pruneCommits(oldestUnscoped).omitted.map((entry) => entry.description), ['u50']);
});

test('keeps all breaking changes when 10 of 110 Tier 1 commits are breaking', () => {
  const list = candidates(110, (index) => (index >= 100 ? 'feat!: breaking' : 'feat: f'));
  const { kept, omitted } = pruneCommits(list);
  assert.equal(omitted.length, 10);
  assert.ok(omitted.every((entry) => !entry.breaking));
  assert.equal(kept.filter((entry) => entry.breaking).length, 10);
});

test('version derivation reads every candidate, including ones pruning omits', () => {
  const list = candidates(101, () => 'feat: f');
  const { kept, omitted } = pruneCommits(list);
  assert.equal(omitted.length, 1);
  assert.equal(bumpVersion('0.9.8', list), '0.10.0');
  assert.equal(bumpVersion('0.9.8', list), bumpVersion('0.9.8', kept));
});

test('footer links the compare view when a stable tag is the base', () => {
  const body = renderNotes([commit('feat: a', '', 1)], 'HagiCode-org/hagilight', { total: 2, lastTag: 'v1.2.3', headSha: 'abc1234' });
  assert.equal(body, [
    '## Changes',
    '',
    '### Features',
    '',
    `- a ([\`1111111\`](https://github.com/HagiCode-org/hagilight/commit/${sha(1)}))`,
    '',
    '_Showing 1 of 2 commits._ [Full changelog](https://github.com/HagiCode-org/hagilight/compare/v1.2.3...abc1234)',
    '',
  ].join('\n'));
});

test('footer links the commit list when no stable tag exists', () => {
  const body = renderNotes([commit('feat: a', '', 1)], 'HagiCode-org/hagilight', { total: 2, lastTag: null, headSha: 'abc1234' });
  assert.ok(body.endsWith('_Showing 1 of 2 commits._ [Full changelog](https://github.com/HagiCode-org/hagilight/commits/abc1234)\n'));
});

test('footer is plain text without a repository', () => {
  const body = renderNotes([commit('feat: a', '', 1)], undefined, { total: 2, lastTag: 'v1.2.3', headSha: 'abc1234' });
  assert.ok(body.endsWith('\n_Showing 1 of 2 commits._\n'));
  assert.ok(!body.includes('http'));
});

test('no footer when exactly 100 candidates are rendered', () => {
  const body = renderNotes(candidates(100, () => 'chore: x'), 'HagiCode-org/hagilight', { total: 100, lastTag: 'v1.2.3', headSha: 'abc1234' });
  assert.ok(!body.includes('Showing'));
});
