import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareReleaseTags, parseReleaseTag } from '../scripts/lib/release-tags.ts';
import type { ReleaseTag } from '../scripts/lib/release-tags.ts';

const parse = (tag: string): ReleaseTag => {
  const parsed = parseReleaseTag(tag);
  assert.ok(parsed, `${tag} should be a release tag`);
  return parsed;
};
const compare = (left: string, right: string): number => compareReleaseTags(parse(left), parse(right));

test('accepts stable tags and prerelease tags, and splits the prerelease into identifiers', () => {
  assert.deepEqual(parse('v1.2.3'), { tag: 'v1.2.3', core: '1.2.3', prerelease: [] });
  assert.deepEqual(parse('v0.1.0-beta.97'), { tag: 'v0.1.0-beta.97', core: '0.1.0', prerelease: ['beta', '97'] });
  assert.deepEqual(parse('v2.0.0-rc.1.x-y'), { tag: 'v2.0.0-rc.1.x-y', core: '2.0.0', prerelease: ['rc', '1', 'x-y'] });
  assert.deepEqual(parse('v1.0.0-0'), { tag: 'v1.0.0-0', core: '1.0.0', prerelease: ['0'] });
});

test('ignores tags outside the release-tag grammar: build metadata, leading zeros, and non-semver names', () => {
  for (const tag of [
    'v1.4.0+build.5',
    'v1.4.0-beta.1+build.5',
    'v1.3.0-beta.01',
    'v01.2.3',
    'v1.02.3',
    'v1.2.03',
    'v1.2',
    '1.2.3',
    'release-2',
    'v1.2.3-',
    'v1.2.3-beta..1',
    'v1.2.3-beta.',
    'v1.2.3-beta_1',
    'v1.2.3 ',
    '',
  ]) {
    assert.equal(parseReleaseTag(tag), null, `${JSON.stringify(tag)} must not be a release tag`);
  }
});

test('compares numeric prerelease identifiers numerically, so beta.100 ranks above beta.97', () => {
  assert.ok(compare('v0.1.0-beta.100', 'v0.1.0-beta.97') > 0);
  assert.ok(compare('v0.1.0-beta.97', 'v0.1.0-beta.100') < 0);
});

test('ranks a stable tag above its own prerelease', () => {
  assert.ok(compare('v0.1.0', 'v0.1.0-beta.97') > 0);
  assert.ok(compare('v0.1.0-beta.97', 'v0.1.0') < 0);
});

test('ranks a higher core above a lower one, even when the lower one is stable', () => {
  assert.ok(compare('v1.3.0-beta.1', 'v1.2.3') > 0);
  assert.ok(compare('v1.10.0', 'v1.9.9') > 0, 'core numbers compare numerically, not as text');
});

test('matches the SemVer 2.0 example order for prerelease identifiers', () => {
  const ordered = [
    'v1.0.0-alpha',
    'v1.0.0-alpha.1',
    'v1.0.0-alpha.beta',
    'v1.0.0-beta',
    'v1.0.0-beta.2',
    'v1.0.0-beta.11',
    'v1.0.0-rc.1',
    'v1.0.0',
  ];
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(compare(ordered[index - 1], ordered[index]) < 0, `${ordered[index - 1]} must rank below ${ordered[index]}`);
  }
});

test('ranks numeric identifiers below alphanumeric ones, and a shorter identifier list below a longer one with the same prefix', () => {
  assert.ok(compare('v1.0.0-1', 'v1.0.0-alpha') < 0);
  assert.ok(compare('v1.0.0-alpha', 'v1.0.0-alpha.1') < 0);
});

test('equal tags compare as zero', () => {
  assert.equal(compare('v0.1.0-beta.97', 'v0.1.0-beta.97'), 0);
});
