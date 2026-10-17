import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertFullHistory, cacheDirFor, classifyInput, ensureCachedClone, identityOf, normalizeUrl, parseGithubRemote, redact, UsageError,
} from '../scripts/lib/repo-input.ts';
import type { RemoteInput } from '../scripts/lib/repo-input.ts';
import { withFixtureRepo } from './support/fixture.ts';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

const REPO = 'https://github.com/HagiCode-org/hagi-release-drafter';

/** Asserts that `input` is refused with a usage error whose message contains none of the `secrets`. */
function assertRejected(input: string, pattern: RegExp, secrets: string[] = []): void {
  assert.throws(() => normalizeUrl(input), (error: unknown) => {
    assert.ok(error instanceof UsageError, `expected a UsageError for ${JSON.stringify(input)}`);
    assert.match(error.message, pattern);
    for (const secret of secrets) {
      assert.ok(!error.message.includes(secret), `message must not contain ${secret}`);
    }
    return true;
  });
}

test('accepts HTTPS github.com URLs with or without a .git suffix or trailing slash', () => {
  for (const input of [REPO, `${REPO}.git`, `${REPO}/`, `${REPO}.git/`, 'https://GitHub.com/HagiCode-org/hagi-release-drafter']) {
    assert.deepEqual(normalizeUrl(input), {
      url: REPO,
      owner: 'HagiCode-org',
      name: 'hagi-release-drafter',
    }, input);
  }
});

test('rejects other schemes without echoing credentials', () => {
  assertRejected('http://github.com/HagiCode-org/x', /Unsupported scheme http/);
  assertRejected('file:///tmp/repo', /Unsupported scheme file/);
  assertRejected('ssh://git@github.com/HagiCode-org/x.git', /must not contain a username or password/, ['git@']);
  assertRejected('git@github.com:HagiCode-org/x.git', /only HTTPS github\.com URLs/, ['git@']);
});

test('rejects other hosts and non-default ports', () => {
  assertRejected('https://gitlab.com/HagiCode-org/x', /only github\.com is accepted/);
  assertRejected('https://github.com.example.com/HagiCode-org/x', /only github\.com is accepted/);
  assertRejected('https://github.com:8443/HagiCode-org/x', /only github\.com is accepted/);
});

test('rejects embedded credentials and never repeats them', () => {
  assertRejected('https://zq-alice:s3cret@github.com/HagiCode-org/x', /must not contain a username or password/, ['zq-alice', 's3cret']);
  assertRejected('https://ghp_tokenvalue@github.com/HagiCode-org/x', /must not contain a username or password/, ['ghp_tokenvalue']);
});

test('rejects paths that are not exactly owner and name', () => {
  assertRejected('https://github.com/HagiCode-org', /Expected https:\/\/github\.com\/<owner>\/<name>/);
  assertRejected('https://github.com/HagiCode-org/x/extra', /Expected https:\/\/github\.com\/<owner>\/<name>/);
  assertRejected('https://github.com/', /Expected https:\/\/github\.com\/<owner>\/<name>/);
  assertRejected('https://github.com/HagiCode-org/.git', /Invalid owner or repository name/);
  assertRejected('https://github.com/HagiCode-org/..', /Expected https:\/\/github\.com/);
  assertRejected('https://github.com/HagiCode-org/x?tab=readme', /remove the query or fragment/);
  assertRejected('https://github.com/HagiCode-org/x#readme', /remove the query or fragment/);
});

test('classifies URL-like text as a URL and everything else as a local path', () => {
  assert.deepEqual(classifyInput(REPO, '/work'), {
    kind: 'url', input: REPO, url: REPO, owner: 'HagiCode-org', name: 'hagi-release-drafter',
  });
  assert.deepEqual(classifyInput('./repos/a', '/work'), { kind: 'path', input: './repos/a', path: '/work/repos/a' });
  assert.deepEqual(classifyInput('/abs/repo', '/work'), { kind: 'path', input: '/abs/repo', path: '/abs/repo' });
  assert.throws(() => classifyInput('http://github.com/o/n', '/work'), UsageError);
});

test('redact removes the userinfo from URL-like text', () => {
  assert.equal(redact('https://user:pw@github.com/o/n'), 'https://***@github.com/o/n');
  assert.equal(redact('no url here'), 'no url here');
});

test('parses github.com remotes in HTTPS, ssh, and scp-like forms and ignores other hosts', () => {
  assert.equal(parseGithubRemote('https://github.com/HagiCode-org/example.git'), 'HagiCode-org/example');
  assert.equal(parseGithubRemote('https://github.com/HagiCode-org/example'), 'HagiCode-org/example');
  assert.equal(parseGithubRemote('git@github.com:HagiCode-org/example.git'), 'HagiCode-org/example');
  assert.equal(parseGithubRemote('ssh://git@github.com/HagiCode-org/example.git'), 'HagiCode-org/example');
  assert.equal(parseGithubRemote('https://gitlab.com/HagiCode-org/example.git'), null);
  assert.equal(parseGithubRemote('/srv/git/example.git'), null);
});

test('cache location precedence: --cache-dir, then XDG_CACHE_HOME, then ~/.cache', () => {
  const repo = { owner: 'HagiCode-org', name: 'hagi-release-drafter' };
  assert.equal(
    cacheDirFor(repo, { cacheDir: '/flag', env: { XDG_CACHE_HOME: '/xdg' }, home: '/home/u' }),
    join('/flag', 'repos', 'HagiCode-org', 'hagi-release-drafter'),
  );
  assert.equal(
    cacheDirFor(repo, { env: { XDG_CACHE_HOME: '/xdg' }, home: '/home/u' }),
    join('/xdg', 'hagi-release-drafter', 'repos', 'HagiCode-org', 'hagi-release-drafter'),
  );
  assert.equal(
    cacheDirFor(repo, { env: {}, home: '/home/u' }),
    join('/home/u', '.cache', 'hagi-release-drafter', 'repos', 'HagiCode-org', 'hagi-release-drafter'),
  );
  assert.equal(
    cacheDirFor(repo, { env: { XDG_CACHE_HOME: 'relative' }, home: '/home/u' }),
    join('/home/u', '.cache', 'hagi-release-drafter', 'repos', 'HagiCode-org', 'hagi-release-drafter'),
  );
  assert.equal(
    cacheDirFor(repo, { env: { XDG_CACHE_HOME: '' }, home: '/home/u' }),
    join('/home/u', '.cache', 'hagi-release-drafter', 'repos', 'HagiCode-org', 'hagi-release-drafter'),
  );
});

test('identity precedence: flag, then origin remote of a local path, then none', () => {
  withFixtureRepo((dir) => {
    const local = classifyInput(dir, '/');
    assert.equal(identityOf(local), null, 'no origin remote gives no identity');

    git(dir, 'remote', 'add', 'origin', 'https://github.com/HagiCode-org/example.git');
    assert.equal(identityOf(local), 'HagiCode-org/example');
    assert.equal(identityOf(local, 'HagiCode-org/other'), 'HagiCode-org/other', 'the flag overrides the origin remote');
    assert.throws(() => identityOf(local, 'not-a-slug'), UsageError);
  });
  withFixtureRepo((dir) => {
    git(dir, 'remote', 'add', 'origin', 'https://gitlab.com/HagiCode-org/example.git');
    assert.equal(identityOf(classifyInput(dir, '/')), null, 'a non-github origin gives no identity');
  });
});

test('a URL input takes its identity from the URL itself', () => {
  assert.equal(identityOf(classifyInput(REPO, '/')), 'HagiCode-org/hagi-release-drafter');
});

test('clones the public repository with full history and tags, then refreshes it without cloning again', { timeout: 300_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'hagi-cache-'));
  try {
    const remote: RemoteInput = {
      kind: 'url', input: REPO, url: REPO, owner: 'HagiCode-org', name: 'hagi-release-drafter',
    };
    const first = ensureCachedClone(remote, { cacheDir: root });
    assert.equal(first, join(root, 'repos', 'HagiCode-org', 'hagi-release-drafter'));
    assert.equal(git(first, 'rev-parse', '--is-shallow-repository').trim(), 'false');
    assert.match(git(first, 'tag', '--list', 'v0.1.0'), /v0\.1\.0/);
    assert.equal(git(first, 'branch', '--show-current').trim(), '', 'the clone is detached');

    // A second clone would replace the directory and remove this marker, so it proves the fetch path ran instead.
    writeFileSync(join(first, '.git', 'hagi-marker'), 'kept');
    const second = ensureCachedClone(remote, { cacheDir: root });
    assert.equal(second, first);
    assert.equal(readFileSync(join(second, '.git', 'hagi-marker'), 'utf8'), 'kept', 'the second run must fetch, not clone');
    assert.equal(git(second, 'rev-parse', 'HEAD').trim(), git(second, 'rev-parse', 'origin/HEAD').trim());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the shallow guard refuses a real shallow clone of a local fixture and names the fix', () => {
  withFixtureRepo((fixture) => {
    const root = mkdtempSync(join(tmpdir(), 'hagi-shallow-'));
    try {
      const shallow = join(root, 'shallow');
      execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${fixture}`, shallow], { stdio: 'ignore' });
      assert.equal(git(shallow, 'rev-parse', '--is-shallow-repository').trim(), 'true');
      assert.throws(() => assertFullHistory(shallow), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /fetch-depth: 0/);
        assert.match(error.message, /fetch-tags: true/);
        return true;
      });
      assert.doesNotThrow(() => assertFullHistory(fixture));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
