import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const builder = fileURLToPath(new URL('../fixtures/make-fixture-repo.sh', import.meta.url));

/**
 * Pins commit dates so that commit SHAs, and therefore golden output, are the same on every run and machine.
 * Without it each build gets new SHAs.
 */
const FIXED_DATES = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
const deterministicEnv = { ...process.env, ...FIXED_DATES };

function withBuiltFixture<T>(mode: 'default' | 'prerelease-only', use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-'));
  try {
    const dir = join(root, 'repo');
    execFileSync('bash', [builder, dir, mode], { env: deterministicEnv });
    return use(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Builds the known-history fixture repository in a fresh temporary directory, runs `use` with its path,
 * and removes the directory afterwards. Tests use real git on this repository rather than doubles (D11).
 */
export function withFixtureRepo<T>(use: (dir: string) => T): T {
  return withBuiltFixture('default', use);
}

/** The prerelease-only fixture: its only release tag is `v0.1.0-beta.97`, and two fix-only commits follow it. */
export function withPrereleaseFixtureRepo<T>(use: (dir: string) => T): T {
  return withBuiltFixture('prerelease-only', use);
}

/**
 * Builds `v1.0.0` on a first commit and then `commitsAfterTag` `chore:` commits, with pinned dates, in one
 * `git fast-import` run. Far faster than one git process per commit, so it suits the 1767-commit report example.
 */
export function withBulkHistory<T>(commitsAfterTag: number, use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-bulk-'));
  try {
    const dir = join(root, 'bulk');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', dir], { env: deterministicEnv });
    // 2026-01-01T00:00:00Z, the same instant as FIXED_DATES.
    const person = 'fixture <fixture@example.invalid>';
    const when = '1767225600 +0000';
    const commitRecord = (mark: number, message: string): string => [
      'commit refs/heads/main',
      `mark :${mark}`,
      `author ${person} ${when}`,
      `committer ${person} ${when}`,
      `data ${Buffer.byteLength(message)}`,
      message,
      ...(mark > 1 ? [`from :${mark - 1}`] : []),
      '',
    ].join('\n');
    const stream = [commitRecord(1, 'feat: start\n'), 'reset refs/tags/v1.0.0\nfrom :1\n\n'];
    for (let index = 1; index <= commitsAfterTag; index++) {
      stream.push(commitRecord(index + 1, `chore: step ${index}\n`));
    }
    execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: stream.join(''), env: deterministicEnv });
    return use(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** One commit per step, with its subject, and an optional tag placed on that commit. */
export interface HistoryStep {
  subject: string;
  tag?: string;
}

/**
 * Builds a repository from `steps` in order, with pinned dates, runs `use` with its path, and removes it afterwards.
 * Use it for history that the shared fixtures do not cover, such as several prereleases and no tag at all.
 */
export function withHistory<T>(steps: HistoryStep[], use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-history-'));
  try {
    const dir = join(root, 'history');
    const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: dir, encoding: 'utf8', env: deterministicEnv });
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', dir], { env: deterministicEnv });
    for (const step of steps) {
      git('commit', '--quiet', '--allow-empty', '-m', step.subject);
      if (step.tag !== undefined) git('tag', step.tag);
    }
    return use(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Makes a real shallow clone of `source` with `git clone --depth 1 file://…`, runs `use`, then removes it. */
export function withShallowClone<T>(source: string, use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-shallow-'));
  try {
    const dir = join(root, 'shallow');
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${source}`, dir], { stdio: 'ignore' });
    return use(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Builds a repository with one stable tag `v1.0.0` and `commitsAfterTag` further `chore:` commits, with pinned dates.
 * Used to exercise pruning at the one-hundred-commit ceiling with real history.
 */
export function withLongHistoryRepo<T>(commitsAfterTag: number, use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-long-'));
  try {
    const dir = join(root, 'long');
    const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: dir, encoding: 'utf8', env: deterministicEnv });
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', dir], { env: deterministicEnv });
    git('commit', '--quiet', '--allow-empty', '-m', 'feat: start');
    git('tag', 'v1.0.0');
    for (let index = 1; index <= commitsAfterTag; index++) {
      git('commit', '--quiet', '--allow-empty', '-m', `chore: step ${index}`);
    }
    return use(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
