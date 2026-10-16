import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { devVersion, nextBaseVersion, verifyTag, type ReleaseInfo } from '../scripts/npm-release.ts';

const release = (tag_name: string, state: 'published' | 'draft' | 'prerelease' = 'published'): ReleaseInfo => ({
  tag_name,
  draft: state === 'draft',
  prerelease: state === 'prerelease',
});

test('nextBaseVersion bumps the patch of the newest published stable release', () => {
  assert.equal(nextBaseVersion([release('v0.1.2'), release('v0.1.10'), release('v0.1.9')], '0.1.0'), '0.1.11');
});

test('nextBaseVersion prefers an open draft that is newer than the last published release', () => {
  assert.equal(nextBaseVersion([release('v1.0.0'), release('v1.1.0', 'draft')], '0.1.0'), '1.1.0');
  assert.equal(nextBaseVersion([release('v1.0.0'), release('v0.9.0', 'draft')], '0.1.0'), '1.0.1');
});

test('nextBaseVersion ignores pre-releases and non-stable tags, and falls back to package.json', () => {
  assert.equal(nextBaseVersion([release('v2.0.0', 'prerelease'), release('nightly')], '0.1.0'), '0.1.0');
  assert.equal(nextBaseVersion([], '0.3.0'), '0.3.0');
});

test('devVersion composes run, attempt and a short sha, and rejects missing CI variables', () => {
  assert.equal(
    devVersion('0.1.3', { GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'ABC1234DEF5678' }),
    '0.1.3-dev.42.2.abc1234',
  );
  assert.throws(() => devVersion('0.1.3', { GITHUB_RUN_NUMBER: '42' }), /required/);
  assert.throws(() => devVersion('0.1.3', { GITHUB_RUN_NUMBER: '0', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'abc1234' }), /required/);
});

test('verifyTag accepts stable tags and rejects pre-release tags and versions older than package.json', () => {
  assert.equal(verifyTag('v0.2.0', '0.1.0'), '0.2.0');
  assert.equal(verifyTag('v0.1.0', '0.1.0'), '0.1.0');
  assert.throws(() => verifyTag('v1.0.0-beta.1', '0.1.0'), /stable release tag/);
  assert.throws(() => verifyTag('1.0.0', '0.1.0'), /stable release tag/);
  assert.throws(() => verifyTag('v0.0.9', '0.1.0'), /predates/);
});

interface Job {
  if?: string;
  steps: { run?: string }[];
}
const workflow = parse(readFileSync(new URL('../.github/workflows/npm-publish.yml', import.meta.url), 'utf8')) as {
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};

test('the publish workflow grants OIDC, runs only for main pushes and stable releases, and tests before publishing', () => {
  assert.equal(workflow.permissions['id-token'], 'write');
  assert.equal(workflow.permissions.contents, 'read');
  assert.match(workflow.jobs['publish-dev'].if ?? '', /refs\/heads\/main/);
  assert.match(workflow.jobs['publish-release'].if ?? '', /!github\.event\.release\.prerelease/);
  assert.match(workflow.jobs['publish-release'].if ?? '', /!github\.event\.release\.draft/);
  for (const [name, distTag] of [['publish-dev', 'dev'], ['publish-release', 'latest']] as const) {
    const runs = workflow.jobs[name].steps.map((step) => step.run ?? '');
    const test = runs.findIndex((run) => run.includes('npm test'));
    const publish = runs.findIndex((run) => run.includes(`npm-release.ts publish ${distTag}`));
    assert.ok(test >= 0 && publish > test, `${name} must test before it publishes`);
  }
});

test('the maintainer release script is kept out of the published tarball', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] };
  assert.ok(manifest.files.includes('!scripts/npm-release.ts'));
});
