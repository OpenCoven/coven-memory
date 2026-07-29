import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const syntheticPrivacyPattern = ["agent", "example", "telegram", "direct", "123456"].join(":");
const expectedGitleaksVersion = "8.30.1";

async function createGuardFixture() {
  const directory = await mkdtemp(join(tmpdir(), "coven-memory-guard-"));
  const scriptsDirectory = join(directory, "scripts");
  const binDirectory = join(directory, "bin");
  const invocationLog = join(directory, "gitleaks.log");

  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  const guardScript = await readFile(join(repositoryRoot, "scripts/guard-scan.sh"), "utf8");
  await writeFile(
    join(scriptsDirectory, "guard-scan.sh"),
    guardScript.replace('export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"', 'export PATH="$PATH"')
  );
  await copyFile(join(repositoryRoot, ".gitleaks.toml"), join(directory, ".gitleaks.toml"));
  await copyFile(join(repositoryRoot, ".gitleaks-default.toml"), join(directory, ".gitleaks-default.toml"));
  await copyFile(join(repositoryRoot, ".gitleaks-version"), join(directory, ".gitleaks-version"));
  await copyFile(join(repositoryRoot, "scripts/privacy-patterns.sh"), join(scriptsDirectory, "privacy-patterns.sh"));
  await writeFile(join(directory, ".gitleaks-baseline.json"), "[]\n");
  await writeFile(
    join(binDirectory, "gitleaks"),
    "#!/usr/bin/env bash\nif [ \"$1\" = version ]; then\n  printf 'gitleaks version %s\\n' \"${GITLEAKS_VERSION}\"\nelse\n  printf '%s\\n' \"$*\" >> \"$GITLEAKS_LOG\"\nfi\n"
  );
  await chmod(join(binDirectory, "gitleaks"), 0o755);

  runOk("git", ["init", "-q"], directory);
  runOk("git", ["config", "user.email", "guard@example.invalid"], directory);
  runOk("git", ["config", "user.name", "Guard Test"], directory);
  runOk("git", ["config", "commit.gpgsign", "false"], directory);
  runOk("git", ["add", "scripts/guard-scan.sh", "scripts/privacy-patterns.sh", ".gitleaks.toml"], directory);
  runOk("git", ["commit", "-qm", "guard fixture"], directory);

  return { binDirectory, directory, invocationLog };
}

function run(command, args, cwd, environment = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment }
  });
}

function runOk(command, args, cwd, environment = {}) {
  const result = run(command, args, cwd, environment);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function runGuard(fixture, environment = {}) {
  return run("bash", ["scripts/guard-scan.sh"], fixture.directory, {
    GITLEAKS_LOG: fixture.invocationLog,
    GITLEAKS_VERSION: expectedGitleaksVersion,
    PATH: `${fixture.binDirectory}:${process.env.PATH}`,
    ...environment
  });
}

async function withGuardFixture(callback) {
  const fixture = await createGuardFixture();
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.directory, { force: true, recursive: true });
  }
}

test("runs both baseline-aware gitleaks configurations", async () => {
  await withGuardFixture(async (fixture) => {
    const result = runGuard(fixture);
    assert.equal(result.status, 0, result.stderr);

    const invocations = (await readFile(fixture.invocationLog, "utf8"))
      .trim()
      .split("\n");
    assert.equal(invocations.length, 2);
    assert.match(invocations[0], /--config .gitleaks\.toml/);
    assert.match(invocations[0], /--baseline-path .gitleaks-baseline\.json/);
    assert.match(invocations[1], /--config .gitleaks-default\.toml/);
    assert.match(invocations[1], /--baseline-path .gitleaks-baseline\.json/);
    assert.match(invocations[1], /--ignore-gitleaks-allow/);
  });
});

test("pins the gitleaks version across local guard and CI", async () => {
  const version = (await readFile(join(repositoryRoot, ".gitleaks-version"), "utf8")).trim();
  const workflow = await readFile(join(repositoryRoot, ".github/workflows/privacy-guard.yml"), "utf8");
  assert.equal(version, expectedGitleaksVersion);
  assert.match(workflow, /GITLEAKS_VERSION="\$\(tr -d '\[:space:\]' < \.gitleaks-version\)"/);
  assert.match(workflow, /gitleaks_\$\{GITLEAKS_VERSION\}_linux_x64\.tar\.gz/);

  await withGuardFixture(async (fixture) => {
    const result = runGuard(fixture, { GITLEAKS_VERSION: "8.21.2" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /expected gitleaks 8\.30\.1, found 8\.21\.2/);
  });
});

test("shares shell patterns and enforces gitleaks privacy categories", async () => {
  const patterns = await readFile(join(repositoryRoot, "scripts/privacy-patterns.sh"), "utf8");
  const guard = await readFile(join(repositoryRoot, "scripts/guard-scan.sh"), "utf8");
  const workflow = await readFile(join(repositoryRoot, ".github/workflows/privacy-guard.yml"), "utf8");
  const gitleaks = await readFile(join(repositoryRoot, ".gitleaks.toml"), "utf8");

  assert.match(patterns, /^PATTERNS='/m);
  assert.match(patterns, /^PLACEHOLDERS='/m);
  assert.match(patterns, /^ALLOW_MARKERS='/m);
  const expectedIds = patterns.match(/^GITLEAKS_RULE_IDS='([^']+)'$/m)?.[1].split(" ");
  assert.ok(expectedIds);
  assert.match(guard, /source scripts\/privacy-patterns\.sh/);
  assert.doesNotMatch(guard, /^PATTERNS=/m);
  assert.match(workflow, /source scripts\/privacy-patterns\.sh/);
  assert.doesNotMatch(workflow, /^\s+PATTERNS=/m);
  const actualIds = [...gitleaks.matchAll(/^id = "([^"]+)"$/gm)].map((match) => match[1]);
  assert.deepEqual(actualIds, expectedIds);
});

test("accepts the documented marker in the plain-pattern scan", async () => {
  await withGuardFixture(async (fixture) => {
    await writeFile(
      join(fixture.directory, "custom-rule-example.md"),
      `${syntheticPrivacyPattern} gitleaks:allow\n`
    );
    runOk("git", ["add", "custom-rule-example.md"], fixture.directory);
    runOk("git", ["commit", "-qm", "marker fixture"], fixture.directory);

    const result = runGuard(fixture);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("accepts documented placeholder home paths portably", async () => {
  await withGuardFixture(async (fixture) => {
    const placeholderHomePath = [
      "/Users",
      "example",
      ".coven",
      "workspaces",
      "demo"
    ].join("/");
    await writeFile(
      join(fixture.directory, "placeholder-example.md"),
      `${placeholderHomePath}\n`
    );
    runOk("git", ["add", "placeholder-example.md"], fixture.directory);
    runOk("git", ["commit", "-qm", "placeholder fixture"], fixture.directory);

    const result = runGuard(fixture);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects an unmarked privacy pattern with the approved remediation", async () => {
  await withGuardFixture(async (fixture) => {
    await writeFile(join(fixture.directory, "unmarked-example.md"), `${syntheticPrivacyPattern}\n`);
    runOk("git", ["add", "unmarked-example.md"], fixture.directory);
    runOk("git", ["commit", "-qm", "unmarked fixture"], fixture.directory);

    const result = runGuard(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Add inline marker: gitleaks:allow/);
  });
});

test("CI delegates history scanning to the baseline-aware guard script", async () => {
  const workflow = await readFile(join(repositoryRoot, ".github/workflows/privacy-guard.yml"), "utf8");
  assert.doesNotMatch(workflow, /run: gitleaks detect/);
  assert.match(workflow, /run: bash scripts\/guard-scan\.sh/);
});

test("instruction policy rejects executable bare Beads sync commands", async () => {
  const currentPolicy = run("bash", ["scripts/check-instruction-sync.sh"], repositoryRoot);
  assert.equal(currentPolicy.status, 0, currentPolicy.stderr);

  const fixtureDirectory = await mkdtemp(join(tmpdir(), "coven-memory-instructions-"));
  try {
    await writeFile(join(fixtureDirectory, "AGENTS.md"), "```bash\nbd dolt push\n```\n");
    runOk("git", ["init", "-q"], fixtureDirectory);
    runOk("git", ["config", "user.email", "guard@example.invalid"], fixtureDirectory);
    runOk("git", ["config", "user.name", "Guard Test"], fixtureDirectory);
    runOk("git", ["config", "commit.gpgsign", "false"], fixtureDirectory);
    runOk("git", ["add", "AGENTS.md"], fixtureDirectory);
    runOk("git", ["commit", "-qm", "instruction fixture"], fixtureDirectory);

    const policy = run(
      "bash",
      [join(repositoryRoot, "scripts/check-instruction-sync.sh")],
      fixtureDirectory
    );
    assert.notEqual(policy.status, 0);
    assert.match(policy.stderr, /Use scripts\/bd-dolt-push\.sh/);
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});

test("instruction policy covers every supported agent-instruction filename", async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "coven-memory-claude-instructions-"));
  try {
    await writeFile(join(fixtureDirectory, "CLAUDE.md"), "```bash\nbd dolt push\n```\n");
    runOk("git", ["init", "-q"], fixtureDirectory);
    runOk("git", ["config", "user.email", "guard@example.invalid"], fixtureDirectory);
    runOk("git", ["config", "user.name", "Guard Test"], fixtureDirectory);
    runOk("git", ["config", "commit.gpgsign", "false"], fixtureDirectory);
    runOk("git", ["add", "CLAUDE.md"], fixtureDirectory);
    runOk("git", ["commit", "-qm", "instruction fixture"], fixtureDirectory);

    const policy = run(
      "bash",
      [join(repositoryRoot, "scripts/check-instruction-sync.sh")],
      fixtureDirectory
    );
    assert.notEqual(policy.status, 0);
    assert.match(policy.stderr, /Use scripts\/bd-dolt-push\.sh/);
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});
