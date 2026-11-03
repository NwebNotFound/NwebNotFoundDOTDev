// Unit tests for the pure chat-stream helpers in public/run-events.js. These encode the two
// regressions this PR fixes: an approval body with exactly three keys, and "false" never being
// shown as a tool result.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  approvalPayload,
  approvalText,
  describeError,
  eventName,
  isTerminalEvent,
  isTerminalStatus,
  reconnectDelay,
  runStatusOf,
  toolFailed,
  toolOutputText,
} from "../public/run-events.js";

test("the approval body carries exactly request_id, execution_generation and choice", () => {
  const { ok, body } = approvalPayload({ request_id: "req_9", execution_generation: 4 }, "once");
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(body).sort(), ["choice", "execution_generation", "request_id"]);
  assert.deepEqual(body, { request_id: "req_9", execution_generation: 4, choice: "once" });
  assert.equal(typeof body.execution_generation, "number");
});

test("the approval id is taken from prompt_id when the event uses that name", () => {
  const { ok, body } = approvalPayload({ prompt_id: "prompt_1", generation: "2" }, "session");
  assert.equal(ok, true);
  assert.deepEqual(body, { request_id: "prompt_1", execution_generation: 2, choice: "session" });
});

test("an approval without a usable id or generation is refused locally", () => {
  for (const event of [
    {},
    { request_id: "req_1" },
    { execution_generation: 1 },
    { request_id: "req_1", execution_generation: "x" },
    { request_id: "req_1", execution_generation: -1 },
  ]) {
    const result = approvalPayload(event, "once");
    assert.equal(result.ok, false, `refused: ${JSON.stringify(event)}`);
    assert.equal(result.error, "approval_context_missing");
    assert.equal(result.body, null);
  }
});

test("a pending_controls snapshot from the Worker can drive the card", () => {
  const { ok, body } = approvalPayload({ pending: { request_id: "req_2", execution_generation: 5 } }, "always");
  assert.equal(ok, true);
  assert.equal(body.request_id, "req_2");
  assert.equal(body.execution_generation, 5);
});

test("a successful tool.completed never renders a boolean", () => {
  const event = { event: "tool.completed", tool: "terminal", error: false, preview: "" };
  assert.equal(toolOutputText(event), "");
  assert.equal(toolFailed(event), false, "error:false is success");
  for (const payload of [
    { output: "a" },
    { result: "b" },
    { stdout: "c" },
    { preview: "d" },
  ]) {
    assert.equal(toolOutputText({ event: "tool.completed", error: false, ...payload }), Object.values(payload)[0]);
  }
});

test("tool.completed prefers its payload over the error field", () => {
  const text = toolOutputText({ event: "tool.completed", output: "exit 0", error: "" });
  assert.equal(text, "exit 0");
  assert.equal(toolOutputText({ event: "tool.completed", error: "command not found" }), "command not found");
  assert.equal(toolFailed({ event: "tool.completed", error: "command not found" }), true);
});

test("objects and arrays become readable JSON, empty ones stay empty", () => {
  assert.equal(toolOutputText({ event: "tool.completed", result: { rows: 2 } }), '{\n  "rows": 2\n}');
  assert.equal(toolOutputText({ event: "tool.completed", result: {} }), "");
  assert.equal(toolOutputText({ event: "tool.completed", result: [] }), "");
});

test("tool failures are detected from the name, a string error, or ok:false", () => {
  assert.equal(toolFailed({ event: "tool.failed" }), true);
  assert.equal(toolFailed({ event: "tool.error" }), true);
  assert.equal(toolFailed({ event: "tool.completed", error: true }), true);
  assert.equal(toolFailed({ event: "tool.completed", ok: false }), true);
  assert.equal(toolFailed({ event: "tool.completed", error: false, ok: true }), false);
  assert.equal(toolFailed({ event: "tool.completed", success: false }), true);
});

test("terminal events end the run, deltas do not", () => {
  assert.equal(isTerminalEvent({ event: "run.completed" }), true);
  assert.equal(isTerminalEvent({ event: "run.failed" }), true);
  assert.equal(isTerminalEvent({ event: "thinking.delta", delta: "x" }), false);
  assert.equal(isTerminalEvent({ event: "tool.completed", error: false }), false);
  assert.equal(isTerminalEvent({ status: "running" }), false);
  assert.equal(isTerminalEvent({ run: { status: "stopped" } }), true);
  assert.equal(isTerminalStatus("COMPLETED"), true);
  assert.equal(isTerminalStatus("running"), false);
  assert.equal(runStatusOf({ status: "Queued" }), "queued");
});

test("event names are normalised across event/type/name", () => {
  assert.equal(eventName({ event: "Tool.Completed" }), "tool.completed");
  assert.equal(eventName({ type: "run.started" }), "run.started");
  assert.equal(eventName({}), "");
});

test("reconnect backoff grows and stays bounded", () => {
  const first = reconnectDelay(0);
  assert.ok(first >= 500 && first < 800, `first delay in range, got ${first}`);
  const later = reconnectDelay(6);
  assert.ok(later >= 8000 && later < 8300, `capped at 8 s + jitter, got ${later}`);
});

test("errors become actionable text, with a retry hint", () => {
  assert.match(describeError({ message: "Load failed" }).text, /Verbindung verloren/);
  assert.equal(describeError({ message: "Load failed" }).retryable, true);
  assert.equal(describeError({ message: "unauthorized" }).retryable, false);
  const mapped = describeError({ data: { error: "upstream_unreachable" } });
  assert.match(mapped.text, /Hermes ist nicht erreichbar/);
  assert.equal(describeError({ data: { error: "approval_failed" } }).text, "Die Freigabe wurde nicht angenommen.");
  assert.equal(describeError({ message: "weird_thing" }).text, "Fehler: weird_thing");
});

test("approvalText shows the command, never an object dump of nothing", () => {
  assert.equal(approvalText({ command: "rm -rf x" }), "rm -rf x");
  assert.equal(approvalText({ description: { a: 1 } }), '{\n  "a": 1\n}');
  assert.equal(approvalText({}), "");
});
