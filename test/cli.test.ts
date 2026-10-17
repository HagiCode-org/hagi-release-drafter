import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isSupportedNode } from '../scripts/cli.ts';
import { withFixtureRepo, withShallowClone } from './support/fixture.ts';

// Every case spawns the real scripts/cli.ts process on the Node.js runtime running this test.
const CLI = fileURLToPath(new URL('../scripts/cli.ts', import.meta.url));

interface Outcome {
  status: number | null;
  stdout: string;
  stderr: string;
}

function cli(args: string[], cwd: string): Outcome {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('unknown subcommands, invalid versions, layouts, formats, and unknown flags each exit with code 2', () => {
  withFixtureRepo((fixture) => {
    const cases: Array<[string[], RegExp]> = [
      [['publish'], /Unknown subcommand: publish/],
      [[], /Missing subcommand/],
      [['version', '--version', 'v2.0.0'], /--version must be a stable X\.Y\.Z/],
      [['version', '--version', '2.0.0-beta.1'], /--version must be a stable X\.Y\.Z/],
      [['version', '--version', '2.0'], /--version must be a stable X\.Y\.Z/],
      [['notes', '--layout', 'fancy'], /Unknown layout fancy/],
      [['notes', '--format', 'yaml'], /Unknown format yaml/],
      [['notes', '--publish'], /Unknown option/],
      [['notes', '--github-repository', 'not-a-slug'], /--github-repository must be owner\/name/],
    ];
    for (const [args, message] of cases) {
      const outcome = cli(args, fixture);
      assert.equal(outcome.status, 2, `exit code for ${args.join(' ')}`);
      assert.equal(outcome.stdout, '', `stdout for ${args.join(' ')}`);
      assert.match(outcome.stderr, message);
    }
  });
});

test('--version with several inputs exits with code 2 and names the rule', () => {
  withFixtureRepo((first) => withFixtureRepo((second) => {
    const outcome = cli(['version', '--version', '2.0.0', first, second], first);
    assert.equal(outcome.status, 2);
    assert.match(outcome.stderr, /applies to one repository only/);
  }));
});

test('--help lists every subcommand and flag, and exits with code 0', () => {
  const outcome = cli(['--help'], process.cwd());
  assert.equal(outcome.status, 0);
  for (const token of ['version', 'notes', '--repo', '--layout', '--format', '--output', '--version', '--github-repository', '--cache-dir', '--fail-fast', '--help']) {
    assert.ok(outcome.stdout.includes(token), `help must list ${token}`);
  }
});

test('--output leaves stdout empty and writes the same bytes to the file', () => {
  withFixtureRepo((fixture) => {
    const out = mkdtempSync(join(tmpdir(), 'hagi-cli-out-'));
    try {
      const target = join(out, 'notes.md');
      const outcome = cli(['notes', '--github-repository', 'HagiCode-org/hagi-release-drafter', '--output', target], fixture);
      assert.equal(outcome.status, 0);
      assert.equal(outcome.stdout, '');
      const stdoutCopy = cli(['notes', '--github-repository', 'HagiCode-org/hagi-release-drafter'], fixture).stdout;
      assert.equal(readFileSync(target, 'utf8'), stdoutCopy);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

test('a shallow checkout exits with code 1, names the fix on stderr, and prints no version', () => {
  withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
    const outcome = cli(['version', shallow], fixture);
    assert.equal(outcome.status, 1);
    assert.equal(outcome.stdout, '');
    assert.match(outcome.stderr, /fetch-depth: 0/);
    assert.match(outcome.stderr, /fetch-tags: true/);
  }));
});

test('a mixed run exits with code 1, keeps the healthy result, and reports the failed row in the report', () => {
  withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
    const outcome = cli(['version', fixture, shallow], fixture);
    assert.equal(outcome.status, 1);
    assert.match(outcome.stdout, /\| repo \| ok \| 2\.0\.0 \|/);
    assert.match(outcome.stdout, /\| shallow \| failed \| \| \| \|/);
    assert.match(outcome.stderr, /shallow:/);
  }));
});

test('a run where every repository succeeds exits with code 0', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['version', fixture], fixture);
    assert.equal(outcome.status, 0);
    assert.equal(outcome.stdout, '2.0.0\n');
  });
});

test('with no input, the current directory is used inside a git repository', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['version'], fixture);
    assert.equal(outcome.status, 0);
    assert.equal(outcome.stdout, '2.0.0\n');
  });
});

test('with no input outside a git repository, the run is a usage error', () => {
  const outside = mkdtempSync(join(tmpdir(), 'hagi-cli-outside-'));
  try {
    const outcome = cli(['notes'], outside);
    assert.equal(outcome.status, 2);
    assert.equal(outcome.stdout, '');
    assert.match(outcome.stderr, /not a git working tree/);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('an unsupported input exits with code 2 before any repository is processed', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['notes', fixture, 'http://github.com/HagiCode-org/x'], fixture);
    assert.equal(outcome.status, 2);
    assert.equal(outcome.stdout, '');
    assert.match(outcome.stderr, /Unsupported scheme http/);
  });
});

test('a duplicate input exits with code 2 and names the duplicate', () => {
  withFixtureRepo((fixture) => {
    const outcome = cli(['version', fixture, fixture], fixture);
    assert.equal(outcome.status, 2);
    assert.match(outcome.stderr, /Duplicate repository input/);
  });
});

test('the Node.js guard accepts version 24 and later and refuses earlier versions', () => {
  assert.equal(isSupportedNode('24.0.0'), true);
  assert.equal(isSupportedNode('24.22.0'), true);
  assert.equal(isSupportedNode('25.1.0'), true);
  assert.equal(isSupportedNode('23.11.1'), false);
  assert.equal(isSupportedNode('22.22.0'), false);
  assert.equal(isSupportedNode('20.19.0'), false);
  assert.equal(isSupportedNode('not-a-version'), false);
});

test('the success path runs on the Node.js 24 runtime', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'the test runtime must be Node.js 24 or later');
  withFixtureRepo((fixture) => {
    const outcome = cli(['version'], fixture);
    assert.equal(outcome.status, 0);
    assert.equal(outcome.stdout, '2.0.0\n');
  });
});

test('JSON output parses, keeps input order, and gives the fields of an ok row and a failed row', () => {
  withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
    const outcome = cli(['notes', '--format', 'json', '--github-repository', 'HagiCode-org/hagi-release-drafter', fixture, shallow], fixture);
    assert.equal(outcome.status, 1);
    const report = JSON.parse(outcome.stdout) as { repositories: Array<Record<string, unknown>> };
    assert.equal(report.repositories.length, 2);

    const [ok, failed] = report.repositories;
    assert.equal(ok.input, fixture);
    assert.equal(ok.status, 'ok');
    assert.equal(ok.version, '2.0.0');
    assert.equal(ok.lastTag, 'v1.0.0');
    assert.equal(ok.commitCount, 4);
    assert.match(String(ok.notes), /^## Changes\n/);
    assert.equal(typeof ok.name, 'string');

    assert.equal(failed.input, shallow);
    assert.equal(failed.status, 'failed');
    assert.match(String(failed.error), /fetch-depth: 0/);
    assert.equal('version' in failed, false, 'a failed row carries no version');
  }));
});

test('two runs over the same unchanged fixtures produce byte-identical output in every format', () => {
  withFixtureRepo((fixture) => withShallowClone(fixture, (shallow) => {
    for (const args of [
      ['version', fixture, shallow],
      ['notes', fixture, shallow],
      ['notes', '--layout', 'merged', fixture, shallow],
      ['notes', '--format', 'json', fixture, shallow],
    ]) {
      const first = cli(args, fixture).stdout;
      const second = cli(args, fixture).stdout;
      assert.equal(first, second, `repeated output for ${args.join(' ')}`);
      assert.doesNotMatch(first, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'no timestamps appear in the output');
    }
  }));
});
