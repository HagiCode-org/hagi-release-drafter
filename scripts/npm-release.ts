import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareVersions, stableVersion } from './release-notes.ts';

// Release tooling for the npm package. It is a maintainer script and is not shipped in the tarball.
//   dev                 print the next development version, for example 0.1.3-dev.42.1.abc1234
//   verify <tag>        check a stable vX.Y.Z release tag and print its bare version
//   stamp <version>     write the version into package.json and package-lock.json
//   publish <dist-tag>  publish the current package version under a dist-tag (dev or latest)

const PACKAGE_NAME = '@hagicode/hagi-release-drafter';
const REPOSITORY = 'HagiCode-org/hagi-release-drafter';
const WORKFLOW = 'npm-publish.yml';
const REGISTRY = 'https://registry.npmjs.org';
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-dev\.[1-9]\d*\.[1-9]\d*\.[0-9a-f]{7})?$/;

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
    items.map((item) => item.version).sort(compareVersions).at(-1);
  const published = newest(versions.filter((item) => !item.draft && !item.prerelease));
  const draft = newest(versions.filter((item) => item.draft && (!published || compareVersions(item.version, published) > 0)));
  if (draft) return draft;
  if (!published) return currentVersion;
  const [major, minor, patch] = published.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/** Development version `<base>-dev.<run>.<attempt>.<sha7>`; unique per workflow attempt, so reruns never collide. */
export function devVersion(base: string, env: Record<string, string | undefined>): string {
  const run = env.GITHUB_RUN_NUMBER;
  const attempt = env.GITHUB_RUN_ATTEMPT;
  const sha = env.GITHUB_SHA?.slice(0, 7).toLowerCase();
  if (!/^[1-9]\d*$/.test(run ?? '') || !/^[1-9]\d*$/.test(attempt ?? '') || !/^[0-9a-f]{7}$/.test(sha ?? '')) {
    throw new Error('GITHUB_RUN_NUMBER, GITHUB_RUN_ATTEMPT, and GITHUB_SHA are required');
  }
  return `${base}-dev.${run}.${attempt}.${sha}`;
}

/** Stable release version for a tag. A release that predates package.json is refused. */
export function verifyTag(tag: string, currentVersion: string): string {
  const version = stableVersion(tag);
  if (compareVersions(version, currentVersion) < 0) {
    throw new Error(`Release ${version} predates package ${currentVersion}`);
  }
  return version;
}

async function fetchReleases(): Promise<ReleaseInfo[]> {
  const token = process.env.GITHUB_TOKEN;
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || !token) {
    throw new Error(`GITHUB_REPOSITORY=${REPOSITORY} and GITHUB_TOKEN are required for dev publishing`);
  }
  const releases: ReleaseInfo[] = [];
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`GitHub releases API returned HTTP ${response.status}`);
    const batch: unknown = await response.json();
    if (!Array.isArray(batch)) throw new Error('GitHub releases API returned an invalid response');
    releases.push(...(batch as ReleaseInfo[]));
    if (batch.length < 100) break;
  }
  return releases;
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
  if (!VERSION_PATTERN.test(version)) throw new Error(`Invalid publish version: ${version}`);
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
    if (!VERSION_PATTERN.test(argument ?? '')) throw new Error(`Invalid publish version: ${argument}`);
    npm(['version', argument as string, '--no-git-tag-version', '--allow-same-version', '--ignore-scripts']);
  } else if (command === 'publish') {
    publish(argument ?? '');
  } else {
    throw new Error('Usage: node scripts/npm-release.ts dev|verify <tag>|stamp <version>|publish <dist-tag>');
  }
}

if (process.argv[1]?.endsWith('npm-release.ts')) await main();
