import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Octokit } from '@octokit/rest';
import semver from 'semver';
import { stableVersion } from './release-notes.ts';

// Release tooling for the npm package. It is a maintainer script and is not shipped in the tarball.
//   dev                 print the next development version, for example 0.1.3-dev.42.1.abc1234
//   verify <tag>        check a stable vX.Y.Z release tag and print its bare version
//   stamp <version>     write the version into package.json and package-lock.json
//   publish <dist-tag>  publish the current package version under a dist-tag (dev or latest)

const PACKAGE_NAME = '@hagicode/hagi-release-drafter';
const REPOSITORY = 'HagiCode-org/hagi-release-drafter';
const WORKFLOW = 'npm-publish.yml';
const REGISTRY = 'https://registry.npmjs.org';
// A sha with a letter in it is already an alphanumeric SemVer identifier. An all-digit sha would be read as a number
// (and refused outright when it starts with `0`), so only that case gets a `g` prefix, as in `git describe`.
const DEV_SHA = /^(?:[0-9a-f]{7}|g[0-9]{7})$/;
const ALL_DIGITS = /^[0-9]+$/;

/**
 * True for a publishable version: a stable `X.Y.Z`, or `X.Y.Z-dev.<run>.<attempt>.<sha7>`. SemVer parsing rejects leading
 * zeros and build metadata; the round trip rejects a `v` prefix and surrounding whitespace, which `semver.parse` would forgive.
 */
export function isPublishVersion(version: string): boolean {
  const parsed = semver.parse(version);
  if (parsed === null || parsed.version !== version || parsed.build.length > 0) return false;
  if (parsed.prerelease.length === 0) return true;
  const [label, run, attempt, sha] = parsed.prerelease;
  return parsed.prerelease.length === 4 && label === 'dev'
    && typeof run === 'number' && run > 0 && typeof attempt === 'number' && attempt > 0
    && typeof sha === 'string' && DEV_SHA.test(sha);
}

export interface ReleaseInfo {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}

function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return manifest.version;
}

/** Version a development build counts up from: the open draft when there is one, else the next patch. */
export function nextBaseVersion(releases: ReleaseInfo[], currentVersion: string): string {
  const versions = releases.flatMap((release) => {
    try {
      return [{ version: stableVersion(release.tag_name), draft: release.draft, prerelease: release.prerelease }];
    } catch {
      return [];
    }
  });
  const newest = (items: { version: string }[]): string | undefined =>
    items.map((item) => item.version).sort(semver.compare).at(-1);
  const published = newest(versions.filter((item) => !item.draft && !item.prerelease));
  const draft = newest(versions.filter((item) => item.draft && (!published || semver.gt(item.version, published))));
  if (draft) return draft;
  if (!published) return currentVersion;
  return semver.inc(published, 'patch') as string;
}

/** Development version `<base>-dev.<run>.<attempt>.<sha7>`; unique per workflow attempt, so reruns never collide. */
export function devVersion(base: string, env: Record<string, string | undefined>): string {
  const raw = env.GITHUB_SHA?.slice(0, 7).toLowerCase();
  const sha = raw !== undefined && ALL_DIGITS.test(raw) ? `g${raw}` : raw;
  const version = `${base}-dev.${env.GITHUB_RUN_NUMBER}.${env.GITHUB_RUN_ATTEMPT}.${sha}`;
  if (!isPublishVersion(version)) throw new Error('GITHUB_RUN_NUMBER, GITHUB_RUN_ATTEMPT, and GITHUB_SHA are required');
  return version;
}

/** Stable release version for a tag. A release that predates package.json is refused. */
export function verifyTag(tag: string, currentVersion: string): string {
  const version = stableVersion(tag);
  if (semver.lt(version, currentVersion)) {
    throw new Error(`Release ${version} predates package ${currentVersion}`);
  }
  return version;
}

async function fetchReleases(): Promise<ReleaseInfo[]> {
  const token = process.env.GITHUB_TOKEN;
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || !token) {
    throw new Error(`GITHUB_REPOSITORY=${REPOSITORY} and GITHUB_TOKEN are required for dev publishing`);
  }
  const [owner, repo] = REPOSITORY.split('/');
  const releases = await new Octokit({ auth: token }).paginate('GET /repos/{owner}/{repo}/releases', { owner, repo, per_page: 100 });
  return releases.map(({ tag_name, draft, prerelease }) => ({ tag_name, draft, prerelease }));
}

function npm(args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  return execFileSync('npm', args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env,
  }) ?? '';
}

function alreadyPublished(version: string): boolean {
  try {
    const versions: unknown = JSON.parse(npm(['view', PACKAGE_NAME, 'versions', '--json', '--registry', REGISTRY], { capture: true }));
    return (Array.isArray(versions) ? versions : [versions]).includes(version);
  } catch (error) {
    if ((error as { stderr?: Buffer | string }).stderr?.toString().includes('E404')) return false;
    throw error;
  }
}

function publish(distTag: string): void {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error(`Publishing is only allowed from ${REPOSITORY}`);
  if (!process.env.GITHUB_WORKFLOW_REF?.startsWith(`${REPOSITORY}/.github/workflows/${WORKFLOW}@`)) {
    throw new Error(`Publishing requires the ${WORKFLOW} trusted publisher workflow`);
  }
  if (distTag !== 'dev' && distTag !== 'latest') throw new Error('Usage: node scripts/npm-release.ts publish dev|latest');
  const version = packageVersion();
  if (!isPublishVersion(version)) throw new Error(`Invalid publish version: ${version}`);
  if (distTag === 'latest' && version.includes('-')) throw new Error(`Refusing to publish ${version} as latest`);
  if (distTag === 'dev' && !version.includes('-dev.')) throw new Error(`Refusing to publish ${version} as dev`);
  if (alreadyPublished(version)) {
    console.log(`${PACKAGE_NAME}@${version} already exists; skipping`);
    return;
  }
  npm(['publish', '--tag', distTag, '--access', 'public', '--provenance'], {
    env: { ...process.env, NPM_CONFIG_PROVENANCE: 'true' },
  });
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  if (command === 'dev') {
    process.stdout.write(devVersion(nextBaseVersion(await fetchReleases(), packageVersion()), process.env));
  } else if (command === 'verify') {
    process.stdout.write(verifyTag(argument ?? '', packageVersion()));
  } else if (command === 'stamp') {
    if (!isPublishVersion(argument ?? '')) throw new Error(`Invalid publish version: ${argument}`);
    npm(['version', argument as string, '--no-git-tag-version', '--allow-same-version', '--ignore-scripts']);
  } else if (command === 'publish') {
    publish(argument ?? '');
  } else {
    throw new Error('Usage: node scripts/npm-release.ts dev|verify <tag>|stamp <version>|publish <dist-tag>');
  }
}

if (process.argv[1]?.endsWith('npm-release.ts')) await main();
