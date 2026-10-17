import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMerged, renderSummary, runRepositories, toJson } from '../scripts/lib/aggregate.ts';
import { classifyInput } from '../scripts/lib/repo-input.ts';
import type { RepositoryInput } from '../scripts/lib/repo-input.ts';
import { resolveRelease } from '../scripts/release-notes.ts';
import { withBulkHistory, withLongHistoryRepo } from './support/fixture.ts';

const local = (path: string): RepositoryInput => classifyInput(path, '/');
const NOTICE = /^_[^_]+: showing \d+ of \d+ commits\._$/m;

interface JsonRow {
  name: string;
  commitCount: number;
  renderedCount: number;
  truncated: boolean;
}

function jsonRows(rows: ReturnType<typeof runRepositories>): JsonRow[] {
  return (JSON.parse(toJson(rows)) as { repositories: JsonRow[] }).repositories;
}

test('101 candidates give commitCount 101, renderedCount 100, and truncated true', () => {
  withLongHistoryRepo(101, (dir) => {
    const [row] = jsonRows(runRepositories([local(dir)]));
    assert.equal(row.commitCount, 101);
    assert.equal(row.renderedCount, 100);
    assert.equal(row.truncated, true);
  });
});

test('42 candidates give commitCount 42, renderedCount 42, and truncated false', () => {
  withLongHistoryRepo(42, (dir) => {
    const [row] = jsonRows(runRepositories([local(dir)]));
    assert.equal(row.commitCount, 42);
    assert.equal(row.renderedCount, 42);
    assert.equal(row.truncated, false);
  });
});

test('the cap stays at one hundred entries in the single-repository body, with the omitted-commits footer', () => {
  withLongHistoryRepo(101, (dir) => {
    const { notes } = resolveRelease({ cwd: dir });
    assert.equal(notes.split('\n').filter((line) => line.startsWith('- ')).length, 100);
    assert.match(notes, /_Showing 100 of 101 commits\._/);
  });
});

test('the per-repo summary table shows the candidate count and the rendered count for a truncated repository', () => {
  withBulkHistory(1767, (dir) => {
    const table = renderSummary(runRepositories([local(dir)]));
    assert.match(table, /\| Repository \| Status \| Version \| Last tag \| Commits \| Rendered \|/);
    assert.match(table, /\| bulk \| ok \| 1\.0\.1 \| v1\.0\.0 \| 1767 \| 100 \|/);
  });
});

test('the merged layout states truncation before the first section, for each truncated repository only', () => {
  withBulkHistory(101, (truncated) => withLongHistoryRepo(42, (complete) => {
    const markdown = renderMerged(runRepositories([local(truncated), local(complete)]));
    const notice = '_bulk: showing 100 of 101 commits._';
    assert.ok(markdown.includes(notice), 'the truncated repository has a notice line');
    assert.ok(markdown.indexOf(notice) < markdown.indexOf('\n### '), 'the notice comes before the first shared section');
    assert.equal(markdown.match(new RegExp(NOTICE.source, 'gm'))?.length, 1, 'only the truncated repository has a notice');
    assert.doesNotMatch(markdown, /_long: showing/);
  }));
});

test('the merged layout has no notice line when nothing is truncated', () => {
  withLongHistoryRepo(42, (first) => withLongHistoryRepo(42, (second) => {
    const markdown = renderMerged(runRepositories([local(first), local(second)]));
    assert.doesNotMatch(markdown, NOTICE);
  }));
});

test('repeated runs over an unchanged truncated repository produce identical disclosure bytes', () => {
  withBulkHistory(101, (dir) => {
    const first = renderMerged(runRepositories([local(dir)]));
    const second = renderMerged(runRepositories([local(dir)]));
    assert.equal(first, second);
  });
});
