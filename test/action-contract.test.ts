import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

// Contract checks for the public action. These guard the inputs, outputs, publish safety,
// shallow-clone ordering, and the permissions documented for consumers.

/** The subset of a workflow step that the contract checks read. */
interface Step {
  id?: string;
  name?: string;
  shell?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface ActionFile {
  inputs: Record<string, { description?: string; required?: boolean; default?: string }>;
  outputs: Record<string, { description?: string; value: string }>;
  runs: { using: string; steps: Step[] };
}

interface WorkflowFile {
  jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>;
}

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const raw = read('action.yml');
const action = parse(raw) as ActionFile;
const steps: Step[] = action.runs.steps;
const stepIndex = (pattern: RegExp): number => steps.findIndex((step) => pattern.test(step.run ?? ''));

test('declares a composite action with exactly the documented inputs and defaults', () => {
  assert.equal(action.runs.using, 'composite');
  assert.deepEqual(Object.keys(action.inputs).sort(), ['github-token', 'title-template', 'version']);
  assert.equal(action.inputs.version.default, '');
  assert.equal(action.inputs['title-template'].default, 'v{version}');
  assert.equal(action.inputs['github-token'].default, '${{ github.token }}');
  for (const [name, input] of Object.entries(action.inputs)) {
    assert.ok(input.description, `input ${name} needs a description`);
    assert.equal(input.required, false, `input ${name} must be optional`);
  }
});

test('declares exactly the documented outputs, each mapped to a real step output', () => {
  assert.deepEqual(Object.keys(action.outputs).sort(), ['notes-file', 'release-url', 'tag', 'version']);
  const stepIds = new Set(steps.map((step) => step.id).filter(Boolean));
  for (const [name, output] of Object.entries(action.outputs)) {
    const match = /^\$\{\{ steps\.([\w-]+)\.outputs\.([\w-]+) \}\}$/.exec(output.value);
    assert.ok(match, `output ${name} must map to a step output`);
    assert.ok(stepIds.has(match[1]), `output ${name} references unknown step ${match[1]}`);
  }
});

test('no input and no step can enable publishing', () => {
  for (const name of Object.keys(action.inputs)) {
    assert.doesNotMatch(name, /publish|draft/i, `input ${name} must not control publication`);
  }
  assert.doesNotMatch(raw, /--draft=false|--draft false|--latest|release publish/);
  assert.doesNotMatch(read('scripts/publish-draft.sh'), /--draft=false|--draft false|--latest|release publish/);
});

test('every run step declares a shell', () => {
  for (const step of steps.filter((candidate) => candidate.run)) {
    assert.ok(step.shell, `step "${step.name}" needs an explicit shell`);
  }
});

test('the shallow-clone guard is the first step and runs before any node step', () => {
  const guard = stepIndex(/git rev-parse --is-shallow-repository/);
  assert.equal(guard, 0, 'the shallow-clone guard must be the first step');
  const firstNode = steps.findIndex((step) => /\bnode\b/.test(step.run ?? ''));
  assert.ok(firstNode > guard, 'a node step runs before the shallow-clone guard');
  const guardStep = steps[guard].run ?? '';
  assert.match(guardStep, /exit 1/);
  assert.match(guardStep, /fetch-depth: 0/);
  assert.match(guardStep, /fetch-tags: true/);
});

test('the version override is validated before it reaches the script', () => {
  const versionStep = steps.find((step) => step.id === 'version');
  assert.ok(versionStep, 'expected a version step');
    assert.ok((versionStep.run ?? '').includes('^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'), 'expected a stable X.Y.Z pattern');
  assert.match(versionStep.run ?? '', /must be a stable X\.Y\.Z/);
});

test('the publish step runs the draft script with the required environment', () => {
  const publish = steps.find((step) => step.id === 'publish');
  assert.ok(publish, 'expected a publish step');
  assert.match(publish.run ?? '', /scripts\/publish-draft\.sh/);
  for (const variable of ['VERSION', 'TITLE_TEMPLATE', 'NOTES_FILE', 'GH_TOKEN', 'GITHUB_REPOSITORY']) {
    assert.ok(variable in (publish.env ?? {}), `publish step must set ${variable}`);
  }
});

test('the README documents contents: write, no pull-requests permission, and the fetch depth requirement', () => {
  const readme = read('README.md');
  assert.match(readme, /contents: write/);
  assert.match(readme, /fetch-depth: 0/);
  assert.match(readme, /fetch-tags: true/);
  assert.match(readme, /no `pull-requests` permission|does not require `pull-requests`/);
});

test('this repository drafts its own releases with the local action and never publishes', () => {
  const workflowText = read('.github/workflows/release-draft.yml');
  const job = (parse(workflowText) as WorkflowFile).jobs.draft;
  assert.deepEqual(job.permissions, { contents: 'write' });
  const checkout = job.steps.find((step) => /^actions\/checkout@/.test(step.uses ?? ''));
  assert.ok(checkout, 'expected a checkout step');
  assert.equal(checkout.with?.['fetch-depth'], 0);
  assert.equal(checkout.with?.['fetch-tags'], true);
  assert.ok(job.steps.some((step) => step.uses === './'), 'expected a uses: ./ step running this action');
  assert.doesNotMatch(workflowText, /draft: false|--draft=false|--latest/);
});
