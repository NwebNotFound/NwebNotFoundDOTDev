// Tap an SSE stream on its way to the browser: every frame is re-serialised with secrets
// redacted, and every parsed JSON `data:` payload (already redacted) goes to `onFrame` (used to
// record the run into the transcript). Raw upstream bytes are never forwarded.

import { redactText, redactValue } from "./redact.js";

/** A frame larger than this is dropped; parsing resyncs at the next boundary. */
export const MAX_FRAME_BUFFER = 1024 * 1024;

const DROPPED_FRAME = ": frame dropped (too large)\n\n";

/**
 * Parse one SSE frame (no trailing blank line, `\n` line endings). Returns the frame text to
 * forward, redacted, and the redacted JSON payload (or undefined).
 */
export function redactSseFrame(frame) {
  const data = [];
  const other = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      // Per the SSE spec a single leading space after the colon is not part of the value, and
      // consecutive data lines of one event are joined with "\n".
      data.push(line.slice(5).replace(/^ /, ""));
    } else if (line.startsWith(":")) {
      other.push(line); // comments: keep-alives, never shown to a handler
    } else {
      other.push(redactText(line)); // event:, id:, retry: — short, but not ours to trust
    }
  }
  if (!data.length) return { text: other.join("\n"), payload: undefined };
  const raw = data.join("\n");
  let payload;
  let out;
  try {
    payload = redactValue(JSON.parse(raw));
    out = [`data: ${JSON.stringify(payload)}`];
  } catch {
    payload = undefined;
    out = redactText(raw).split("\n").map((l) => `data: ${l}`);
  }
  return { text: [...other, ...out].join("\n"), payload };
}

export function teeSseFrames(body, onFrame, drain, { maxBuffer = MAX_FRAME_BUFFER } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  // True while the tap is skipping an oversized frame until the next frame boundary.
  let skipping = false;
  // A lone "\r" at the end of a chunk may be the first half of a "\r\n" split across chunks.
  let pendingCr = false;

  const handleFrame = (frame, controller) => {
    const { text, payload } = redactSseFrame(frame);
    if (text) controller.enqueue(encoder.encode(text + "\n\n"));
    if (payload === undefined || typeof onFrame !== "function") return;
    try {
      onFrame(payload);
    } catch {
      // a failing recorder must not break the stream
    }
  };

  const feed = (text, controller) => {
    if (pendingCr) {
      text = "\r" + text;
      pendingCr = false;
    }
    if (text.endsWith("\r")) {
      pendingCr = true;
      text = text.slice(0, -1);
    }
    buffer += text.replace(/\r\n?/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (skipping) skipping = false;
      else handleFrame(frame, controller);
    }
    if (buffer.length > maxBuffer) {
      // An unredactable giant: drop it rather than forward it raw. Keep at most one trailing
      // "\n" so a boundary split across chunks is still found.
      buffer = buffer.endsWith("\n") ? "\n" : "";
      if (!skipping) controller.enqueue(encoder.encode(DROPPED_FRAME));
      skipping = true;
    }
  };

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          feed(decoder.decode(value, { stream: true }), controller);
        }
        // Flush the decoder and handle a final frame that had no blank line after it.
        feed(decoder.decode(), controller);
        if (pendingCr) feed("\n", controller);
        const rest = buffer.replace(/^\n+|\n+$/g, "");
        if (rest && !skipping) handleFrame(rest, controller);
        buffer = "";
      } catch {
        // upstream died mid-stream
      } finally {
        if (typeof drain === "function") await Promise.resolve(drain()).catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

/** The redacting re-serialisation without a recorder (quick chat, error streams). */
export function redactSseStream(body) {
  return teeSseFrames(body, null);
}
