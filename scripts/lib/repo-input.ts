import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// Input layer for the CLI: classifies each repository input, derives identity, and keeps URL clones in a cache.
// Nothing here publishes or calls the GitHub API. Credentials stay in the user's git configuration.

/** A usage error. The CLI prints the message to stderr and exits with code 2. */
export class UsageError extends Error {}

/** A local git working tree, given as a path. `path` is absolute. */
export interface LocalInput {
  kind: 'path';
  input: string;
  path: string;
}

/** A GitHub repository, given as an HTTPS URL and normalized to `https://github.com/<owner>/<name>`. */
export interface RemoteInput {
  kind: 'url';
  input: string;
  url: string;
  owner: string;
  name: string;
}

export type RepositoryInput = LocalInput | RemoteInput;

export interface NormalizedUrl {
  url: string;
  owner: string;
  name: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** scp-like syntax such as `git@github.com:owner/name`. It always carries a username, so it is never echoed. */
const SCP_LIKE = /^[^/\s:]+@[^/\s:]+:/;
/** GitHub owner and repository segments. Must start with a letter, digit, or underscore, so `.` and `..` are rejected. */
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Hides any username or password in URL-like text before it is printed. */
export function redact(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@');
}

/** Classifies one input. Anything with a URL scheme or scp-like syntax is a URL and must pass `normalizeUrl`; everything else is a path. */
export function classifyInput(input: string, cwd: string = process.cwd()): RepositoryInput {
  if (SCHEME.test(input) || SCP_LIKE.test(input)) {
    return { kind: 'url', input, ...normalizeUrl(input) };
  }
  return { kind: 'path', input, path: resolve(cwd, input) };
}

/**
 * Accepts only `https://github.com/<owner>/<name>`, with or without a `.git` suffix and with an optional trailing slash.
 * Rejected inputs never echo a username or password, so a credential cannot reach stderr or a report.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  if (!SCHEME.test(input)) {
    throw new UsageError('Unsupported repository input: only HTTPS github.com URLs and local paths are accepted.');
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new UsageError(`Not a valid URL: ${redact(input)}`);
  }
  if (parsed.username || parsed.password) {
    throw new UsageError('Repository URLs must not contain a username or password. Configure git credentials instead.');
  }
  if (parsed.protocol !== 'https:') {
    throw new UsageError(`Unsupported scheme ${parsed.protocol.slice(0, -1)}: only https is accepted. Input: ${redact(input)}`);
  }
  if (parsed.hostname.toLowerCase() !== 'github.com' || parsed.port) {
    throw new UsageError(`Unsupported host: only github.com is accepted. Input: ${redact(input)}`);
  }
  if (parsed.search || parsed.hash) {
    throw new UsageError(`Unsupported repository URL, remove the query or fragment: ${redact(input)}`);
  }
  const segments = parsed.pathname.replace(/\/+$/, '').split('/').slice(1);
  if (segments.length !== 2) {
    throw new UsageError(`Expected https://github.com/<owner>/<name>. Input: ${redact(input)}`);
  }
  const [owner, rawName] = segments;
  const name = rawName.replace(/\.git$/, '');
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) {
    throw new UsageError(`Invalid owner or repository name. Input: ${redact(input)}`);
  }
  return { url: `https://github.com/${owner}/${name}`, owner, name };
}

/** Runs git in `cwd` with the same limits as the engine. Errors propagate to the caller. */
function runGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * `owner/name` when a remote URL points to github.com, otherwise null. Accepts HTTPS, ssh, and scp-like forms,
 * and ignores any userinfo, which is never returned or printed.
 */
export function parseGithubRemote(remote: string): string | null {
  const match = /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?github\.com[:/](?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i.exec(remote.trim());
  if (!match?.groups) return null;
  const { owner, name } = match.groups;
  return SEGMENT.test(owner) && SEGMENT.test(name) ? `${owner}/${name}` : null;
}

/** Validates the `--github-repository` value, which must be `owner/name`. */
export function parseIdentityFlag(flag: string): string {
  if (!/^[^/\s]+\/[^/\s]+$/.test(flag)) {
    throw new UsageError('--github-repository must be owner/name, for example HagiCode-org/hagilight.');
  }
  return flag;
}

/**
 * Identity used for commit links, as `owner/name`, or null when there is none.
 * Precedence: the `--github-repository` flag, then the URL itself for a URL input or the `origin` remote for a
 * local path (only when it points to github.com), then none. The flag applies to every input in the run.
 */
export function identityOf(input: RepositoryInput, flag?: string): string | null {
  if (flag !== undefined) return parseIdentityFlag(flag);
  if (input.kind === 'url') return `${input.owner}/${input.name}`;
  try {
    return parseGithubRemote(runGit(input.path, 'remote', 'get-url', 'origin'));
  } catch {
    return null;
  }
}

export interface CacheOptions {
  /** The `--cache-dir` flag: the `hagi-release-drafter` cache root. */
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * Clone location for a URL input: `<root>/repos/<owner>/<name>`. The root is `--cache-dir`, then
 * `$XDG_CACHE_HOME/hagi-release-drafter`, then `~/.cache/hagi-release-drafter`. A relative or empty `XDG_CACHE_HOME` is ignored.
 */
export function cacheDirFor({ owner, name }: Pick<RemoteInput, 'owner' | 'name'>, { cacheDir, env = process.env, home = homedir() }: CacheOptions = {}): string {
  const xdg = env.XDG_CACHE_HOME;
  const root = cacheDir !== undefined
    ? resolve(cacheDir)
    : xdg && isAbsolute(xdg) ? join(xdg, 'hagi-release-drafter') : join(home, '.cache', 'hagi-release-drafter');
  return join(root, 'repos', owner, name);
}

/** Runs one git step and rewrites a failure into a short message. Credentials are never in these arguments, and stderr is redacted anyway. */
function gitStep(cwd: string, description: string, ...args: string[]): void {
  try {
    runGit(cwd, ...args);
  } catch (error) {
    const stderr = (error as { stderr?: string | Buffer }).stderr?.toString().trim() ?? '';
    const detail = redact(stderr || (error instanceof Error ? error.message : String(error))).slice(0, 500);
    // A concurrent run in the same cache can hold a ref lock; a retry normally succeeds.
    const hint = /lock/i.test(detail) ? ' Another run may be using this cache; retry the command.' : '';
    throw new Error(`${description} failed: ${detail}${hint}`);
  }
}

/**
 * Returns the cached clone of a URL input, current with the remote. The first run clones with full history and
 * all tags. Later runs fetch tags and history, then detach at `origin/HEAD`. The clone is built beside its final path
 * and renamed in, so a failed first clone never leaves a partial cache that later runs would mistake for a clone.
 */
export function ensureCachedClone(input: RemoteInput, options: CacheOptions = {}): string {
  const dest = cacheDirFor(input, options);
  if (existsSync(join(dest, '.git'))) {
    gitStep(dest, 'git fetch', 'fetch', '--quiet', '--force', '--prune', '--prune-tags', '--tags', 'origin');
    gitStep(dest, 'git remote set-head', 'remote', 'set-head', 'origin', '--auto');
    gitStep(dest, 'git checkout', 'checkout', '--quiet', '--force', '--detach', 'origin/HEAD');
    return dest;
  }
  if (existsSync(dest)) {
    throw new Error(`The cache path exists but is not a git clone; remove it and run again: ${dest}`);
  }
  const partial = `${dest}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  try {
    gitStep(dirname(dest), 'git clone', 'clone', '--quiet', input.url, partial);
    gitStep(partial, 'git checkout', 'checkout', '--quiet', '--detach', 'origin/HEAD');
    renameSync(partial, dest);
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
  return dest;
}

/**
 * Throws for a shallow local checkout. Its commit range would start at the shallow boundary, so the version would
 * silently fall back to 0.1.0. The message gives the same fix as the action's shallow-clone guard.
 */
export function assertFullHistory(path: string): void {
  if (runGit(path, 'rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error(
      'This checkout is shallow, so its version and notes would be wrong. Fetch full history and tags: '
      + 'use fetch-depth: 0 and fetch-tags: true in actions/checkout, or run git fetch --unshallow --tags.',
    );
  }
}
