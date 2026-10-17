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

/**
 * Builds the known-history fixture repository in a fresh temporary directory, runs `use` with its path,
 * and removes the directory afterwards. Tests use real git on this repository rather than doubles (D11).
 */
export function withFixtureRepo<T>(use: (dir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'hagi-release-drafter-'));
  try {
    const dir = join(root, 'repo');
    execFileSync('bash', [builder, dir], { env: deterministicEnv });
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
