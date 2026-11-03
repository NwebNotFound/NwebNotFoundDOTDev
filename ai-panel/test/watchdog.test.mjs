// Guard rail for the origin watchdog. It runs on Nils' desktop with his own rights, so the two
// things that must never drift are: it may only ever start the three AIPanel tasks (never a name
// that came from outside), and it may not print anything secret.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(path.join(here, "..", "origin-proxy", "watchdog.ps1"), "utf8");

const allowListLine =
  /\$AllowedTasks = @\("AIPanel_proxy", "AIPanel_dashboard", "AIPanel_tunnel"\)/;

test("the restart allowlist is hard-coded to the three AIPanel tasks", () => {
  assert.match(SCRIPT, allowListLine, "the allowlist is written out literally, not built from input");

  // One call site, and it is the guarded helper — nothing else may start a task.
  const calls = SCRIPT.match(/Start-ScheduledTask -TaskName/g) || [];
  assert.equal(calls.length, 1, "exactly one call site, and it sits inside the guarded helper");

  const start = SCRIPT.indexOf("function Start-AllowedTask");
  const end = SCRIPT.indexOf("function Get-ServiceEntry");
  assert.ok(start > 0 && end > start, "the helper exists");
  const helper = SCRIPT.slice(start, end);
  assert.match(helper, /Start-ScheduledTask -TaskName/, "the only start happens here");
  const guard = helper.indexOf("$AllowedTasks -notcontains $TaskName");
  const use = helper.indexOf("Start-ScheduledTask -TaskName");
  assert.ok(guard > 0, "the name is checked against the allowlist");
  assert.ok(guard < use, "checked before it is started");
});

test("every task the script knows about is inside the allowlist", () => {
  const declared = [...SCRIPT.matchAll(/Task = "(AIPanel_[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(declared.sort(), ["AIPanel_dashboard", "AIPanel_proxy", "AIPanel_tunnel"]);
  const allowed = [...(SCRIPT.match(allowListLine)?.[0] || "").matchAll(/"(AIPanel_[a-z]+)"/g)].map((m) => m[1]);
  for (const task of declared) assert.ok(allowed.includes(task), `${task} is allowlisted`);
});

test("the watchdog prints no secret and keeps RunLevel Limited", () => {
  assert.match(SCRIPT, /-RunLevel Limited/, "a scheduled task must not run elevated");
  // No environment dumps and no credential-shaped output.
  assert.doesNotMatch(SCRIPT, /Get-ChildItem Env:/i);
  assert.doesNotMatch(SCRIPT, /ConvertTo-Json/i, "nothing is serialised out of the environment");
  for (const line of SCRIPT.split(/\r?\n/)) {
    if (!/(Write-Host|Write-Output|Write-Warning)/.test(line)) continue;
    assert.doesNotMatch(line, /secret|password|token|api[_-]?key|PANEL_SECRET/i, `quiet line leaks: ${line.trim()}`);
  }
});
