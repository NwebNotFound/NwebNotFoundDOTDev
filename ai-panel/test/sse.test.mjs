// The Worker side of stream resilience: an idle SSE response must still send bytes (Cloudflare
// drops ~100 s of silence, which is exactly a pending approval), and a failing upstream must not
// leak its body to the browser.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pipeSse, sseBody } from "../src/upstream.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A source stream a test can push into and close. */
function controllable() {
  let push;
  let close;
  const stream = new ReadableStream({
    start(controller) {
      push = (text) => controller.enqueue(enc.encode(text));
      close = () => controller.close();
    },
  });
  return { stream, push, close };
}

test("an idle event stream is kept alive with comment frames", async () => {
  const src = controllable();
  const reader = sseBody(src.stream, { pingMs: 25 }).getReader();

  src.push('data: {"event":"run.started"}\n\n');
  assert.match(dec.decode((await reader.read()).value), /run\.started/);

  const ping1 = dec.decode((await reader.read()).value);
  const ping2 = dec.decode((await reader.read()).value);
  assert.equal(ping1, ": ping\n\n");
  assert.equal(ping2, ": ping\n\n");

  src.close();
  await reader.cancel();
});

test("the upstream payload arrives unchanged between pings", async () => {
  const src = controllable();
  const reader = sseBody(src.stream, { pingMs: 25 }).getReader();

  src.push('data: {"event":"thinking.delta","delta":"x"}\n\n');
  const seen = [dec.decode((await reader.read()).value)];
  while (!seen.some((chunk) => chunk.includes("thinking.delta"))) seen.push(dec.decode((await reader.read()).value));

  assert.equal(seen.length, 1, "the first chunk is the payload itself");
  src.close();
  await reader.cancel();
});

test("the stream ends when the upstream ends", async () => {
  const src = controllable();
  const reader = sseBody(src.stream, { pingMs: 1_000 }).getReader();
  src.close();
  const { done } = await reader.read();
  assert.equal(done, true);
});

test("a non-stream upstream failure is a generic 502 without the upstream body", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const upstream = new Response("internal failure at /srv/hermes/api_server.py", {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const res = await pipeSse(upstream);
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.match(text, /upstream_error/);
    assert.doesNotMatch(text, /srv\/hermes|internal failure/);
  } finally {
    console.error = originalError;
  }
});

test("an event stream passes through with SSE headers", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('data: {"event":"run.completed"}\n\n'));
      controller.close();
    },
  });
  const res = await pipeSse(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }), {
    pingMs: 1_000,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  assert.equal(res.headers.get("x-accel-buffering"), "no");
  assert.match(await res.text(), /run\.completed/);
});
