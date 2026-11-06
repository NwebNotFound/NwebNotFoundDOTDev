// The transcript tap: every JSON `data:` payload of the stream reaches the recorder, whatever the
// framing, and the browser gets the same frames re-serialised with secrets redacted.

import { test } from "node:test";
import assert from "node:assert/strict";

import { redactSseStream, teeSseFrames } from "../src/sse-tap.js";
import { MASK } from "../src/redact.js";

const enc = new TextEncoder();

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function tap(chunks, opts) {
  const frames = [];
  let drained = false;
  const out = teeSseFrames(streamOf(chunks), (f) => frames.push(f), () => (drained = true), opts);
  const text = await new Response(out).text();
  return { frames, text, drained };
}

test("LF frames are parsed and the bytes pass through", async () => {
  const input = 'data: {"event":"a"}\n\ndata: {"event":"b"}\n\n';
  const { frames, text, drained } = await tap([input]);
  assert.deepEqual(frames, [{ event: "a" }, { event: "b" }]);
  assert.equal(text, input);
  assert.equal(drained, true);
});

test("CRLF and CR framing is understood, also when split across chunks", async () => {
  const { frames } = await tap(['data: {"event":"a"}\r\n\r', '\ndata: {"event":"b"}\r\r', 'data: {"event":"c"}\r\n\r\n']);
  assert.deepEqual(frames, [{ event: "a" }, { event: "b" }, { event: "c" }]);
});

test("a final frame without a trailing blank line is still recorded", async () => {
  const { frames } = await tap(['data: {"event":"run.started"}\n\n', 'data: {"event":"run.completed"}']);
  assert.deepEqual(frames, [{ event: "run.started" }, { event: "run.completed" }]);
});

test("a multi-byte character split across chunks is decoded and flushed", async () => {
  const bytes = enc.encode('data: {"t":"ä"}');
  const { frames } = await tap([bytes.slice(0, bytes.length - 3), bytes.slice(bytes.length - 3)]);
  assert.deepEqual(frames, [{ t: "ä" }]);
});

test("consecutive data lines of one event are joined with a newline", async () => {
  const { frames } = await tap(['event: x\ndata: {"event":\ndata: "multi"}\n\n']);
  assert.deepEqual(frames, [{ event: "multi" }]);
});

test("an oversized frame is dropped and the tap resyncs at the next boundary", async () => {
  const big = "data: " + "x".repeat(200) + "\n";
  const { frames, text } = await tap(
    ['data: {"event":"a"}\n\n', big, big, big, '\n\ndata: {"event":"b"}\n\n'],
    { maxBuffer: 256 },
  );
  assert.deepEqual(frames, [{ event: "a" }, { event: "b" }]);
  assert.ok(!text.includes("x".repeat(200)), "an unredactable giant is not forwarded raw");
  assert.match(text, /^: frame dropped/m);
  assert.match(text, /"event":"b"/);
});

test("a throwing recorder does not break the stream", async () => {
  const out = teeSseFrames(streamOf(['data: {"a":1}\n\ndata: {"a":2}\n\n']), () => {
    throw new Error("boom");
  });
  assert.match(await new Response(out).text(), /"a":2/);
});

test("secrets in a frame are redacted in the stream and in what the recorder sees", async () => {
  const key = "sk-proj-AbCdEf0123456789AbCdEf0123456789";
  const { frames, text } = await tap([
    `data: {"event":"tool.completed","output":"OPENAI_API_KEY=${key}","args":{"password":"hunter2"}}\n\n`,
    `event: message\ndata: plain ${key}\n\n`,
    ": ping\n\n",
  ]);
  assert.ok(!text.includes(key), text);
  assert.ok(!text.includes("hunter2"), text);
  assert.match(text, /^: ping$/m, "comment frames survive");
  assert.match(text, /^event: message$/m);
  assert.equal(frames.length, 1);
  assert.ok(frames[0].output.includes(MASK));
  assert.equal(frames[0].args.password, MASK);
  assert.equal(JSON.stringify(frames).includes(key), false);
});

test("redactSseStream redacts without a recorder and keeps [DONE]", async () => {
  const out = redactSseStream(
    streamOf(['data: {"choices":[{"delta":{"content":"ghp_0123456789abcdefghijABCDEFGHIJ012345"}}]}\n\n', "data: [DONE]\n\n"]),
  );
  const text = await new Response(out).text();
  assert.doesNotMatch(text, /ghp_/);
  assert.match(text, /data: \[DONE\]/);
});
